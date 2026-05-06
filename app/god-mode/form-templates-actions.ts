"use server";

import { createHash } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { GOD_MODE_EMAILS } from "./constants";

async function requireGodMode(): Promise<void> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = (user?.email ?? "").toLowerCase().trim();
  if (!user || !GOD_MODE_EMAILS.includes(email)) {
    throw new Error("Not authorized.");
  }
}

/**
 * Load everything the God Mode template editor needs to curate a form
 * variant: the PDF (signed URL), the AI-positioned field layout, the
 * issuer + form_title + fingerprint that key the canonical template,
 * and any existing vendor_form_templates row to update.
 *
 * Fingerprint is recomputed from the rawText snapshot (same algorithm
 * the 3P pipeline uses) so the editor and the cache lookup agree.
 */
export type FormTemplateEditorData = {
  orderId: string;
  pdfSignedUrl: string;
  pages: Array<{ page: number; width: number; height: number }>;
  fields: Array<{
    registryKey: string | null;
    label: string;
    page: number;
    kind?: "text" | "checkbox";
    selectionValue?: string | null;
    valueBbox: { x: number; y: number; w: number; h: number } | null;
    labelBbox: { x: number; y: number; w: number; h: number } | null;
    currentValue: string;
  }>;
  issuer: string | null;
  formTitle: string | null;
  masterTypeKey: string | null;
  contentFingerprint: string | null;
  existingTemplateId: string | null;
};

const BUCKET_NAME = "third-party-templates";

export async function getFormTemplateEditorData(
  orderId: string
): Promise<FormTemplateEditorData | { error: string }> {
  await requireGodMode();
  const admin = createAdminClient();

  const { data: tpl, error: tplErr } = await admin
    .from("third_party_templates")
    .select(
      "id, storage_path_pdf, storage_path_text, mime_type, pdf_pages, field_layout, detected_fields, extracted_context, issuer, form_title, document_type"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (tplErr || !tpl) {
    return { error: "No 3P template found for this order." };
  }
  const tplRow = tpl as {
    id: string;
    storage_path_pdf: string | null;
    storage_path_text: string | null;
    mime_type: string | null;
    pdf_pages: Array<{ page: number; width: number; height: number }> | null;
    field_layout: FormTemplateEditorData["fields"] | null;
    detected_fields: Array<{ externalLabel: string }> | null;
    extracted_context: {
      formVariantId?: string | null;
      formVariantVersion?: string | null;
      formVariantUpdatedAt?: string | null;
    } | null;
    issuer: string | null;
    form_title: string | null;
    document_type: string | null;
  };

  if (!tplRow.storage_path_pdf) {
    return { error: "Template has no PDF on file." };
  }

  const { data: signed } = await admin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(tplRow.storage_path_pdf, 60 * 60);
  if (!signed?.signedUrl) {
    return { error: "Could not sign the PDF for preview." };
  }

  const fingerprint = computeFingerprintFromTemplateRow(tplRow);

  let existingTemplateId: string | null = null;
  if (fingerprint) {
    const { data: existing } = await admin
      .from("vendor_form_templates")
      .select("id")
      .eq("content_fingerprint", fingerprint)
      .eq("issuer", tplRow.issuer ?? "")
      .eq("form_title", tplRow.form_title ?? "")
      .maybeSingle();
    existingTemplateId =
      (existing as { id: string } | null)?.id ?? null;
  }

  return {
    orderId,
    pdfSignedUrl: signed.signedUrl,
    pages: tplRow.pdf_pages ?? [],
    fields: tplRow.field_layout ?? [],
    issuer: tplRow.issuer,
    formTitle: tplRow.form_title,
    masterTypeKey: tplRow.document_type,
    contentFingerprint: fingerprint,
    existingTemplateId,
  };
}

/**
 * Save (or update) the canonical layout for a form variant. Writes the
 * FULL layout (every field's position, kind, label, and registry key)
 * to vendor_form_templates. The cache lookup in the 3P pipeline picks
 * this up automatically on every future ingest of the same form
 * variant — across every org.
 */
export async function saveCanonicalFormTemplate(
  orderId: string,
  fields: FormTemplateEditorData["fields"]
): Promise<{ ok: true; templateId: string } | { error: string }> {
  await requireGodMode();
  const admin = createAdminClient();

  const data = await getFormTemplateEditorData(orderId);
  if ("error" in data) return data;

  if (!data.contentFingerprint) {
    return {
      error:
        "Cannot save template — content fingerprint unavailable. The source order may need re-processing first.",
    };
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const approvedBy = user?.email ?? null;

  const { data: upserted, error: upsertErr } = await admin
    .from("vendor_form_templates")
    .upsert(
      {
        issuer: data.issuer,
        form_title: data.formTitle,
        content_fingerprint: data.contentFingerprint,
        master_type_key: data.masterTypeKey,
        field_layout: fields,
        pdf_pages: data.pages,
        source_template_id: null,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "issuer,form_title,content_fingerprint" }
    )
    .select("id")
    .single();

  if (upsertErr || !upserted) {
    return { error: upsertErr?.message ?? "Failed to save template." };
  }

  return { ok: true, templateId: (upserted as { id: string }).id };
}

/**
 * Returns the merge-tag registry as a list — used by the editor's
 * registry dropdown so staff can tag any field with a canonical key.
 */
export type RegistryOption = {
  key: string;
  label: string;
  type: string;
  communityLevel: boolean;
  lifecycleTier: "governing" | "onboarding" | "per_unit" | "per_order";
  description: string;
};

export async function listRegistryOptions(): Promise<RegistryOption[]> {
  await requireGodMode();
  const { FIELD_REGISTRY, getLifecycleTier } = await import(
    "@/lib/document-templates/field-registry"
  );
  return Object.values(FIELD_REGISTRY)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      type: entry.type,
      communityLevel: entry.communityLevel,
      lifecycleTier: getLifecycleTier(entry),
      description: entry.description,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Mirror of lib/3p-template-pipeline.ts's computeContentFingerprint —
 * builds the same hash from the third_party_templates row's saved
 * issuer + form_title + extracted_context (form-variant identifiers)
 * + detected_fields labels. Pipeline and editor MUST agree on this
 * formula or the cache lookup at ingest time and the editor's "did
 * I already save a template for this variant?" check will diverge.
 */
function computeFingerprintFromTemplateRow(tplRow: {
  issuer: string | null;
  form_title: string | null;
  detected_fields: Array<{ externalLabel: string }> | null;
  extracted_context: {
    formVariantId?: string | null;
    formVariantVersion?: string | null;
    formVariantUpdatedAt?: string | null;
  } | null;
}): string | null {
  const norm = (s: string | null | undefined): string =>
    (s ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const labels = (tplRow.detected_fields ?? [])
    .map((f) => norm(f.externalLabel))
    .filter(Boolean)
    .sort()
    .join("|");
  const parts = [
    norm(tplRow.issuer),
    norm(tplRow.form_title),
    norm(tplRow.extracted_context?.formVariantId),
    norm(tplRow.extracted_context?.formVariantVersion),
    norm(tplRow.extracted_context?.formVariantUpdatedAt),
    labels,
  ].join("\n");
  // Need at least issuer/form_title or labels to fingerprint at all.
  if (!parts.trim()) return null;
  return createHash("sha256").update(parts).digest("hex");
}

export type FormVariantRow = {
  /** Composite key — issuer + form_title + content_fingerprint may be empty if Claude didn't tag the form. */
  fingerprint: string | null;
  issuer: string | null;
  formTitle: string | null;
  masterTypeKey: string | null;
  /** Whether a canonical layout has been saved for this variant. */
  templateSaved: boolean;
  /** Number of orders that ingested this variant. */
  orderCount: number;
  /** Most recent ingest of this variant — link target for the editor. */
  latestOrderId: string | null;
  latestIngestAt: string | null;
  /** Telemetry from the latest ingest (which positioner won, field counts). */
  latestTelemetry: Record<string, unknown> | null;
};

/**
 * List every unique vendor form variant Havn has ever ingested, joined
 * with whether a canonical layout has been curated for it. The God Mode
 * form library uses this to triage which forms still need staff
 * attention vs which are already covered by the template cache.
 *
 * Variants are keyed by `(issuer, form_title, content_fingerprint_proxy)`
 * — third_party_templates doesn't store the fingerprint directly today
 * (we compute it in the pipeline), so we group by issuer + form_title
 * here as a serviceable proxy. The vendor_form_templates table joins
 * on the same composite key.
 */
export async function listFormVariants(): Promise<FormVariantRow[]> {
  await requireGodMode();
  const admin = createAdminClient();

  const [tplRes, savedRes] = await Promise.all([
    admin
      .from("third_party_templates")
      .select(
        "order_id, issuer, form_title, document_type, ingest_telemetry, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(500),
    admin
      .from("vendor_form_templates")
      .select(
        "issuer, form_title, content_fingerprint, master_type_key, approved_at"
      ),
  ]);

  const tplRows =
    (tplRes.data as Array<{
      order_id: string;
      issuer: string | null;
      form_title: string | null;
      document_type: string | null;
      ingest_telemetry: Record<string, unknown> | null;
      updated_at: string | null;
    }> | null) ?? [];
  const savedRows =
    (savedRes.data as Array<{
      issuer: string | null;
      form_title: string | null;
      content_fingerprint: string;
      master_type_key: string | null;
      approved_at: string | null;
    }> | null) ?? [];

  const savedKeys = new Set(
    savedRows.map(
      (s) =>
        `${(s.issuer ?? "").trim().toLowerCase()}|${(s.form_title ?? "").trim().toLowerCase()}`
    )
  );

  const grouped = new Map<string, FormVariantRow>();

  for (const r of tplRows) {
    const issuer = (r.issuer ?? "").trim();
    const formTitle = (r.form_title ?? "").trim();
    const key = `${issuer.toLowerCase()}|${formTitle.toLowerCase()}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.orderCount += 1;
      continue;
    }

    grouped.set(key, {
      fingerprint: null,
      issuer: issuer || null,
      formTitle: formTitle || null,
      masterTypeKey: r.document_type,
      templateSaved: savedKeys.has(key),
      orderCount: 1,
      latestOrderId: r.order_id,
      latestIngestAt: r.updated_at,
      latestTelemetry: r.ingest_telemetry,
    });
  }

  // Sort: forms without a saved template first (need staff attention),
  // then by most-recent ingest within each group.
  const out = Array.from(grouped.values());
  out.sort((a, b) => {
    if (a.templateSaved !== b.templateSaved) {
      return a.templateSaved ? 1 : -1;
    }
    const at = a.latestIngestAt ? new Date(a.latestIngestAt).getTime() : 0;
    const bt = b.latestIngestAt ? new Date(b.latestIngestAt).getTime() : 0;
    return bt - at;
  });

  return out;
}
