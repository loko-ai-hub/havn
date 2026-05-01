"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildRegistryEntrySource,
  type ProposedRegistryField,
} from "@/lib/propose-registry-fields";
import { runThirdPartyIngestion } from "@/lib/3p-template-pipeline";
import {
  send3pFormApproved,
  send3pFormDenied,
} from "@/lib/resend";

import { GOD_MODE_EMAILS } from "./constants";

async function requireGodMode(): Promise<{ email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  if (!user || !GOD_MODE_EMAILS.includes(email)) {
    throw new Error("Forbidden");
  }
  return { email };
}

/* ── Types surfaced to the client ─────────────────────────────────────── */

export type ThirdPartyTemplateListItem = {
  id: string;
  orderId: string;
  orderShortId: string;
  organizationId: string;
  organizationName: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  formTitle: string | null;
  issuer: string | null;
  documentType: string | null;
  orderDocumentType: string | null;
  mappedCount: number;
  unmappedCount: number;
  autoFillCoveragePct: number | null;
  ingestStatus: string;
  ingestError: string | null;
  reviewStatus: string;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  autoDefaultedAt: string | null;
  createdAt: string;
  requesterEmail: string | null;
  requesterName: string | null;
  propertyAddress: string | null;
};

export type ThirdPartyDetectedField = {
  externalLabel: string;
  registryKey: string | null;
  confidence: number | null;
  reasoning: string | null;
  fieldKind: string;
};

export type ThirdPartyTemplateDetail = ThirdPartyTemplateListItem & {
  detectedFields: ThirdPartyDetectedField[];
  proposals: Array<{
    id: string;
    proposedKey: string;
    proposedLabel: string;
    proposedType: string;
    rationale: string | null;
    status: string;
    reviewerEmail: string | null;
    reviewedAt: string | null;
    createdAt: string;
  }>;
};

/* ── List + detail ────────────────────────────────────────────────────── */

type ReviewFilter = "all" | "pending" | "approved" | "denied" | "auto_defaulted";

export async function listThirdPartyTemplates(params: {
  filter?: ReviewFilter;
}): Promise<ThirdPartyTemplateListItem[]> {
  await requireGodMode();
  const admin = createAdminClient();

  let query = admin
    .from("third_party_templates")
    .select(
      `id, order_id, organization_id, original_filename, mime_type, form_title, issuer,
       document_type, mapped_count, unmapped_count, auto_fill_coverage_pct,
       ingest_status, ingest_error, review_status, reviewer_email, reviewed_at,
       review_notes, auto_defaulted_at, created_at,
       order:order_id (requester_email, requester_name, property_address, master_type_key),
       organization:organization_id (name)`
    )
    .order("created_at", { ascending: false });

  if (params.filter && params.filter !== "all") {
    query = query.eq("review_status", params.filter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const orderObj = row.order as {
      requester_email?: string | null;
      requester_name?: string | null;
      property_address?: string | null;
      master_type_key?: string | null;
    } | null;
    const orgObj = row.organization as { name?: string | null } | null;
    const orderId = row.order_id as string;
    return {
      id: row.id as string,
      orderId,
      orderShortId: orderId.slice(0, 8),
      organizationId: row.organization_id as string,
      organizationName: orgObj?.name ?? null,
      originalFilename: (row.original_filename as string | null) ?? null,
      mimeType: (row.mime_type as string | null) ?? null,
      formTitle: (row.form_title as string | null) ?? null,
      issuer: (row.issuer as string | null) ?? null,
      documentType: (row.document_type as string | null) ?? null,
      orderDocumentType: orderObj?.master_type_key ?? null,
      mappedCount: (row.mapped_count as number | null) ?? 0,
      unmappedCount: (row.unmapped_count as number | null) ?? 0,
      autoFillCoveragePct: (row.auto_fill_coverage_pct as number | null) ?? null,
      ingestStatus: (row.ingest_status as string) ?? "pending",
      ingestError: (row.ingest_error as string | null) ?? null,
      reviewStatus: (row.review_status as string) ?? "pending",
      reviewerEmail: (row.reviewer_email as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      reviewNotes: (row.review_notes as string | null) ?? null,
      autoDefaultedAt: (row.auto_defaulted_at as string | null) ?? null,
      createdAt: row.created_at as string,
      requesterEmail: orderObj?.requester_email ?? null,
      requesterName: orderObj?.requester_name ?? null,
      propertyAddress: orderObj?.property_address ?? null,
    };
  });
}

export async function getThirdPartyTemplateDetail(
  id: string
): Promise<ThirdPartyTemplateDetail | { error: string }> {
  await requireGodMode();
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("third_party_templates")
    .select(
      `id, order_id, organization_id, original_filename, mime_type, form_title, issuer,
       document_type, detected_fields, mapped_count, unmapped_count, auto_fill_coverage_pct,
       ingest_status, ingest_error, review_status, reviewer_email, reviewed_at,
       review_notes, auto_defaulted_at, created_at,
       order:order_id (requester_email, requester_name, property_address, master_type_key),
       organization:organization_id (name)`
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!row) return { error: "Not found" };

  const { data: proposals } = await admin
    .from("field_registry_proposals")
    .select("id, proposed_field_key, proposed_label, proposed_type, rationale, status, reviewer_email, reviewed_at, created_at")
    .eq("source_template_id", id)
    .order("created_at", { ascending: true });

  const orderObj = row.order as {
    requester_email?: string | null;
    requester_name?: string | null;
    property_address?: string | null;
    master_type_key?: string | null;
  } | null;
  const orgObj = row.organization as { name?: string | null } | null;
  const orderId = row.order_id as string;

  return {
    id: row.id as string,
    orderId,
    orderShortId: orderId.slice(0, 8),
    organizationId: row.organization_id as string,
    organizationName: orgObj?.name ?? null,
    originalFilename: (row.original_filename as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    formTitle: (row.form_title as string | null) ?? null,
    issuer: (row.issuer as string | null) ?? null,
    documentType: (row.document_type as string | null) ?? null,
    orderDocumentType: orderObj?.master_type_key ?? null,
    mappedCount: (row.mapped_count as number | null) ?? 0,
    unmappedCount: (row.unmapped_count as number | null) ?? 0,
    autoFillCoveragePct: (row.auto_fill_coverage_pct as number | null) ?? null,
    ingestStatus: (row.ingest_status as string) ?? "pending",
    ingestError: (row.ingest_error as string | null) ?? null,
    reviewStatus: (row.review_status as string) ?? "pending",
    reviewerEmail: (row.reviewer_email as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    reviewNotes: (row.review_notes as string | null) ?? null,
    autoDefaultedAt: (row.auto_defaulted_at as string | null) ?? null,
    createdAt: row.created_at as string,
    requesterEmail: orderObj?.requester_email ?? null,
    requesterName: orderObj?.requester_name ?? null,
    propertyAddress: orderObj?.property_address ?? null,
    detectedFields: ((row.detected_fields as ThirdPartyDetectedField[] | null) ?? []),
    proposals: (proposals ?? []).map((p) => ({
      id: p.id as string,
      proposedKey: p.proposed_field_key as string,
      proposedLabel: p.proposed_label as string,
      proposedType: p.proposed_type as string,
      rationale: (p.rationale as string | null) ?? null,
      status: p.status as string,
      reviewerEmail: (p.reviewer_email as string | null) ?? null,
      reviewedAt: (p.reviewed_at as string | null) ?? null,
      createdAt: p.created_at as string,
    })),
  };
}

export async function getThirdPartySignedUrl(
  id: string
): Promise<{ url: string } | { error: string }> {
  await requireGodMode();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("third_party_templates")
    .select("storage_path_pdf")
    .eq("id", id)
    .maybeSingle();
  if (!row?.storage_path_pdf) return { error: "No file on record" };
  const { data, error } = await admin.storage
    .from("third-party-templates")
    .createSignedUrl(row.storage_path_pdf as string, 60 * 30); // 30 min
  if (error || !data?.signedUrl) return { error: error?.message ?? "Could not create signed URL" };
  return { url: data.signedUrl };
}

/* ── Approve / Deny ───────────────────────────────────────────────────── */

export async function approveThirdPartyTemplate(params: {
  id: string;
  notes?: string;
}): Promise<{ ok: true } | { error: string }> {
  const { email } = await requireGodMode();
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("third_party_templates")
    .select(
      `id, order_id, organization_id, form_title,
       order:order_id (requester_email, requester_name, property_address),
       organization:organization_id (name)`
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!row) return { error: "Template not found" };

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("third_party_templates")
    .update({
      review_status: "approved",
      reviewer_email: email,
      reviewed_at: nowIso,
      review_notes: params.notes ?? null,
      updated_at: nowIso,
    })
    .eq("id", params.id);
  if (updErr) return { error: updErr.message };

  await admin
    .from("document_orders")
    .update({ third_party_review_status: "approved" })
    .eq("id", row.order_id as string);

  const orderObj = row.order as {
    requester_email?: string | null;
    requester_name?: string | null;
    property_address?: string | null;
  } | null;
  const orgObj = row.organization as { name?: string | null } | null;

  if (orderObj?.requester_email) {
    try {
      await send3pFormApproved({
        to: orderObj.requester_email,
        requesterName: orderObj.requester_name ?? "there",
        propertyAddress: orderObj.property_address ?? "the subject property",
        orgName: orgObj?.name ?? "your association's management company",
        formTitle: (row.form_title as string | null) ?? null,
      });
    } catch (err) {
      console.warn("[approve3p] requester email failed:", err);
    }
  }

  return { ok: true };
}

export async function denyThirdPartyTemplate(params: {
  id: string;
  reason: string;
}): Promise<{ ok: true } | { error: string }> {
  const { email } = await requireGodMode();
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("third_party_templates")
    .select(
      `id, order_id, organization_id, form_title,
       order:order_id (requester_email, requester_name, property_address, master_type_key),
       organization:organization_id (name)`
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!row) return { error: "Template not found" };

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("third_party_templates")
    .update({
      review_status: "denied",
      reviewer_email: email,
      reviewed_at: nowIso,
      review_notes: params.reason ?? null,
      updated_at: nowIso,
    })
    .eq("id", params.id);
  if (updErr) return { error: updErr.message };

  await admin
    .from("document_orders")
    .update({ third_party_review_status: "denied" })
    .eq("id", row.order_id as string);

  const orderObj = row.order as {
    requester_email?: string | null;
    requester_name?: string | null;
    property_address?: string | null;
    master_type_key?: string | null;
  } | null;
  const orgObj = row.organization as { name?: string | null } | null;

  if (orderObj?.requester_email) {
    try {
      await send3pFormDenied({
        to: orderObj.requester_email,
        requesterName: orderObj.requester_name ?? "there",
        propertyAddress: orderObj.property_address ?? "the subject property",
        reason: params.reason ?? "",
        orgName: orgObj?.name ?? "your association's management company",
        docType: formatMasterTypeKey(orderObj.master_type_key ?? null),
        formTitle: (row.form_title as string | null) ?? null,
      });
    } catch (err) {
      console.warn("[deny3p] requester email failed:", err);
    }
  }

  return { ok: true };
}

/* ── Retry ingestion ──────────────────────────────────────────────────── */

export async function retryThirdPartyIngestion(
  id: string
): Promise<{ ok: true } | { error: string }> {
  await requireGodMode();
  const result = await runThirdPartyIngestion({ thirdPartyTemplateId: id });
  if (!result.ok) return { error: result.error ?? "Retry failed" };
  return { ok: true };
}

/* ── Field proposals ──────────────────────────────────────────────────── */

export async function approveFieldProposal(
  id: string
): Promise<{ ok: true; source: string } | { error: string }> {
  const { email } = await requireGodMode();
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("field_registry_proposals")
    .select("id, proposed_field_key, proposed_label, proposed_type, rationale")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Proposal not found" };

  const { error: updErr } = await admin
    .from("field_registry_proposals")
    .update({
      status: "approved",
      reviewer_email: email,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  const proposal: ProposedRegistryField = {
    externalLabel: "",
    proposedKey: row.proposed_field_key as string,
    proposedLabel: row.proposed_label as string,
    proposedType: (row.proposed_type as ProposedRegistryField["proposedType"]) ?? "text",
    rationale: (row.rationale as string | null) ?? "",
  };
  const source = buildRegistryEntrySource(proposal);
  return { ok: true, source };
}

export async function rejectFieldProposal(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const { email } = await requireGodMode();
  const admin = createAdminClient();
  const { error } = await admin
    .from("field_registry_proposals")
    .update({
      status: "rejected",
      reviewer_email: email,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

/* ── Small helpers ────────────────────────────────────────────────────── */

function formatMasterTypeKey(raw: string | null): string {
  if (!raw) return "document";
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
