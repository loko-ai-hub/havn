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
    .select("stripe_account_id, stripe_charges_enabled, name")
    .eq("id", order.organization_id)
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Unable to load organization." };
  }

  const stripeAccountId = org.stripe_account_id as string | null;
  if (!stripeAccountId) {
    return {
      error: `${(org as { name?: string }).name ?? "This organization"} hasn't finished setting up payments yet. Please reach out to them to complete this order.`,
    };
  }

  if (!(org as { stripe_charges_enabled?: boolean | null }).stripe_charges_enabled) {
    return {
      error: `${(org as { name?: string }).name ?? "This organization"}'s Stripe account isn't ready to accept charges yet (onboarding incomplete). Please reach out to them.`,
    };
  }

  const amount = Math.round(Number(order.total_fee) * 100); // cents
  // Stripe's USD card minimum is $0.50. Below that the PaymentIntent creation
  // call will 400 before the customer ever sees the form.
  if (amount < 50) {
    return {
      error: `Stripe doesn't accept charges below $0.50. This order totals $${(amount / 100).toFixed(2)}. Adjust the per-doc fee in dashboard pricing and try again.`,
    };
  }
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

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
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
  } catch (stripeErr) {
    // Surface the actual Stripe error so we can debug 400s from the platform
    // (account-not-ready, currency mismatch, fee too high, etc.) instead of
    // returning a generic "unable to initialize."
    const message =
      stripeErr instanceof Error ? stripeErr.message : "Stripe rejected the charge.";
    console.error("[createPaymentIntent] Stripe rejected:", stripeErr);
    return { error: `Payment couldn't be set up: ${message}` };
  }

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
