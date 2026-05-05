"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "../../../lib/supabase/admin";
import resend, { RESEND_FROM_EMAIL } from "../../../lib/resend";
import { getTemplate } from "../../../lib/document-templates";
import {
  generateDocumentPdf,
  type PdfMeta,
  type SignatureInfo,
} from "../../../lib/pdf-generator";
import {
  stampValuesOntoPdf,
  type OverlayFieldEntry,
} from "../../../lib/pdf-overlay-generator";
import { packageDocumentBundle, type PackageAttachment } from "../../../lib/pdf-packager";
import {
  dbAliasesForCategories,
  dbAliasesForCategory,
} from "../../../lib/document-categories";
import { formatMasterTypeKey } from "../_lib/format";

import { requireDashboardOrg } from "../_lib/require-dashboard-org";
import { stripe } from "../../../lib/stripe";
import { runThirdPartyIngestion } from "../../../lib/3p-template-pipeline";

/** 30 days, in seconds — used for every order-document signed URL. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * If this order has a 3P upload with a captured Form Parser layout,
 * download the original PDF and stamp the supplied values onto it.
 * Returns null when there's no 3P upload, no layout, or any source
 * data is missing — the caller falls back to the templated generator.
 */
async function tryGenerateOverlayPdf(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  values: Record<string, string | null>
): Promise<Uint8Array | null> {
  const { data: tpl } = await admin
    .from("third_party_templates")
    .select("storage_path_pdf, field_layout")
    .eq("order_id", orderId)
    .maybeSingle();

  const tplRow = tpl as
    | {
        storage_path_pdf: string | null;
        field_layout: OverlayFieldEntry[] | null;
      }
    | null;

  if (!tplRow?.storage_path_pdf) return null;
  if (!tplRow.field_layout || tplRow.field_layout.length === 0) return null;

  const { data: blob, error: dlErr } = await admin.storage
    .from("third-party-templates")
    .download(tplRow.storage_path_pdf);
  if (dlErr || !blob) {
    console.warn("[fulfillAndGenerate] could not download original PDF:", dlErr?.message);
    return null;
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const cleanValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "string" && v.trim().length > 0) cleanValues[k] = v;
  }

  return await stampValuesOntoPdf({
    originalPdfBuffer: buf,
    fieldLayout: tplRow.field_layout,
    values: cleanValues,
  });
}

export async function fulfillOrder(orderId: string) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("document_orders")
    .select("id, organization_id")
    .eq("id", orderId)
    .single();

  if (fetchError || !row || row.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  const { error: updateError } = await admin
    .from("document_orders")
    .update({
      order_status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath(`/dashboard/requests/${orderId}`);
  return { ok: true };
}

export async function rejectOrder(orderId: string, reason: string) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("document_orders")
    .select("id, organization_id, requester_name, requester_email, master_type_key, property_address")
    .eq("id", orderId)
    .single();

  if (fetchError || !row || row.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  const { error: updateError } = await admin
    .from("document_orders")
    .update({ order_status: "cancelled" })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message };
  }

  const requesterEmail = row.requester_email as string | null;
  if (requesterEmail) {
    try {
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: requesterEmail,
        subject: `Your document request has been declined`,
        html: `
          <p>Hi ${(row.requester_name as string) ?? "there"},</p>
          <p>Unfortunately, your request for <strong>${formatMasterTypeKey(row.master_type_key as string | null)}</strong> at <strong>${(row.property_address as string) ?? "the submitted property"}</strong> has been declined.</p>
          ${reason.trim() ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p>If you have questions, please contact the management company directly.</p>
          <p>— Havn</p>
        `,
      });
    } catch (emailErr) {
      console.error("Rejection email failed:", emailErr);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${orderId}`);
  return { ok: true };
}

/* ── Draft save ───────────────────────────────────────────────────────── */

export async function saveDraftFields(
  orderId: string,
  fields: Record<string, string | null>
): Promise<{ ok: true } | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("document_orders")
    .select("id, organization_id")
    .eq("id", orderId)
    .single();

  if (fetchError || !row || row.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  const { error: updateError } = await admin
    .from("document_orders")
    .update({ draft_fields: fields })
    .eq("id", orderId);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/dashboard/requests/${orderId}`);
  return { ok: true };
}

/* ── Fulfill with PDF generation ──────────────────────────────────────── */

export type SignaturePayload = {
  signerName: string;
  signerTitle?: string | null;
  signerEmail: string;
  signedAt?: string; // ISO string; server defaults to now()
  /** Raw base64 signature image OR the marker "click-to-sign". */
  signatureData?: string | null;
};

export async function fulfillAndGenerate(
  orderId: string,
  finalFields: Record<string, string | null>,
  communityId: string | null,
  signature?: SignaturePayload
): Promise<{ ok: true; version: number } | { error: string }> {
  const { organizationId, userId } = await requireDashboardOrg();
  const admin = createAdminClient();

  // 1. Load order
  const { data: order, error: orderErr } = await admin
    .from("document_orders")
    .select(
      "id, organization_id, master_type_key, requester_name, requester_email, property_address, community_id"
    )
    .eq("id", orderId)
    .single();

  if (orderErr || !order || order.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  // 2. Resolve community + state for template + attachments lookups.
  const effectiveCommunityId =
    (communityId ?? (order.community_id as string | null)) || null;

  let communityState: string | null = null;
  if (effectiveCommunityId) {
    const { data: community } = await admin
      .from("communities")
      .select("state")
      .eq("id", effectiveCommunityId)
      .maybeSingle();
    communityState = (community?.state as string | null) ?? null;
  }

  const masterTypeKey = order.master_type_key as string;
  const template = getTemplate(masterTypeKey, communityState);
  if (!template) return { error: `No template for: ${masterTypeKey}` };

  // 3. Signature gate: templates that require signatures can't generate without one.
  if (template.requiresSignature && !signature) {
    return { error: "This document requires a signature before generation." };
  }

  // 4. Pull org branding + contact for PDF meta.
  const { data: org } = await admin
    .from("organizations")
    .select("name, logo_url, support_email, account_type")
    .eq("id", organizationId)
    .single();
  const orgName = (org?.name as string) ?? "Havn";
  const accountType =
    (org?.account_type as PdfMeta["accountType"]) ?? "management_company";
  const contactEmail = (org?.support_email as string | null) ?? null;

  let logoBytes: Uint8Array | null = null;
  let logoMimeType: PdfMeta["logoMimeType"] = null;
  const logoUrl = org?.logo_url as string | null;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        logoBytes = new Uint8Array(ab);
        const ct = res.headers.get("content-type") ?? "";
        logoMimeType = ct.includes("jpeg") || ct.includes("jpg")
          ? "image/jpeg"
          : "image/png";
      }
    } catch (err) {
      console.warn("[fulfillAndGenerate] Logo fetch failed:", err);
    }
  }

  // 5. Generate the main PDF (optionally with an embedded signature).
  const generatedAt = new Date();
  const signatureInfo: SignatureInfo | undefined = signature
    ? {
        signerName: signature.signerName,
        signerTitle: signature.signerTitle ?? null,
        signedAt: signature.signedAt ? new Date(signature.signedAt) : generatedAt,
        signatureData: signature.signatureData ?? "click-to-sign",
      }
    : undefined;

  // If this order originated from a 3P upload with a captured form
  // layout, stamp the values onto a copy of the original PDF instead
  // of generating from a templated layout — staff edits in the overlay
  // come right back on the same form the requester sent in.
  const overlayBytes = await tryGenerateOverlayPdf(
    admin,
    orderId,
    finalFields
  ).catch((err) => {
    console.warn("[fulfillAndGenerate] overlay generation failed:", err);
    return null;
  });

  const mainPdfBytes = overlayBytes ?? (await generateDocumentPdf(
    template,
    finalFields,
    {
      orgName,
      generatedAt,
      orderId,
      state: communityState,
      logoBytes,
      logoMimeType,
      contactEmail,
      accountType,
    },
    signatureInfo
  ));

  // 6. Bundle attachments when the template + community have them.
  let deliveredPdfBytes: Uint8Array = mainPdfBytes;
  if (template.attachments?.enabled && effectiveCommunityId) {
    const attachments = await loadCommunityAttachments(
      admin,
      effectiveCommunityId,
      template.attachments.categories
    );
    if (attachments.length > 0) {
      deliveredPdfBytes = await packageDocumentBundle(mainPdfBytes, attachments, {
        mainDocumentTitle: template.title,
        orgName,
      });
    }
  }

  // 7. Upload packaged PDF to storage.
  const storagePath = `${orderId}/${Date.now()}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("order-documents")
    .upload(storagePath, deliveredPdfBytes, { contentType: "application/pdf" });

  if (uploadError) {
    return { error: `PDF upload failed: ${uploadError.message}` };
  }

  // 8. Compute next version (V1, V2, V3…) — keep every prior generation.
  const { data: priorVersions } = await admin
    .from("order_documents")
    .select("version")
    .eq("order_id", orderId)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = ((priorVersions?.[0]?.version as number | null) ?? 0) + 1;

  const expiresAt =
    template.expirationDays != null
      ? new Date(generatedAt.getTime() + template.expirationDays * 86400000)
      : null;

  // 9. Record this version in order_documents.
  const { data: docInsert, error: docErr } = await admin
    .from("order_documents")
    .insert({
      order_id: orderId,
      storage_path: storagePath,
      file_type: "application/pdf",
      document_type: masterTypeKey,
      version: nextVersion,
      generated_by: userId,
      generated_at: generatedAt.toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
    })
    .select("id")
    .single();

  if (docErr) {
    console.error("[fulfillAndGenerate] order_documents insert failed:", docErr);
    return { error: "Failed to record generated document." };
  }

  // 10. Persist the signature (if any) tied to this exact version.
  if (signature) {
    const { error: sigErr } = await admin.from("document_signatures").insert({
      order_id: orderId,
      order_document_id: docInsert?.id as string | null,
      version: nextVersion,
      signer_name: signature.signerName,
      signer_email: signature.signerEmail,
      signer_title: signature.signerTitle ?? null,
      signer_user_id: userId,
      certification_text:
        template.legalLanguage?.certificationText ??
        "I certify that the information provided is accurate.",
      signed_at: signatureInfo!.signedAt.toISOString(),
      signature_data: signature.signatureData ?? "click-to-sign",
    });
    if (sigErr) {
      console.error("[fulfillAndGenerate] Signature insert failed:", sigErr);
    }
  }

  // 11. Update community_id on order if it changed.
  if (communityId && communityId !== order.community_id) {
    await admin
      .from("document_orders")
      .update({ community_id: communityId })
      .eq("id", orderId);
  }

  // 12. Cache community-level fields for reuse (manual overrides from review).
  if (effectiveCommunityId) {
    const nowIso = new Date().toISOString();
    const baseRows = template.fields
      .filter((f) => f.communityLevel && finalFields[f.key]?.trim())
      .map((f) => ({
        community_id: effectiveCommunityId,
        field_key: f.key,
        field_value: finalFields[f.key],
        source: "manual",
        updated_at: nowIso,
      }));
    const allCacheRows = [
      ...baseRows.map((r) => ({ ...r, document_type: masterTypeKey })),
      ...baseRows.map((r) => ({ ...r, document_type: "_shared" })),
    ];
    if (allCacheRows.length > 0) {
      await admin
        .from("community_field_cache")
        .upsert(allCacheRows, { onConflict: "community_id,document_type,field_key" });
    }
  }

  // 13. Mark order fulfilled.
  const { error: fulfillErr } = await admin
    .from("document_orders")
    .update({
      order_status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      draft_fields: finalFields,
    })
    .eq("id", orderId);

  if (fulfillErr) return { error: fulfillErr.message };

  // 14. Delivery email with 30-day signed URL.
  const requesterEmail = order.requester_email as string | null;
  if (requesterEmail) {
    let downloadUrl = "";
    const { data: signedUrlData, error: signedUrlErr } = await admin.storage
      .from("order-documents")
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signedUrlErr) {
      console.error("[fulfillAndGenerate] Signed URL failed:", signedUrlErr.message);
    } else if (signedUrlData?.signedUrl) {
      downloadUrl = signedUrlData.signedUrl;
    }

    try {
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: requesterEmail,
        subject: `Your ${formatMasterTypeKey(masterTypeKey)} is ready`,
        html: `
          <p>Hi ${(order.requester_name as string) ?? "there"},</p>
          <p>Your <strong>${formatMasterTypeKey(masterTypeKey)}</strong> for <strong>${(order.property_address as string) ?? "the submitted property"}</strong> is ready.</p>
          ${downloadUrl ? `<p style="margin:24px 0;"><a href="${downloadUrl}" style="display:inline-block;background:#0f172a;color:#f8f5f0;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Download Document</a></p><p style="color:#888;font-size:12px;">This link expires in 30 days.</p>` : ""}
          <p>Thank you for using Havn.</p>
          <p>— ${orgName}</p>
        `,
      });
    } catch (emailErr) {
      console.error("[fulfillAndGenerate] Delivery email failed:", emailErr);
    }
  } else {
    console.error("[fulfillAndGenerate] No requester email on order — email not sent");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${orderId}`);
  revalidatePath(`/dashboard/requests/${orderId}/review`);
  return { ok: true, version: nextVersion };
}

/* ── Versions + download URLs ─────────────────────────────────────────── */

export type OrderDocumentVersion = {
  id: string;
  version: number;
  generatedAt: string;
  expiresAt: string | null;
  documentType: string | null;
  hasSignature: boolean;
  signerName: string | null;
  signedAt: string | null;
};

export async function listOrderDocumentVersions(
  orderId: string
): Promise<OrderDocumentVersion[] | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("document_orders")
    .select("id, organization_id")
    .eq("id", orderId)
    .single();
  if (!order || order.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  const { data: rows, error } = await admin
    .from("order_documents")
    .select("id, version, generated_at, expires_at, document_type")
    .eq("order_id", orderId)
    .order("version", { ascending: false });
  if (error) return { error: error.message };

  const orderDocIds = (rows ?? []).map((r) => r.id as string);
  const sigMap = new Map<string, { signer: string; signedAt: string }>();
  if (orderDocIds.length > 0) {
    const { data: sigs } = await admin
      .from("document_signatures")
      .select("order_document_id, signer_name, signed_at")
      .in("order_document_id", orderDocIds);
    for (const s of sigs ?? []) {
      if (s.order_document_id) {
        sigMap.set(s.order_document_id as string, {
          signer: s.signer_name as string,
          signedAt: s.signed_at as string,
        });
      }
    }
  }

  return (rows ?? []).map((r) => {
    const sig = sigMap.get(r.id as string);
    return {
      id: r.id as string,
      version: (r.version as number | null) ?? 1,
      generatedAt: (r.generated_at as string | null) ?? "",
      expiresAt: (r.expires_at as string | null) ?? null,
      documentType: (r.document_type as string | null) ?? null,
      hasSignature: !!sig,
      signerName: sig?.signer ?? null,
      signedAt: sig?.signedAt ?? null,
    };
  });
}

export async function getVersionDownloadUrl(
  orderDocumentId: string
): Promise<{ url: string } | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("order_documents")
    .select("id, storage_path, order_id")
    .eq("id", orderDocumentId)
    .single();
  if (!row) return { error: "Document not found." };

  const { data: order } = await admin
    .from("document_orders")
    .select("organization_id")
    .eq("id", row.order_id as string)
    .single();
  if (!order || order.organization_id !== organizationId) {
    return { error: "Access denied." };
  }

  const { data: signedUrlData, error: signedUrlErr } = await admin.storage
    .from("order-documents")
    .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL_SECONDS);
  if (signedUrlErr || !signedUrlData?.signedUrl) {
    return { error: signedUrlErr?.message ?? "Failed to create download URL." };
  }
  return { url: signedUrlData.signedUrl };
}

/* ── Attachments helper ───────────────────────────────────────────────── */

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadCommunityAttachments(
  admin: AdminClient,
  communityId: string,
  categoriesInOrder: string[]
): Promise<PackageAttachment[]> {
  // Expand each template category to include legacy aliases so existing
  // rows tagged with pre-canonical names (e.g. "CC&Rs / Declaration") still
  // match the new canonical taxonomy without a DB migration.
  const allDbValues = dbAliasesForCategories(categoriesInOrder);

  const { data: docs, error } = await admin
    .from("community_documents")
    .select("id, document_category, original_filename, storage_path_pdf, created_at, archived")
    .eq("community_id", communityId)
    .in("document_category", allDbValues)
    .eq("archived", false)
    .not("storage_path_pdf", "is", null)
    .order("created_at", { ascending: false });
  if (error || !docs || docs.length === 0) return [];

  // Bucket documents by *canonical* category — so a legacy "Bylaws" row
  // and a newer "Bylaws and amendments" row both land in the same slot,
  // and the most recent one wins.
  const latestByCanonical = new Map<string, (typeof docs)[number]>();
  for (const category of categoriesInOrder) {
    const aliases = new Set(dbAliasesForCategory(category));
    const candidates = docs.filter((d) => aliases.has(d.document_category as string));
    if (candidates.length > 0) {
      // `docs` is already sorted by created_at desc.
      latestByCanonical.set(category, candidates[0]);
    }
  }

  const ordered: PackageAttachment[] = [];
  for (const category of categoriesInOrder) {
    const doc = latestByCanonical.get(category);
    if (!doc) continue;
    const storagePath = doc.storage_path_pdf as string | null;
    if (!storagePath) continue;
    const { data: blob, error: dlErr } = await admin.storage
      .from("community-documents")
      .download(storagePath);
    if (dlErr || !blob) {
      console.warn(
        `[attachments] Download failed for ${category} (${storagePath}): ${dlErr?.message ?? "empty"}`
      );
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    ordered.push({
      category,
      title: (doc.original_filename as string | null) ?? category,
      bytes,
    });
  }
  return ordered;
}

export async function refundOrder(orderId: string, reason?: string) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("document_orders")
    .select("id, organization_id, order_status, stripe_payment_intent_id")
    .eq("id", orderId)
    .single();

  if (fetchError || !row || row.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  const paymentIntentId = row.stripe_payment_intent_id as string | null;
  if (!paymentIntentId) {
    return { error: "This order has no Stripe payment to refund." };
  }

  if (row.order_status !== "paid") {
    return {
      error: `Only paid orders can be refunded. Current status: ${row.order_status ?? "unknown"}.`,
    };
  }

  try {
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      // Destination charges: pull funds back from the connected account…
      reverse_transfer: true,
      // …and refund Havn's 35% application fee proportionally.
      refund_application_fee: true,
      metadata: {
        orderId,
        reason: reason?.trim() ?? "",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Refund failed.";
    return { error: msg };
  }

  // Status flip happens in the charge.refunded webhook — markOrderRefunded is
  // idempotent, so we don't duplicate the write here.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${orderId}`);
  return { ok: true };
}

const ATTACH_BUCKET = "third-party-templates";
const ATTACH_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ATTACH_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/* ── attachThirdPartyForm ──────────────────────────────────────────────
 * Staff recovery for orders whose 3P upload was lost between the
 * requester portal and submission, or that arrived outside the portal
 * (emailed, faxed, etc.). Uploads the file to Supabase Storage,
 * inserts a third_party_templates row, links it to the order, and
 * fires the same ingestion pipeline a fresh requester upload would.
 *
 * Refuses to overwrite — caller must use the review page's "Re-process
 * upload" if a template row already exists for this order.
 */
export async function attachThirdPartyForm(
  orderId: string,
  formData: FormData
): Promise<{ ok: true; templateId: string } | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("document_orders")
    .select("id, organization_id, third_party_template_id")
    .eq("id", orderId)
    .single();

  if (orderErr || !order || order.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }
  if (order.third_party_template_id) {
    return {
      error:
        "This order already has a 3P upload. Use 'Re-process upload' on the review page to re-run ingestion.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided." };
  }
  if (file.size === 0) {
    return { error: "File is empty." };
  }
  if (file.size > ATTACH_MAX_BYTES) {
    return { error: `File is too large (max ${ATTACH_MAX_BYTES / (1024 * 1024)} MB).` };
  }
  const mimeType = file.type || "application/pdf";
  if (!ATTACH_ALLOWED_MIME.has(mimeType)) {
    return { error: "Only PDF and DOCX files are accepted." };
  }

  const safeName = file.name
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "upload.pdf";
  const storagePath = `${orderId}/${Date.now()}-${safeName}`;

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from(ATTACH_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadErr) {
    return { error: `Upload failed: ${uploadErr.message}` };
  }

  const { data: tpl, error: tplErr } = await admin
    .from("third_party_templates")
    .insert({
      order_id: orderId,
      organization_id: organizationId,
      storage_path_pdf: storagePath,
      original_filename: file.name,
      mime_type: mimeType,
      ingest_status: "pending",
      review_status: "pending",
    })
    .select("id")
    .single();

  if (tplErr || !tpl) {
    // Best-effort cleanup of the orphaned object.
    await admin.storage.from(ATTACH_BUCKET).remove([storagePath]);
    return { error: tplErr?.message ?? "Failed to create template row." };
  }
  const templateId = (tpl as { id: string }).id;

  const { error: linkErr } = await admin
    .from("document_orders")
    .update({
      third_party_template_id: templateId,
      third_party_review_status: "pending",
    })
    .eq("id", orderId);
  if (linkErr) {
    return { error: `Could not link template to order: ${linkErr.message}` };
  }

  // Kick off ingestion. Fire-and-forget — same shape as Stripe webhook entry.
  runThirdPartyIngestion({ thirdPartyTemplateId: templateId }).catch((err) => {
    console.error(`[attachThirdPartyForm] ingestion kickoff failed:`, err);
  });

  revalidatePath(`/dashboard/requests/${orderId}`);
  revalidatePath(`/dashboard/requests/${orderId}/review`);
  return { ok: true, templateId };
}
