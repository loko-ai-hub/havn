import {
  formatCurrency,
  formatDeliverySpeed,
  formatMasterTypeKey,
} from "@/app/dashboard/_lib/format";
import { REQUESTER_TYPES } from "@/lib/portal-data";
import resend, { RESEND_FROM_EMAIL, sendManagementNotification } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

function formatRequesterRole(role: string | null | undefined): string {
  if (!role) return "—";
  const match = REQUESTER_TYPES.find((t) => t.value === role);
  return match?.title ?? formatMasterTypeKey(role);
}

type MarkPaidResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; error: string };

// Idempotent: the conditional UPDATE (neq "paid") ensures emails fire at most once
// even if both the client-side `confirmPayment` and the Stripe webhook race.
export async function markOrderPaid(
  orderId: string,
  paymentIntentId: string
): Promise<MarkPaidResult> {
  const supabase = createAdminClient();

  const { data: updatedRows, error: updateError } = await supabase
    .from("document_orders")
    .update({
      order_status: "paid",
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .neq("order_status", "paid")
    .select(
      "id, organization_id, requester_name, requester_email, requester_role, property_address, master_type_key, delivery_speed, total_fee"
    );

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Row already paid — nothing else to do (emails already sent on the first transition).
  if (!updatedRows || updatedRows.length === 0) {
    return { ok: true, alreadyPaid: true };
  }

  const orderRow = updatedRows[0];

  const { data: orgRow, error: orgFetchError } = await supabase
    .from("organizations")
    .select("name, support_email, portal_slug")
    .eq("id", orderRow.organization_id)
    .single();

  if (orgFetchError || !orgRow) {
    console.error("markOrderPaid: failed to load organization:", orgFetchError);
    return { ok: true, alreadyPaid: false };
  }

  const supportEmail = orgRow.support_email as string | null | undefined;
  if (supportEmail) {
    try {
      await sendManagementNotification({
        orgName: (orgRow.name as string) ?? "Organization",
        orgEmail: supportEmail,
        orderId: orderRow.id as string,
        requesterName: (orderRow.requester_name as string) ?? "",
        requesterEmail: (orderRow.requester_email as string) ?? "",
        requesterRole: formatRequesterRole(orderRow.requester_role as string | null),
        propertyAddress: (orderRow.property_address as string) ?? "",
        documentType: formatMasterTypeKey(orderRow.master_type_key as string | null),
        deliverySpeed: formatDeliverySpeed(orderRow.delivery_speed as string | null),
        totalFee: Number(orderRow.total_fee ?? 0),
        portalSlug: (orgRow.portal_slug as string) ?? "",
      });
    } catch (emailError) {
      console.error("Management notification email failed:", emailError);
    }
  }

  const requesterEmail = orderRow.requester_email as string | null;
  if (requesterEmail && process.env.RESEND_API_KEY) {
    try {
      const shortId = (orderRow.id as string).slice(0, 8);
      const totalFee = Number(orderRow.total_fee ?? 0);
      const orgDisplayName = (orgRow.name as string) ?? "Havn";
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: requesterEmail,
        subject: `Your order has been received — ${orgDisplayName}`,
        html: `
          <p>Hi ${(orderRow.requester_name as string) ?? "there"}, your payment was confirmed and your order is now being processed.</p>
          <p><strong>Order ID:</strong> ${shortId}</p>
          <p><strong>Document:</strong> ${formatMasterTypeKey(orderRow.master_type_key as string | null)}</p>
          <p><strong>Property:</strong> ${(orderRow.property_address as string) ?? ""}</p>
          <p><strong>Delivery:</strong> ${formatDeliverySpeed(orderRow.delivery_speed as string | null)}</p>
          <p><strong>Total:</strong> ${formatCurrency(totalFee)}</p>
          <p>The management company will be in touch once your documents are ready.</p>
          <p>Questions? Contact us at ${supportEmail ?? "support@havnhq.com"}</p>
        `,
      });
    } catch (emailError) {
      console.error("Requester confirmation email failed:", emailError);
    }
  }

  return { ok: true, alreadyPaid: false };
}

export async function markOrderRefunded(
  paymentIntentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("document_orders")
    .update({ order_status: "refunded" })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .neq("order_status", "refunded");

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
