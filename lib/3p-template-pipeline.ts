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

import { createHash } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { extractTextWithLayout } from "@/lib/pdf-text";
import { extractFormContext } from "@/lib/extract-form-context";
import {
  ingestExternalTemplate,
  type ExternalTemplateIngestion,
} from "@/lib/ingest-external-template";
import { matchOrderProperty } from "@/lib/match-order-property";
import { parseFormLayout, attachRegistryKeys } from "@/lib/pdf-form-layout";
import { extractAcroFormLayout } from "@/lib/acroform-extractor";
import { filterFillableFieldsWithClassification } from "@/lib/filter-fillable-fields";
import { synthesizeFieldLayout } from "@/lib/synthesize-field-layout";
import { visionPositionFields } from "@/lib/vision-field-positioner";
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

    // 3. Extract text + per-token positions. Positions feed the bounding-
    //    box synthesis pass below for fields Form Parser misses.
    const { rawText, pages: ocrPages } = await extractTextWithLayout(
      fileBuffer,
      mimeType
    );
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

    // 4. Load the order so we have organization_id + master_type_key for the
    //    universal extractor + match resolver below.
    const { data: orderForCtx } = await admin
      .from("document_orders")
      .select("id, organization_id, master_type_key, community_id, notes")
      .eq("id", row.order_id as string)
      .maybeSingle();
    const orderCtx = orderForCtx as {
      id: string;
      organization_id: string;
      master_type_key: string | null;
      community_id: string | null;
      notes: string | null;
    } | null;

    // 4a. Map to the registry (existing behavior — Claude maps form labels).
    const ingestion: ExternalTemplateIngestion = await ingestExternalTemplate(rawText);

    // 4a-cache. Check the vendor form template cache. If we've previously
    //   positioned + reviewed this form (same issuer + title +
    //   content-fingerprint), use the saved field_layout directly and
    //   skip the entire positioning stack (AcroForm / Form Parser /
    //   synthesis). This is the system's compounding-improvements loop:
    //   one staff drag-fix becomes a permanent improvement for every
    //   future order of the same form.
    const contentFingerprint = computeContentFingerprint(rawText);
    const cachedTemplate = await loadCachedTemplate(admin, {
      issuer: ingestion.issuer,
      formTitle: ingestion.formTitle,
      contentFingerprint,
    });
    if (cachedTemplate) {
      console.log(
        `[3p-pipeline] vendor template cache HIT: ${cachedTemplate.fields.length} fields (id=${cachedTemplate.id})`
      );
    }

    // 4b. Universal context + field extractor. Pulls association name,
    //     property address, owner names, parcel — and confirms each form
    //     field's registry-key mapping. Failures fall through with empty
    //     context so the rest of the pipeline still completes.
    const extracted = orderCtx
      ? await extractFormContext(rawText, orderCtx.master_type_key).catch((err) => {
          console.warn("[3p-pipeline] extractFormContext failed:", err);
          return null;
        })
      : null;

    // 4b-form. Form Parser pass for coordinate capture. Lets the staff
    //         review page render the original PDF with HTML inputs
    //         overlaid on each blank, and lets the delivery flow stamp
    //         values onto the PDF at the same coords. Falls through with
    //         null layout if the form parser isn't configured or the
    //         document isn't a PDF.
    // 4b-acroform. Skipped when cache hit. Fast path: if the PDF is a
    //   fillable AcroForm, use pdf-lib to read its embedded form fields
    //   directly. Modern vendor PDFs (~2018+) ship as AcroForms with
    //   field name + type + position embedded — no OCR or vision pass
    //   needed. Falls through to Form Parser when the PDF is flat.
    const acroformLayout = !cachedTemplate && mimeType === "application/pdf"
      ? await extractAcroFormLayout(fileBuffer).catch((err) => {
          console.warn("[3p-pipeline] extractAcroFormLayout failed:", err);
          return null;
        })
      : null;

    const formLayout = cachedTemplate
      ? null
      : acroformLayout
        ?? (mimeType === "application/pdf"
          ? await parseFormLayout(fileBuffer, mimeType).catch((err) => {
              console.warn("[3p-pipeline] parseFormLayout failed:", err);
              return null;
            })
          : null);

    if (acroformLayout) {
      console.log(
        `[3p-pipeline] AcroForm fast path: ${acroformLayout.fields.length} fields`
      );
    }

    // 4b-vision. When the form is a flat scan (no AcroForm) AND the
    //   vendor template cache missed, ask Claude vision to position the
    //   detected_fields labels by SEEING the rendered page images. This
    //   is the positioning workhorse for novel forms — vision actually
    //   resolves underline blanks and signature lines that the OCR
    //   token stream can't reach. Result is merged with Form Parser's
    //   layout (vision-found fields fill gaps; Form Parser's stay).
    //   Skipped when AcroForm already gave us positions.
    const visionLayout = !cachedTemplate && !acroformLayout && mimeType === "application/pdf"
      ? await visionPositionFields({
          pdfBuffer: fileBuffer,
          detectedFields: ingestion.fields.map((f) => ({
            externalLabel: f.externalLabel,
            registryKey: f.registryKey,
            fieldKind: (f as { fieldKind?: string | null }).fieldKind ?? null,
          })),
        }).catch((err) => {
          console.warn("[3p-pipeline] visionPositionFields failed:", err);
          return null;
        })
      : null;

    if (visionLayout) {
      console.log(
        `[3p-pipeline] vision positioner: ${visionLayout.fields.length} fields`
      );
    }

    // Heuristic synthesis is the LAST-RESORT fallback now. Skipped when
    // any of the higher-leverage positioners (cache / AcroForm / vision)
    // produced fields. Kept as a final safety net for edge cases where
    // vision fails entirely (network blip, image render failure, etc.).
    const synthesizedFields = !cachedTemplate && !acroformLayout && !visionLayout && formLayout
      ? synthesizeFieldLayout({
          ocrPages,
          detectedFields: ingestion.fields.map((f) => ({
            externalLabel: f.externalLabel,
            registryKey: f.registryKey,
            fieldKind: (f as { fieldKind?: string | null }).fieldKind ?? null,
          })),
          formParserFields: formLayout.fields,
        })
      : [];

    // Merge whichever positioners produced fields, then filter — running
    // the filter pass *after* synthesis means requester-context labels
    // (Date, Owner, Property) get caught regardless of which source
    // produced them. Form Parser fields (when present) provide the
    // already-filled context fields the filter then routes to the
    // requester-draft harvest below.
    const mergedLayout = formLayout || visionLayout
      ? {
          pages: visionLayout?.pages ?? formLayout?.pages ?? [],
          fields: [
            ...(formLayout?.fields ?? []),
            ...(visionLayout?.fields ?? []),
            ...synthesizedFields,
          ],
        }
      : null;

    const filterResult = mergedLayout
      ? await filterFillableFieldsWithClassification(mergedLayout, {
          issuer: ingestion.issuer,
          formTitle: ingestion.formTitle,
        }).catch((err) => {
          console.warn("[3p-pipeline] filterFillableFields failed:", err);
          return {
            response: mergedLayout.fields,
            requester: [],
            metadata: [],
          };
        })
      : null;

    const filteredLayout = mergedLayout && filterResult
      ? { pages: mergedLayout.pages, fields: filterResult.response }
      : null;

    // Cache hit short-circuits the filter + attachRegistryKeys path —
    // the saved layout is the source of truth (already filtered, already
    // mapped at template-save time). For cache miss, run the normal
    // attach + filter chain.
    const fieldLayout = cachedTemplate
      ? cachedTemplate.fields
      : filteredLayout
        ? attachRegistryKeys(filteredLayout, ingestion.fields.map((f) => ({
            label: f.externalLabel,
            registryKey: f.registryKey,
          })))
        : null;

    // Audit telemetry — record which positioner produced fields so the
    // God Mode panel can show the layered fast-path stack at work.
    const positioningTelemetry = {
      cache_hit: !!cachedTemplate,
      cache_template_id: cachedTemplate?.id ?? null,
      acroform_field_count: acroformLayout?.fields.length ?? 0,
      form_parser_field_count:
        formLayout && !acroformLayout ? formLayout.fields.length : 0,
      vision_field_count: visionLayout?.fields.length ?? 0,
      synthesis_field_count: synthesizedFields.length,
      filtered_response_count: filterResult?.response.length ?? 0,
      filtered_requester_count: filterResult?.requester.length ?? 0,
      filtered_metadata_count: filterResult?.metadata.length ?? 0,
      total_layout_field_count: fieldLayout?.length ?? 0,
      timestamp: new Date().toISOString(),
    };

    // Harvest values from requester-context fields. Form Parser already
    // OCR'd the values the requester typed in (Date, Owner, Property,
    // APN, etc.). The filter just classified them as requester-context;
    // their captured values are the source of truth for those questions.
    // Map each to its registry key via the same label-mapping table the
    // overlay uses, then persist into the order's draft_fields so Form
    // view shows them already populated.
    const requesterDraftPatch: Record<string, string> = {};
    if (filterResult && filterResult.requester.length > 0) {
      const labelToKey = new Map<string, string>();
      for (const f of ingestion.fields) {
        if (!f.externalLabel || !f.registryKey) continue;
        labelToKey.set(normalizeLabel(f.externalLabel), f.registryKey);
      }
      for (const ctxField of filterResult.requester) {
        const cv = (ctxField.currentValue || "").trim();
        if (!cv) continue;
        const key = labelToKey.get(normalizeLabel(ctxField.label));
        if (!key) continue;
        if (requesterDraftPatch[key]) continue; // first-wins
        requesterDraftPatch[key] = cv;
      }
    }

    // 4c. Match the extracted context to a community + unit.
    const match = orderCtx && extracted
      ? await matchOrderProperty({
          context: extracted.context,
          organizationId: orderCtx.organization_id,
        }).catch((err) => {
          console.warn("[3p-pipeline] matchOrderProperty failed:", err);
          return null;
        })
      : null;

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

    // 8. Write results — including the extracted context + match suggestion.
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
        extracted_context: extracted?.context ?? null,
        match_level: match?.level ?? null,
        match_confidence: match?.confidence ?? null,
        match_reasoning: match?.reasoning ?? null,
        suggested_community_id: match?.communityId ?? null,
        suggested_unit_id: match?.unitId ?? null,
        pdf_pages:
          cachedTemplate?.pages ??
          visionLayout?.pages ??
          formLayout?.pages ??
          null,
        field_layout: fieldLayout ?? null,
        ingest_telemetry: positioningTelemetry,
      })
      .eq("id", id);

    // 8b. Persist captured requester-context values to draft_fields so
    //     Form view shows them already populated. Fields that the staff
    //     have already manually edited are NEVER overwritten — we read
    //     existing draft_fields, then set only keys that aren't there.
    if (orderCtx && Object.keys(requesterDraftPatch).length > 0) {
      const { data: existing } = await admin
        .from("document_orders")
        .select("draft_fields")
        .eq("id", orderCtx.id)
        .maybeSingle();
      const existingDraft =
        ((existing as { draft_fields: Record<string, string | null> | null } | null)
          ?.draft_fields ?? {}) as Record<string, string | null>;
      const merged: Record<string, string | null> = { ...existingDraft };
      for (const [k, v] of Object.entries(requesterDraftPatch)) {
        if (merged[k] && (merged[k] as string).trim().length > 0) continue;
        merged[k] = v;
      }
      await admin
        .from("document_orders")
        .update({ draft_fields: merged })
        .eq("id", orderCtx.id);
    }

    // 8a. Auto-apply when all three signals (community + unit + owner) line
    //     up at high confidence. Below that bar, the match stays as a
    //     suggestion the staff confirms via the review page.
    if (
      match &&
      orderCtx &&
      match.level === "community_unit_owner" &&
      match.confidence === "high"
    ) {
      const today = new Date();
      const dateStr = today.toLocaleDateString("en-US");
      const auditNote = `Matched by Havn — community + unit + owner all confirmed (${dateStr})`;
      const mergedNotes = [orderCtx.notes, auditNote]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .join(" · ");

      await admin
        .from("document_orders")
        .update({
          community_id: match.communityId,
          community_unit_id: match.unitId,
          match_source: "havn_auto",
          match_applied_at: today.toISOString(),
          notes: mergedNotes,
        })
        .eq("id", orderCtx.id);
    }

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

/* ── helpers ─────────────────────────────────────────────────────────── */

/**
 * Normalize a form-field label for cross-source matching. Form Parser,
 * Claude's text extractor, and the synthesis pass all surface labels with
 * varying punctuation, casing, and whitespace; collapsing them to a
 * canonical form lets us reconcile them.
 */
function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),:$_/\\.*-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable fingerprint for the form's content. Used as part of the
 * vendor_form_templates cache key so we differentiate form variants
 * (e.g. "Ticor HOA Request 2024" vs "...2026") even when the visible
 * issuer + form_title strings match. Whitespace-normalized + truncated
 * to keep the hash robust against minor OCR jitter and to avoid
 * fingerprinting the requester's already-typed values (those live
 * later in the doc).
 */
function computeContentFingerprint(rawText: string): string {
  const norm = rawText
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .slice(0, 4096);
  return createHash("sha256").update(norm).digest("hex");
}

/**
 * Look up a previously approved layout for this form. Cache hit means
 * we skip every positioning step (AcroForm, Form Parser, synthesis,
 * vision) and serve the saved field_layout directly. Match keys: same
 * issuer + form_title + content_fingerprint.
 */
async function loadCachedTemplate(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    issuer: string | null;
    formTitle: string | null;
    contentFingerprint: string;
  }
): Promise<{
  id: string;
  fields: Array<{
    registryKey: string | null;
    label: string;
    page: number;
    kind?: string;
    valueBbox: { x: number; y: number; w: number; h: number } | null;
    labelBbox: { x: number; y: number; w: number; h: number } | null;
    currentValue: string;
  }>;
  pages: Array<{ page: number; width: number; height: number }> | null;
} | null> {
  const issuer = (params.issuer ?? "").trim();
  const formTitle = (params.formTitle ?? "").trim();

  let query = admin
    .from("vendor_form_templates")
    .select("id, field_layout, pdf_pages")
    .eq("content_fingerprint", params.contentFingerprint);
  // We use the unique index `(coalesce(issuer,''), coalesce(form_title,''),
  // content_fingerprint)`, so equality on whichever of issuer/form_title
  // we have keeps the lookup tight without false positives.
  if (issuer) query = query.eq("issuer", issuer);
  if (formTitle) query = query.eq("form_title", formTitle);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.warn("[3p-pipeline] template cache lookup failed:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as {
    id: string;
    field_layout: unknown;
    pdf_pages: unknown;
  };
  const fields = Array.isArray(row.field_layout)
    ? (row.field_layout as Array<{
        registryKey: string | null;
        label: string;
        page: number;
        kind?: string;
        valueBbox: { x: number; y: number; w: number; h: number } | null;
        labelBbox: { x: number; y: number; w: number; h: number } | null;
        currentValue: string;
      }>)
    : null;
  if (!fields || fields.length === 0) return null;
  const pages = Array.isArray(row.pdf_pages)
    ? (row.pdf_pages as Array<{ page: number; width: number; height: number }>)
    : null;
  return { id: row.id, fields, pages };
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
