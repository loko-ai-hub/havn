"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, calcApplicationFee } from "@/lib/stripe";
import { markOrderPaid } from "@/lib/stripe-orders";

const REUSABLE_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
]);

export async function createPaymentIntent(orderId: string) {
  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("document_orders")
    .select("id,total_fee,organization_id,requester_email,stripe_payment_intent_id")
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
  const applicationFeeAmount = calcApplicationFee(amount);

  const existingIntentId = order.stripe_payment_intent_id as string | null;
  if (existingIntentId) {
    try {
      const existing = await stripe.paymentIntents.retrieve(existingIntentId);
      if (
        REUSABLE_INTENT_STATUSES.has(existing.status) &&
        existing.amount === amount &&
        existing.client_secret
      ) {
        return { clientSecret: existing.client_secret };
      }
    } catch (err) {
      // Fall through to creating a new intent.
      console.warn("createPaymentIntent: could not reuse existing intent:", err);
    }
  }

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: "usd",
      // Surface whatever payment methods are enabled at the platform level
      // (cards, Link, Apple Pay, Google Pay, etc.) without hard-coding a list.
      automatic_payment_methods: { enabled: true },
      application_fee_amount: applicationFeeAmount,
      transfer_data: {
        destination: stripeAccountId,
      },
      metadata: {
        orderId,
      },
    },
    {
      // Safe against double-clicks / page re-renders.
      // Include amount so that a legitimate amount change cuts a fresh intent instead of
      // hitting Stripe's 24h idempotency cache and returning a stale one.
      idempotencyKey: `order_${orderId}_${amount}_v1`,
    }
  );

  if (!paymentIntent.client_secret) {
    return { error: "Unable to initialize payment." };
  }

  const { error: updateError } = await supabase
    .from("document_orders")
    .update({
      stripe_payment_intent_id: paymentIntent.id,
      platform_fee_cents: applicationFeeAmount,
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message };
  }

  return { clientSecret: paymentIntent.client_secret };
}

export async function confirmPayment(orderId: string, paymentIntentId: string) {
  const result = await markOrderPaid(orderId, paymentIntentId);
  if (!result.ok) {
    return { error: result.error };
  }
  return { ok: true };
}
