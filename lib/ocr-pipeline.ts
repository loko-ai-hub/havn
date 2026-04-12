import mammoth from "mammoth";

import { createAdminClient } from "@/lib/supabase/admin";
import { createDocumentAIClient, PROCESSOR_NAME } from "@/lib/google-document-ai";

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from HOA/COA governing documents.
Extract all relevant fields from the provided document text and return ONLY a valid JSON object with no additional text or markdown.

Extract these fields if present:
- association_name
- association_type (HOA, COA, etc.)
- state
- county
- monthly_assessment
- special_assessments (array)
- management_company
- management_contact_name
- management_contact_email
- management_contact_phone
- insurance_company
- insurance_policy_number
- insurance_expiry_date
- insurance_liability_amount
- reserve_fund_balance
- fiscal_year_end
- total_units
- legal_description
- tax_id
- board_members (array of names)
- pet_restrictions
- rental_restrictions
- parking_restrictions
- website
- mailing_address

Return null for any field not found in the document.`;

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

async function callClaudeForFieldExtraction(rawText: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return {};

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        max_tokens: 2000,
        system: EXTRACTION_PROMPT,
        messages: [
          {
            role: "user",
            content: `Document text:\n\n${rawText.slice(0, 180000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const text =
      payload.content
        ?.filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n") ?? "{}";

    return safeJsonParse(text);
  } catch {
    return {};
  }
}

export async function processDocumentOCR(
  fileBuffer: Buffer,
  mimeType: string,
  communityId: string,
  organizationId: string,
  originalFilename: string,
  documentCategory: string
): Promise<{ success: boolean; txtPath?: string; jsonPath?: string; error?: string }> {
  const admin = createAdminClient();

  let rawText = "";
  let pageCount = 1;

  try {
    // Step 1/2: DOCX uses mammoth; PDF uses Google Document AI.
    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      rawText = result.value || "";
      pageCount = 1;
    } else {
      const client = createDocumentAIClient();
      const [result] = await client.processDocument({
        name: PROCESSOR_NAME,
        rawDocument: {
          content: fileBuffer.toString("base64"),
          mimeType,
        },
      });

      rawText = result.document?.text ?? "";
      pageCount = result.document?.pages?.length ?? 1;

      if (!rawText.trim()) {
        throw new Error("OCR returned empty text.");
      }
    }

    // Step 3: save raw text to storage.
    const txtPath = `community-documents/${communityId}/${Date.now()}_ocr.txt`;
    const textUpload = await admin.storage
      .from("community-documents")
      .upload(txtPath, Buffer.from(rawText, "utf-8"), {
        contentType: "text/plain; charset=utf-8",
        upsert: false,
      });

    if (textUpload.error) {
      throw new Error(textUpload.error.message);
    }

    // Step 4: Claude field extraction.
    const extractedFields = await callClaudeForFieldExtraction(rawText);

    // Step 5: save extracted JSON.
    const jsonPath = `community-documents/${communityId}/${Date.now()}_fields.json`;
    const jsonUpload = await admin.storage
      .from("community-documents")
      .upload(jsonPath, Buffer.from(JSON.stringify(extractedFields, null, 2), "utf-8"), {
        contentType: "application/json; charset=utf-8",
        upsert: false,
      });

    if (jsonUpload.error) {
      throw new Error(jsonUpload.error.message);
    }

    // Step 6: update latest in-flight community document row.
    const { data: pendingRows } = await admin
      .from("community_documents")
      .select("id")
      .eq("community_id", communityId)
      .eq("organization_id", organizationId)
      .eq("original_filename", originalFilename)
      .eq("document_category", documentCategory)
      .in("ocr_status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    const latestId = pendingRows?.[0]?.id as string | undefined;

    if (latestId) {
      await admin
        .from("community_documents")
        .update({
          storage_path_txt: txtPath,
          storage_path_json: jsonPath,
          ocr_status: "complete",
          page_count: pageCount,
        })
        .eq("id", latestId);
    }

    return { success: true, txtPath, jsonPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR processing failed.";

    const { data: pendingRows } = await admin
      .from("community_documents")
      .select("id")
      .eq("community_id", communityId)
      .eq("organization_id", organizationId)
      .eq("original_filename", originalFilename)
      .eq("document_category", documentCategory)
      .in("ocr_status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    const latestId = pendingRows?.[0]?.id as string | undefined;
    if (latestId) {
      await admin
        .from("community_documents")
        .update({ ocr_status: "failed" })
        .eq("id", latestId);
    }

    return { success: false, error: message };
  }
}
