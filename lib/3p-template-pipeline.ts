/**
 * Third-party template ingestion orchestrator.
 *
 * Runs after a requester uploads a vendor form and the order is paid.
 * Downloads the PDF from Supabase Storage, OCR's it, hands the extracted
 * text to `ingestExternalTemplate` for registry mapping, asks Claude for
 * proposals on any unmapped labels, and writes everything back to the
 * `third_party_templates` row. Finally notifies Havn staff that a new 3P
 * form is awaiting review.
 *
 * Designed to be fire-and-forget safe: failures mark the row
 * `ingest_status: 'failed'` + store the error so it's visible in God
 * Mode; the caller (Stripe webhook) doesn't need to await completion.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { extractTextFromBuffer } from "@/lib/pdf-text";
import {
  ingestExternalTemplate,
  type ExternalTemplateIngestion,
} from "@/lib/ingest-external-template";
import { proposeRegistryFields } from "@/lib/propose-registry-fields";
import { send3pReviewNeeded } from "@/lib/resend";
import { GOD_MODE_EMAILS } from "@/app/god-mode/constants";

const BUCKET_NAME = "third-party-templates";

export type IngestionRunResult = {
  ok: boolean;
  error?: string;
  mappedCount?: number;
  unmappedCount?: number;
  autoFillCoveragePct?: number;
  proposalsGenerated?: number;
};

/**
 * Drive the full pipeline for a single `third_party_templates` row. Idempotent:
 * running it twice on the same row overwrites the previous ingestion.
 */
export async function runThirdPartyIngestion(params: {
  thirdPartyTemplateId: string;
}): Promise<IngestionRunResult> {
  const admin = createAdminClient();
  const id = params.thirdPartyTemplateId;

  // 1. Load the row.
  const { data: row, error: loadErr } = await admin
    .from("third_party_templates")
    .select(
      "id, order_id, storage_path_pdf, mime_type, original_filename"
    )
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) {
    return { ok: false, error: loadErr?.message ?? "3P template row not found" };
  }

  // Mark as processing.
  await admin
    .from("third_party_templates")
    .update({ ingest_status: "processing", ingest_error: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    // 2. Download the PDF from Storage.
    const { data: blob, error: dlErr } = await admin.storage
      .from(BUCKET_NAME)
      .download(row.storage_path_pdf as string);
    if (dlErr || !blob) {
      throw new Error(`Download failed: ${dlErr?.message ?? "empty blob"}`);
    }
    const fileBuffer = Buffer.from(await blob.arrayBuffer());
    const mimeType = (row.mime_type as string | null) ?? "application/pdf";

    // 3. Extract text.
    const { rawText } = await extractTextFromBuffer(fileBuffer, mimeType);
    if (!rawText.trim()) {
      throw new Error("No text extracted from PDF — document may be image-only or password-protected");
    }

    // 3b. Upload raw text for future retries / debugging.
    const textPath = `${row.order_id}/${Date.now()}.txt`;
    const { error: textUpErr } = await admin.storage
      .from(BUCKET_NAME)
      .upload(textPath, Buffer.from(rawText, "utf-8"), {
        contentType: "text/plain; charset=utf-8",
        upsert: false,
      });
    if (textUpErr) {
      console.warn(`[3p-pipeline] raw text upload failed: ${textUpErr.message}`);
    }

    // 4. Map to the registry.
    const ingestion: ExternalTemplateIngestion = await ingestExternalTemplate(rawText);

    // 5. Propose new registry fields for unmapped labels.
    const unmappedLabels = ingestion.fields
      .filter((f) => f.registryKey == null)
      .map((f) => f.externalLabel);
    const proposals = unmappedLabels.length > 0
      ? await proposeRegistryFields(unmappedLabels).catch((err) => {
          console.warn("[3p-pipeline] proposal generation failed:", err);
          return [];
        })
      : [];

    // 6. Resolve master_type_key — best guess from issuer + form title. Default
    // to the order's existing master_type_key if nothing obvious matches.
    const docType = inferDocumentType({
      issuer: ingestion.issuer,
      formTitle: ingestion.formTitle,
    });

    // 7. Compute coverage percentage.
    const total = ingestion.mappedCount + ingestion.unmappedCount;
    const autoFillCoveragePct =
      total > 0 ? Math.round((ingestion.mappedCount / total) * 1000) / 10 : 0;

    // 8. Write results.
    await admin
      .from("third_party_templates")
      .update({
        storage_path_text: textUpErr ? null : textPath,
        form_title: ingestion.formTitle,
        issuer: ingestion.issuer,
        document_type: docType,
        detected_fields: ingestion.fields,
        mapped_count: ingestion.mappedCount,
        unmapped_count: ingestion.unmappedCount,
        auto_fill_coverage_pct: autoFillCoveragePct,
        ingest_status: "ready",
        ingest_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // 9. Insert proposals.
    if (proposals.length > 0) {
      await admin.from("field_registry_proposals").insert(
        proposals.map((p) => ({
          source_template_id: id,
          proposed_field_key: p.proposedKey,
          proposed_label: p.proposedLabel,
          proposed_type: p.proposedType,
          rationale: p.rationale,
        }))
      );
    }

    // 10. Notify Havn staff.
    try {
      const staffEmail = GOD_MODE_EMAILS[0];
      if (staffEmail) {
        const { data: order } = await admin
          .from("document_orders")
          .select("id, requester_email, master_type_key")
          .eq("id", row.order_id as string)
          .maybeSingle();
        const orderShortId = (row.order_id as string).slice(0, 8);
        await send3pReviewNeeded({
          to: staffEmail,
          orderShortId,
          uploaderEmail: (order?.requester_email as string | null) ?? "unknown",
          docType:
            docType ??
            ((order?.master_type_key as string | null) ?? "unknown document"),
          coveragePct: autoFillCoveragePct,
        });
      }
    } catch (notifyErr) {
      console.warn("[3p-pipeline] staff notification failed:", notifyErr);
    }

    return {
      ok: true,
      mappedCount: ingestion.mappedCount,
      unmappedCount: ingestion.unmappedCount,
      autoFillCoveragePct,
      proposalsGenerated: proposals.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ingestion failed";
    await admin
      .from("third_party_templates")
      .update({
        ingest_status: "failed",
        ingest_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    console.error(`[3p-pipeline] ingestion failed for ${id}:`, msg);
    return { ok: false, error: msg };
  }
}

/* ── Heuristics ──────────────────────────────────────────────────────── */

const MASTER_TYPE_HEURISTICS: Array<{
  pattern: RegExp;
  masterType: string;
}> = [
  { pattern: /lender|mortgage|questionnaire|fannie|freddie|fnma|fhlmc|underwriting/i, masterType: "lender_questionnaire" },
  { pattern: /resale|disclosure certificate|pre.?sale/i, masterType: "resale_certificate" },
  { pattern: /estoppel/i, masterType: "estoppel_letter" },
  { pattern: /demand|payoff/i, masterType: "demand_letter" },
  { pattern: /bylaw|declaration|ccr|governing/i, masterType: "governing_documents" },
];

function inferDocumentType(params: {
  issuer: string | null;
  formTitle: string | null;
}): string | null {
  const haystack = `${params.formTitle ?? ""} ${params.issuer ?? ""}`;
  for (const { pattern, masterType } of MASTER_TYPE_HEURISTICS) {
    if (pattern.test(haystack)) return masterType;
  }
  return null;
}
