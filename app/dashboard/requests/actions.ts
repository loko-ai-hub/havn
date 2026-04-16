"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "../../../lib/supabase/admin";
import resend, { RESEND_FROM_EMAIL } from "../../../lib/resend";
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
