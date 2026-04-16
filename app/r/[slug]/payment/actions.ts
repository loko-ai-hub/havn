"use server";

import {
  formatCurrency,
  formatDeliverySpeed,
  formatMasterTypeKey,
} from "@/app/dashboard/_lib/format";
import { REQUESTER_TYPES } from "@/lib/portal-data";
import resend, { RESEND_FROM_EMAIL, sendManagementNotification } from "@/lib/resend";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { stripe } from "../../../../lib/stripe";

function formatRequesterRole(role: string | null | undefined): string {
  if (!role) return "—";
  const match = REQUESTER_TYPES.find((t) => t.value === role);
  return match?.title ?? formatMasterTypeKey(role);
}

export async function createPaymentIntent(orderId: string) {
  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("document_orders")
    .select("id,total_fee,organization_id,requester_email")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? "Unable to load order." };
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("stripe_account_id")
    .eq("id", order.organization_id)
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Unable to load organization." };
  }

  const stripeAccountId = org.stripe_account_id as string | null;
  if (!stripeAccountId) {
    return { error: "Missing Stripe destination account for this organization." };
  }

  const amount = Math.round(Number(order.total_fee) * 100); // cents

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method_types: ["card"],
    transfer_data: {
      destination: stripeAccountId,
    },
    metadata: {
      orderId,
    },
  });

  if (!paymentIntent.client_secret) {
    return { error: "Unable to initialize payment." };
  }

  const { error: updateError } = await supabase
    .from("document_orders")
    .update({
      stripe_payment_intent_id: paymentIntent.id,
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message };
  }

  return { clientSecret: paymentIntent.client_secret };
}

export async function confirmPayment(orderId: string, paymentIntentId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("document_orders").update({
    order_status: "paid",
    stripe_payment_intent_id: paymentIntentId,
    paid_at: new Date().toISOString(), // equivalent to SQL `now()`
  })
  .eq("id", orderId);

  if (error) {
    return { error: error.message };
  }

  const { data: orderRow, error: orderFetchError } = await supabase
    .from("document_orders")
    .select(
      "id, organization_id, requester_name, requester_email, requester_role, property_address, master_type_key, delivery_speed, total_fee"
    )
    .eq("id", orderId)
    .single();

  if (orderFetchError || !orderRow) {
    console.error(
      "confirmPayment: failed to load order for management notification:",
      orderFetchError
    );
    return { ok: true };
  }

  const { data: orgRow, error: orgFetchError } = await supabase
    .from("organizations")
    .select("name, support_email, portal_slug")
    .eq("id", orderRow.organization_id)
    .single();

  if (orgFetchError || !orgRow) {
    console.error(
      "confirmPayment: failed to load organization for management notification:",
      orgFetchError
    );
    return { ok: true };
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
        requesterRole: formatRequesterRole(
          orderRow.requester_role as string | null
        ),
        propertyAddress: (orderRow.property_address as string) ?? "",
        documentType: formatMasterTypeKey(
          orderRow.master_type_key as string | null
        ),
        deliverySpeed: formatDeliverySpeed(
          orderRow.delivery_speed as string | null
        ),
        totalFee: Number(orderRow.total_fee ?? 0),
        portalSlug: (orgRow.portal_slug as string) ?? "",
      });
    } catch (emailError) {
      console.error("Management notification email failed:", emailError);
    }
  }

  // Send requester confirmation email now that payment is confirmed
  const requesterEmail = orderRow.requester_email as string | null;
  if (requesterEmail && process.env.RESEND_API_KEY) {
    try {
      const shortId = (orderRow.id as string).slice(0, 8);
      const totalFee = Number(orderRow.total_fee ?? 0);
      const orgDisplayName = (orgRow.name as string) ?? "Havn";
      const supportEmail = orgRow.support_email as string | null;
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

  return { ok: true };
}

