"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "../../../lib/supabase/admin";
import resend, { RESEND_FROM_EMAIL } from "../../../lib/resend";
import { getTemplate } from "../../../lib/document-templates";
import { generateDocumentPdf } from "../../../lib/pdf-generator";
import { formatMasterTypeKey } from "../_lib/format";

import { requireDashboardOrg } from "../_lib/require-dashboard-org";

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
  if (requesterEmail && process.env.RESEND_API_KEY) {
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

export async function fulfillAndGenerate(
  orderId: string,
  finalFields: Record<string, string | null>,
  communityId: string | null
): Promise<{ ok: true } | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  // 1. Load order
  const { data: order, error: orderErr } = await admin
    .from("document_orders")
    .select("id, organization_id, master_type_key, requester_name, requester_email, property_address")
    .eq("id", orderId)
    .single();

  if (orderErr || !order || order.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  const masterTypeKey = order.master_type_key as string;
  const template = getTemplate(masterTypeKey);
  if (!template) return { error: `No template for: ${masterTypeKey}` };

  // 2. Get org name for PDF header
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();
  const orgName = (org?.name as string) ?? "Havn";

  // 3. Generate PDF
  const pdfBytes = await generateDocumentPdf(template, finalFields, {
    orgName,
    generatedAt: new Date(),
    orderId,
  });

  // 4. Upload PDF to storage
  const storagePath = `${orderId}/${Date.now()}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("order-documents")
    .upload(storagePath, pdfBytes, { contentType: "application/pdf" });

  if (uploadError) {
    return { error: `PDF upload failed: ${uploadError.message}` };
  }

  // 5. Update community_id on order if provided
  if (communityId) {
    await admin
      .from("document_orders")
      .update({ community_id: communityId })
      .eq("id", orderId);
  }

  // 6. Cache community-level fields for reuse
  if (communityId) {
    const cacheRows = template.fields
      .filter((f) => f.communityLevel && finalFields[f.key]?.trim())
      .map((f) => ({
        community_id: communityId,
        document_type: masterTypeKey,
        field_key: f.key,
        field_value: finalFields[f.key],
        source: "manual",
        updated_at: new Date().toISOString(),
      }));

    // Also save shared fields (community-level fields that apply across all doc types)
    const sharedRows = template.fields
      .filter((f) => f.communityLevel && finalFields[f.key]?.trim())
      .map((f) => ({
        community_id: communityId,
        document_type: "_shared",
        field_key: f.key,
        field_value: finalFields[f.key],
        source: "manual",
        updated_at: new Date().toISOString(),
      }));

    const allCacheRows = [...cacheRows, ...sharedRows];
    if (allCacheRows.length > 0) {
      await admin
        .from("community_field_cache")
        .upsert(allCacheRows, { onConflict: "community_id,document_type,field_key" });
    }
  }

  // 7. Mark order fulfilled
  const { error: fulfillErr } = await admin
    .from("document_orders")
    .update({
      order_status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      draft_fields: finalFields,
    })
    .eq("id", orderId);

  if (fulfillErr) return { error: fulfillErr.message };

  // 8. Send delivery email with signed download link
  const requesterEmail = order.requester_email as string | null;
  if (requesterEmail && process.env.RESEND_API_KEY) {
    const { data: signedUrl } = await admin.storage
      .from("order-documents")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

    try {
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: requesterEmail,
        subject: `Your ${formatMasterTypeKey(masterTypeKey)} is ready`,
        html: `
          <p>Hi ${(order.requester_name as string) ?? "there"},</p>
          <p>Your <strong>${formatMasterTypeKey(masterTypeKey)}</strong> for <strong>${(order.property_address as string) ?? "the submitted property"}</strong> is ready.</p>
          ${signedUrl?.signedUrl ? `<p style="margin:24px 0;"><a href="${signedUrl.signedUrl}" style="display:inline-block;background:#0f172a;color:#f8f5f0;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Download Document</a></p><p style="color:#888;font-size:12px;">This link expires in 7 days.</p>` : ""}
          <p>Thank you for using Havn.</p>
          <p>— ${orgName}</p>
        `,
      });
    } catch (emailErr) {
      console.error("Delivery email failed:", emailErr);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${orderId}`);
  return { ok: true };
}
