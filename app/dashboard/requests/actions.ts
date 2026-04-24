"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "../../../lib/supabase/admin";
import resend, { RESEND_FROM_EMAIL } from "../../../lib/resend";
import { getTemplate } from "../../../lib/document-templates";
import { generateDocumentPdf } from "../../../lib/pdf-generator";
import { formatMasterTypeKey } from "../_lib/format";

import { requireDashboardOrg } from "../_lib/require-dashboard-org";
import { stripe } from "../../../lib/stripe";

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

  // 4b. Record in order_documents table
  await admin.from("order_documents").insert({
    order_id: orderId,
    storage_path: storagePath,
    file_type: "application/pdf",
    document_type: masterTypeKey,
  });

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
  if (requesterEmail) {
    let downloadUrl = "";
    const { data: signedUrlData, error: signedUrlErr } = await admin.storage
      .from("order-documents")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

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
          ${downloadUrl ? `<p style="margin:24px 0;"><a href="${downloadUrl}" style="display:inline-block;background:#0f172a;color:#f8f5f0;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Download Document</a></p><p style="color:#888;font-size:12px;">This link expires in 7 days.</p>` : ""}
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
  return { ok: true };
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
