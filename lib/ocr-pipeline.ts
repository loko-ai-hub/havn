import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractTextFromBuffer } from "@/lib/pdf-text";
import { resolveAndPersistMergeTags } from "@/lib/resolve-merge-tags";

const CATEGORY_PROMPT = `You are an expert at classifying HOA/COA governing documents.
Read the document text and return ONLY a valid JSON object with a single field:
{"suggested_category": "<category>"}

The category MUST be exactly one of the following (these match the legal
attachment categories state templates expect; copy verbatim):
"Declaration and amendments", "Bylaws and amendments", "Rules and regulations", "Articles of incorporation", "Current operating budget", "Most recent balance sheet and income/expense statement", "Reserve study (most recent) – attachment supplements but does not substitute for the (1)(m) disclosure on the face of the certificate", "Certificate of insurance", "Meeting minutes (most recent annual and board)", "WUCIOA buyer notice (for RCW 64.90.640 communities)", "Site Plan / Map", "FHA/VA Certification", "Management Agreement", "Other"

Classification guidance:
- "Declaration and amendments" — declarations, CC&Rs, deed restrictions, covenants, and any amendments to those instruments.
- "Bylaws and amendments" — bylaws plus any amendments to the bylaws.
- "Rules and regulations" — association rules, regulations, policies.
- "Articles of incorporation" — articles of incorporation, certificate of formation, certificate of incorporation.
- "Current operating budget" — the operating budget for the current fiscal year.
- "Most recent balance sheet and income/expense statement" — balance sheets, income statements, P&L, audited or unaudited financial statements.
- "Reserve study (most recent) – attachment supplements but does not substitute for the (1)(m) disclosure on the face of the certificate" — any reserve study. Use this full string verbatim.
- "Certificate of insurance" — insurance certificates, ACORD forms, evidence of insurance.
- "Meeting minutes (most recent annual and board)" — minutes of annual or board meetings.
- "WUCIOA buyer notice (for RCW 64.90.640 communities)" — the statutory buyer notice required by WUCIOA.
- "Site Plan / Map" — site plans, plot plans, plat maps, community maps, property maps, floor plans.
- "FHA/VA Certification" — FHA approval letters, VA certification, HUD condo approval.
- "Management Agreement" — management contracts, property management agreements, service agreements between the HOA and a management company.
- "Other" — only if the document truly does not fit any category above.

Never return null — always pick the best match. Copy the chosen category string verbatim, including parentheticals and long-form text.`;

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from HOA/COA governing documents.
Extract all relevant fields from the provided document text and return ONLY a valid JSON object with no additional text or markdown.

Extract these fields if present:
- association_name
- association_type (HOA, COA, etc.)
- state
- county
- assessment (the regular periodic dues amount per unit — also called HOA dues, monthly assessment, maintenance fee. Does not include special assessments.)
- special_assessments (array)
- management_company
- management_contact_name
- management_contact_email
- management_contact_phone
- insurance_company (the underwriting carrier — e.g. "State Farm", "Travelers")
- insurance_policy_number
- insurance_expiry_date
- insurance_liability_amount
- insurance_agent_name (the broker / producer / agent listed on the COI as the contact, NOT the underwriter)
- insurance_agent_company (the brokerage / agency that placed the policy — distinct from the underwriting carrier)
- insurance_agent_email
- insurance_agent_phone
- insurance_agent_address (the agent's mailing address, if shown)
- reserve_fund_balance
- fiscal_year_start (the FIRST date of the association's fiscal/billing year — usually a month + day like "January 1" or a full date if the bylaws specify one. Look in the bylaws / declaration / budget; phrases like "fiscal year shall begin on", "fiscal year of the Association is", "billing year runs from").
- fiscal_year_end (the LAST date of the fiscal/billing year — usually a month + day like "December 31". Same sources as fiscal_year_start.)
- total_units
- legal_description
- tax_id
- board_members (array of names)
- pet_restrictions
- rental_restrictions
- parking_restrictions
- assessment_frequency (how often dues are billed: one of "Monthly", "Quarterly", "Semi-Annually", "Annually", or another label found in the bylaws/declaration)
- first_right_of_refusal (true/false — whether the association has a right of first refusal to purchase units before a third-party sale. Look in the declaration / CC&Rs.)
- fha_va_approved (true/false — whether the association is FHA or VA approved for mortgage purposes. Look on FHA/VA certification documents.)
- fidelity_bond (the fidelity bond / crime policy coverage amount. Look in the bylaws or insurance certificate.)
- website
- mailing_address
- meeting_date (if this is meeting minutes: the date of the meeting in YYYY-MM-DD format; if the document covers multiple meetings use the most prominent/recent date)
- meeting_type (if this is meeting minutes: the type of meeting — one of "Annual", "Budget", "Board", "Special", "Regular", or another descriptive label found in the document)
- document_title (a short, specific, descriptive title for this document in 3–7 words, e.g. "Amendment to Pet Policy", "Parking and Vehicle Rules", "2024 Reserve Study", "Amendment No. 3 to CC&Rs", "Pool and Spa Rules". Do NOT just repeat the category name. If the document has an official title, use that. Otherwise write a concise descriptive label.)

Return null for any field not found in the document.`;

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

const CategoryOutputSchema = z.object({
  suggested_category: z.string(),
});

// Hard ceiling on individual Claude calls inside the OCR background block.
// 60s is comfortably above p99 latency for these prompts and prevents a
// hung gateway from consuming the function's remaining lifetime.
const CLAUDE_TIMEOUT_MS = 60_000;

type CategoryCallResult = {
  category?: string;
  error?: string;
};

async function callClaudeForCategory(rawText: string): Promise<CategoryCallResult> {
  console.log(`[OCR_CATEGORY] calling model=${BEST_MODEL} textLen=${rawText.length}`);
  try {
    const result = await generateText({
      model: BEST_MODEL,
      output: Output.object({ schema: CategoryOutputSchema }),
      system: CATEGORY_PROMPT,
      prompt: `Document text:\n\n${rawText.slice(0, 8000)}`,
      abortSignal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    });
    console.log(
      `[OCR_CATEGORY] result keys=${Object.keys(result).join(",")} text=${(result.text ?? "").slice(0, 200)} output=${JSON.stringify(result.output)}`
    );
    const suggested = result.output?.suggested_category?.trim();
    return { category: suggested && suggested.length > 0 ? suggested : undefined };
  } catch (err) {
    console.error("[OCR_CATEGORY] Exception:", err);
    const message = err instanceof Error ? err.message : "Classifier failed.";
    return { error: message };
  }
}

async function callClaudeForFieldExtraction(
  rawText: string
): Promise<Record<string, unknown>> {
  console.log(`[OCR_EXTRACT] calling model=${BEST_MODEL} textLen=${rawText.length}`);
  try {
    const { text } = await generateText({
      model: BEST_MODEL,
      system: EXTRACTION_PROMPT,
      prompt: `Document text:\n\n${rawText.slice(0, 180000)}`,
      abortSignal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    });
    if (!text) {
      console.log("[OCR_EXTRACT] empty text response");
      return {};
    }
    console.log("[OCR_EXTRACT] raw response (first 500):", text.slice(0, 500));
    return safeJsonParse(text);
  } catch (err) {
    console.error("[OCR_EXTRACT] Exception:", err);
    return {};
  }
}

export async function processDocumentOCR(
  fileBuffer: Buffer,
  mimeType: string,
  communityId: string,
  organizationId: string,
  originalFilename: string,
  documentCategory: string,
  documentId: string
): Promise<{ success: boolean; txtPath?: string; jsonPath?: string; inferredCategory?: string; extractedFields?: Record<string, unknown>; pageCount?: number; error?: string; classifierFailed?: boolean; classifierError?: string }> {
  // The `documentId` param is the row this OCR pass corresponds to. Earlier
  // versions looked it up by (community_id, organization_id, filename,
  // category) which raced with archive / dedup / cleanup-cron updates and
  // sometimes silently no-op'd, leaving rows wedged at processing.
  void organizationId;
  void originalFilename;
  void documentCategory;

  const admin = createAdminClient();

  try {
    // Step 1/2: extract text via shared helper (mammoth for DOCX, Document AI for PDF).
    const { rawText, pageCount } = await extractTextFromBuffer(fileBuffer, mimeType);

    const isPdf = mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (isPdf && !rawText.trim()) {
      // Document AI returned nothing — likely a fully user-password-protected PDF
      // or a pure image with no detectable text layer. Mark the row complete so
      // the user isn't stuck waiting on a doc we'll never extract from.
      console.warn("[OCR] Document AI returned empty text — marking complete with no OCR data");
      await admin
        .from("community_documents")
        .update({ ocr_status: "complete", page_count: pageCount })
        .eq("id", documentId);
      return { success: true, inferredCategory: undefined, extractedFields: {}, pageCount };
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
    const [categoryResult, extractedFields] = await Promise.all([
      callClaudeForCategory(rawText),
      callClaudeForFieldExtraction(rawText),
    ]);
    const inferredCategory = categoryResult.category;
    const classifierError = categoryResult.error;

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

    // Step 6: update the row directly by its id. No fragile lookup, no
    // racing with cleanup / archive flows.
    await admin
      .from("community_documents")
      .update({
        storage_path_txt: txtPath,
        storage_path_json: jsonPath,
        ocr_status: "complete",
        page_count: pageCount,
      })
      .eq("id", documentId);

    // Step 7: hand the extracted JSON to Claude Opus for merge-tag
    // resolution + cache upsert. Non-fatal if this step fails — OCR data
    // is already persisted; resolution can be retried.
    try {
      const { resolution, persist } = await resolveAndPersistMergeTags(
        extractedFields,
        {
          communityId,
          sourceDocumentId: documentId,
        }
      );
      console.log(
        `[OCR] Merge-tag resolution: ${resolution.resolved.length} resolved, ${persist.cached} cached, ${resolution.unmapped.length} unmapped`
      );
    } catch (resolveErr) {
      console.warn("[OCR] Merge-tag resolution failed (non-fatal):", resolveErr);
    }

    return {
      success: true,
      txtPath,
      jsonPath,
      inferredCategory,
      extractedFields,
      pageCount,
      classifierFailed: !!classifierError,
      classifierError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR processing failed.";
    await admin
      .from("community_documents")
      .update({ ocr_status: "failed" })
      .eq("id", documentId);
    return { success: false, error: message };
  }
}
