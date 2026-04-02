"use server";

import { createAdminClient } from "../../../../lib/supabase/admin";
import { stripe } from "../../../../lib/stripe";

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

  return { ok: true };
}

