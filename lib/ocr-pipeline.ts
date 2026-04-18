import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";

import { getLatestSonnetModel } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDocumentAIClient, PROCESSOR_NAME } from "@/lib/google-document-ai";

const CATEGORY_PROMPT = `You are an expert at classifying HOA/COA governing documents.
Read the document text and return ONLY a valid JSON object with a single field:
{"suggested_category": "<category>"}

The category MUST be exactly one of:
"CC&Rs / Declaration", "Bylaws", "Amendments", "Articles of Incorporation", "Financial Reports", "Insurance Certificate", "Reserve Study", "Budget", "Meeting Minutes", "Rules & Regulations", "Site Plan / Map", "FHA/VA Certification", "Management Agreement", "Other"

Choose "CC&Rs / Declaration" for declarations, covenants, CC&Rs, declarant documents, or deed restrictions.
Choose "Articles of Incorporation" for articles of incorporation, certificate of formation, or certificate of incorporation.
Choose "Site Plan / Map" for site plans, plot plans, plat maps, community maps, property maps, or floor plans.
Choose "FHA/VA Certification" for FHA approval letters, VA certification, HUD condo approval, or any document certifying FHA or VA eligibility.
Choose "Management Agreement" for management contracts, property management agreements, or service agreements between the HOA and a management company.
Choose "Other" only if the document truly does not fit any category above.
Never return null — always pick the best match.`;

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
- meeting_date (if this is meeting minutes: the date of the meeting in YYYY-MM-DD format; if the document covers multiple meetings use the most prominent/recent date)
- meeting_type (if this is meeting minutes: the type of meeting — one of "Annual", "Budget", "Board", "Special", "Regular", or another descriptive label found in the document)
- document_title (a short, specific, descriptive title for this document in 3–7 words, e.g. "Amendment to Pet Policy", "Parking and Vehicle Rules", "2024 Reserve Study", "Amendment No. 3 to CC&Rs", "Pool and Spa Rules". Do NOT just repeat the category name. If the document has an official title, use that. Otherwise write a concise descriptive label.)

Return null for any field not found in the document.`;

const CHUNK_SIZE = 14; // stay safely under the 15-page non-imageless limit

async function splitPdfIntoChunks(pdfBuffer: Buffer): Promise<Buffer[]> {
  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer);
  } catch (err) {
    // Encrypted or malformed PDF — send the original bytes directly to Document AI.
    // Document AI handles owner-locked PDFs better than re-encoded chunks would.
    const reason = err instanceof Error && err.message.toLowerCase().includes("encrypt")
      ? "encrypted"
      : "malformed";
    console.warn(`[OCR] PDF is ${reason} — sending original buffer directly to Document AI`);
    return [pdfBuffer];
  }

  const totalPages = srcDoc.getPageCount();
  const chunks: Buffer[] = [];

  for (let start = 0; start < totalPages; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, totalPages);
    const chunkDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) chunkDoc.addPage(page);
    const bytes = await chunkDoc.save();
    chunks.push(Buffer.from(bytes));
  }

  return chunks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const stripped = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

async function callClaudeForCategory(rawText: string): Promise<string | undefined> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;

  try {
    const model = process.env.ANTHROPIC_MODEL ?? await getLatestSonnetModel();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 64,
        system: CATEGORY_PROMPT,
        messages: [{ role: "user", content: `Document text:\n\n${rawText.slice(0, 8000)}` }],
      }),
    });

    if (!response.ok) {
      console.error("[CLAUDE_CAT] API error:", response.status);
      return undefined;
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = payload.content
      ?.filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("") ?? "";

    const parsed = safeJsonParse(text);
    return typeof parsed.suggested_category === "string" ? parsed.suggested_category.trim() : undefined;
  } catch (err) {
    console.error("[CLAUDE_CAT] Exception:", err);
    return undefined;
  }
}

async function callClaudeForFieldExtraction(rawText: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[CLAUDE] No ANTHROPIC_API_KEY set");
    return {};
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? await getLatestSonnetModel(),
        max_tokens: 10000,
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
      const errText = await response.text();
      console.error("[CLAUDE] API error:", response.status, errText);
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

    console.log("[CLAUDE] raw response (first 500):", text.slice(0, 500));
    const parsed = safeJsonParse(text);
    console.log("[CLAUDE] suggested_category:", parsed.suggested_category);
    return parsed;
  } catch (err) {
    console.error("[CLAUDE] Exception:", err);
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
): Promise<{ success: boolean; txtPath?: string; jsonPath?: string; inferredCategory?: string; extractedFields?: Record<string, unknown>; error?: string }> {
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
      const chunks = await splitPdfIntoChunks(fileBuffer);
      const textParts: string[] = [];
      let totalPageCount = 0;

      for (const chunk of chunks) {
        const [result] = await client.processDocument({
          name: PROCESSOR_NAME,
          rawDocument: {
            content: chunk.toString("base64"),
            mimeType,
          },
        });
        const chunkText = result.document?.text ?? "";
        if (chunkText.trim()) textParts.push(chunkText);
        totalPageCount += result.document?.pages?.length ?? 0;
      }

      rawText = textParts.join("\n\n");
      pageCount = totalPageCount || chunks.length;

      if (!rawText.trim()) {
        // Document AI returned nothing — likely a fully user-password-protected PDF
        // or a pure image with no detectable text layer.
        // Return a partial success so the document record is still saved.
        console.warn("[OCR] Document AI returned empty text — document saved without OCR data");
        return { success: true, inferredCategory: undefined, extractedFields: {} };
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

    // Step 4: category classification + field extraction in parallel.
    const [inferredCategory, extractedFields] = await Promise.all([
      callClaudeForCategory(rawText),
      callClaudeForFieldExtraction(rawText),
    ]);

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

    return { success: true, txtPath, jsonPath, inferredCategory, extractedFields };
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
