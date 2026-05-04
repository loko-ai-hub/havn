"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { extractTextFromBuffer } from "@/lib/pdf-text";
import { extractFormContext } from "@/lib/extract-form-context";
import { matchOrderProperty } from "@/lib/match-order-property";
import { hydrateDraftFields } from "@/lib/hydrate-draft-fields";
import { runThirdPartyIngestion } from "@/lib/3p-template-pipeline";
import type { MatchLevel } from "@/lib/match-order-property";

import { requireDashboardOrg } from "../../../_lib/require-dashboard-org";

const BUCKET_NAME = "third-party-templates";

type MatchSuggestion = {
  level: MatchLevel | null;
  confidence: string | null;
  reasoning: string | null;
  suggestedCommunityId: string | null;
  suggestedUnitId: string | null;
  appliedAt: string | null;
  matchSource: string | null;
};

type LoadedOrder = {
  ok: true;
  admin: ReturnType<typeof createAdminClient>;
  order: {
    id: string;
    organization_id: string;
    master_type_key: string | null;
    community_id: string | null;
    community_unit_id: string | null;
    match_source: string | null;
    match_applied_at: string | null;
    notes: string | null;
    draft_fields: Record<string, unknown> | null;
  };
  organizationId: string;
};

async function loadOrderForOrg(
  orderId: string
): Promise<LoadedOrder | { ok: false; error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("document_orders")
    .select(
      "id, organization_id, master_type_key, community_id, community_unit_id, match_source, match_applied_at, notes, draft_fields"
    )
    .eq("id", orderId)
    .single();

  if (error || !order || order.organization_id !== organizationId) {
    return { ok: false, error: "Order not found or access denied." };
  }

  return {
    ok: true,
    admin,
    order: order as LoadedOrder["order"],
    organizationId,
  };
}

async function downloadRawText(
  admin: ReturnType<typeof createAdminClient>,
  template: {
    storage_path_text: string | null;
    storage_path_pdf: string | null;
    mime_type: string | null;
  }
): Promise<string> {
  if (template.storage_path_text) {
    const { data: textBlob, error: textErr } = await admin.storage
      .from(BUCKET_NAME)
      .download(template.storage_path_text);
    if (!textErr && textBlob) {
      return await textBlob.text();
    }
  }

  if (!template.storage_path_pdf) {
    throw new Error("No source document on file for this order.");
  }

  const { data: pdfBlob, error: pdfErr } = await admin.storage
    .from(BUCKET_NAME)
    .download(template.storage_path_pdf);
  if (pdfErr || !pdfBlob) {
    throw new Error(`Could not download source PDF: ${pdfErr?.message ?? "empty"}`);
  }
  const buf = Buffer.from(await pdfBlob.arrayBuffer());
  const mime = template.mime_type ?? "application/pdf";
  const { rawText } = await extractTextFromBuffer(buf, mime);
  if (!rawText.trim()) {
    throw new Error("No extractable text in source document.");
  }
  return rawText;
}

/* ── runMatchExtraction ─────────────────────────────────────────────────
 * Re-fires extraction + match against the latest OCR text. Persists a
 * fresh suggestion on `third_party_templates`. Does NOT mutate the order
 * — staff applies via applyMatch().
 */
export async function runMatchExtraction(
  orderId: string
): Promise<MatchSuggestion | { error: string }> {
  const loaded = await loadOrderForOrg(orderId);
  if (!loaded.ok) return { error: loaded.error };
  const { admin, order, organizationId } = loaded;

  const { data: tpl } = await admin
    .from("third_party_templates")
    .select("id, storage_path_text, storage_path_pdf, mime_type")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!tpl) {
    return { error: "No third-party template uploaded for this order." };
  }

  const tplRow = tpl as {
    id: string;
    storage_path_text: string | null;
    storage_path_pdf: string | null;
    mime_type: string | null;
  };

  let rawText: string;
  try {
    rawText = await downloadRawText(admin, tplRow);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load document text.";
    return { error: msg };
  }

  const masterTypeKey = (order.master_type_key as string | null) ?? null;
  const extracted = await extractFormContext(rawText, masterTypeKey).catch((err) => {
    console.warn("[review/actions] extractFormContext failed:", err);
    return null;
  });

  const match = extracted
    ? await matchOrderProperty({
        context: extracted.context,
        organizationId,
      }).catch((err) => {
        console.warn("[review/actions] matchOrderProperty failed:", err);
        return null;
      })
    : null;

  await admin
    .from("third_party_templates")
    .update({
      extracted_context: extracted?.context ?? null,
      match_level: match?.level ?? null,
      match_confidence: match?.confidence ?? null,
      match_reasoning: match?.reasoning ?? null,
      suggested_community_id: match?.communityId ?? null,
      suggested_unit_id: match?.unitId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tplRow.id);

  revalidatePath(`/dashboard/requests/${orderId}/review`);

  return {
    level: match?.level ?? null,
    confidence: match?.confidence ?? null,
    reasoning: match?.reasoning ?? null,
    suggestedCommunityId: match?.communityId ?? null,
    suggestedUnitId: match?.unitId ?? null,
    appliedAt: null,
    matchSource: null,
  };
}

/* ── applyMatch ─────────────────────────────────────────────────────────
 * Writes the persisted suggestion on `third_party_templates` over to
 * `document_orders`. Tags it `match_source = "staff_manual"` and appends
 * an audit note.
 */
export async function applyMatch(
  orderId: string
): Promise<{ ok: true; appliedAt: string } | { error: string }> {
  const loaded = await loadOrderForOrg(orderId);
  if (!loaded.ok) return { error: loaded.error };
  const { admin, order } = loaded;

  const { data: tpl } = await admin
    .from("third_party_templates")
    .select("suggested_community_id, suggested_unit_id, match_level, match_confidence")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!tpl) {
    return { error: "No match suggestion on file. Run match extraction first." };
  }

  const sug = tpl as {
    suggested_community_id: string | null;
    suggested_unit_id: string | null;
    match_level: string | null;
    match_confidence: string | null;
  };

  if (!sug.suggested_community_id) {
    return { error: "Suggestion does not include a community match." };
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US");
  const audit = `Matched by Havn — staff confirmed (${dateStr})`;
  const existingNotes = (order.notes as string | null) ?? null;
  const mergedNotes = [existingNotes, audit]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" · ");

  const { error: updateErr } = await admin
    .from("document_orders")
    .update({
      community_id: sug.suggested_community_id,
      community_unit_id: sug.suggested_unit_id,
      match_source: "staff_manual",
      match_applied_at: today.toISOString(),
      notes: mergedNotes,
    })
    .eq("id", orderId);

  if (updateErr) return { error: updateErr.message };

  revalidatePath(`/dashboard/requests/${orderId}/review`);
  revalidatePath(`/dashboard/requests/${orderId}`);
  return { ok: true, appliedAt: today.toISOString() };
}

/* ── autoPopulateFields ─────────────────────────────────────────────────
 * Registry-driven fill of `document_orders.draft_fields` from data Havn
 * already has. Honors the persisted match level so partial matches don't
 * fill data we can't trust.
 */
export type AutoPopulateResult = {
  ok: true;
  newlyFilledKeys: string[];
  coverage: {
    requested: number;
    filled: number;
    skippedNoSource: string[];
    skippedAlreadyFilled: string[];
  };
};

export async function autoPopulateFields(
  orderId: string
): Promise<AutoPopulateResult | { error: string }> {
  const loaded = await loadOrderForOrg(orderId);
  if (!loaded.ok) return { error: loaded.error };
  const { admin } = loaded;

  const { data: tpl } = await admin
    .from("third_party_templates")
    .select("detected_fields, match_level")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!tpl) {
    return {
      error:
        "No detected fields on file. Auto-populate works on third-party uploads after extraction.",
    };
  }

  const tplRow = tpl as {
    detected_fields: Array<{ registryKey: string | null }> | null;
    match_level: string | null;
  };

  const detected = (tplRow.detected_fields ?? [])
    .filter((f): f is { registryKey: string } => typeof f?.registryKey === "string");

  if (detected.length === 0) {
    return {
      ok: true,
      newlyFilledKeys: [],
      coverage: {
        requested: 0,
        filled: 0,
        skippedNoSource: [],
        skippedAlreadyFilled: [],
      },
    };
  }

  const level: MatchLevel = isMatchLevel(tplRow.match_level)
    ? tplRow.match_level
    : "none";

  const result = await hydrateDraftFields({
    orderId,
    level,
    detectedFields: detected,
  });

  revalidatePath(`/dashboard/requests/${orderId}/review`);

  return {
    ok: true,
    newlyFilledKeys: result.newlyFilledKeys,
    coverage: result.coverage,
  };
}

/* ── rerunIngestion ─────────────────────────────────────────────────────
 * Fires the FULL 3P pipeline against an existing upload: OCR → Claude
 * label-mapping → universal context extractor → Form Parser layout →
 * match resolver. Overwrites the prior `third_party_templates` row.
 *
 * Use this to re-process documents that were uploaded before the Form
 * Parser pass landed — running it captures pdf_pages + field_layout so
 * the PDF view toggle has data to render against.
 *
 * Note: pipeline may auto-apply the match to the order at high
 * confidence and may email staff a "review needed" notification —
 * same behavior as a fresh upload.
 */
export async function rerunIngestion(
  orderId: string
): Promise<
  | {
      ok: true;
      mappedCount: number;
      unmappedCount: number;
      autoFillCoveragePct: number;
      capturedLayout: boolean;
    }
  | { error: string }
> {
  const loaded = await loadOrderForOrg(orderId);
  if (!loaded.ok) return { error: loaded.error };
  const { admin } = loaded;

  const { data: tpl } = await admin
    .from("third_party_templates")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!tpl) {
    return { error: "No third-party template uploaded for this order." };
  }

  const result = await runThirdPartyIngestion({
    thirdPartyTemplateId: (tpl as { id: string }).id,
  });

  if (!result.ok) {
    return { error: result.error ?? "Ingestion failed." };
  }

  const { data: refreshed } = await admin
    .from("third_party_templates")
    .select("field_layout")
    .eq("id", (tpl as { id: string }).id)
    .maybeSingle();

  const capturedLayout =
    !!(refreshed as { field_layout: unknown } | null)?.field_layout;

  revalidatePath(`/dashboard/requests/${orderId}/review`);
  revalidatePath(`/dashboard/requests/${orderId}`);

  return {
    ok: true,
    mappedCount: result.mappedCount ?? 0,
    unmappedCount: result.unmappedCount ?? 0,
    autoFillCoveragePct: result.autoFillCoveragePct ?? 0,
    capturedLayout,
  };
}

function isMatchLevel(v: string | null): v is MatchLevel {
  return (
    v === "community_unit_owner" ||
    v === "community_unit" ||
    v === "community" ||
    v === "none"
  );
}

/* ── getMatchSuggestion ────────────────────────────────────────────────
 * Used by the page on initial render so the UI can show what we have.
 */
export async function getMatchSuggestion(
  orderId: string
): Promise<MatchSuggestion | { error: string }> {
  const loaded = await loadOrderForOrg(orderId);
  if (!loaded.ok) return { error: loaded.error };
  const { admin, order } = loaded;

  const { data: tpl } = await admin
    .from("third_party_templates")
    .select(
      "match_level, match_confidence, match_reasoning, suggested_community_id, suggested_unit_id"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  return {
    level:
      tpl && isMatchLevel((tpl as { match_level: string | null }).match_level)
        ? ((tpl as { match_level: MatchLevel }).match_level)
        : null,
    confidence: (tpl as { match_confidence: string | null } | null)?.match_confidence ?? null,
    reasoning: (tpl as { match_reasoning: string | null } | null)?.match_reasoning ?? null,
    suggestedCommunityId:
      (tpl as { suggested_community_id: string | null } | null)?.suggested_community_id ?? null,
    suggestedUnitId:
      (tpl as { suggested_unit_id: string | null } | null)?.suggested_unit_id ?? null,
    appliedAt: (order.match_applied_at as string | null) ?? null,
    matchSource: (order.match_source as string | null) ?? null,
  };
}
