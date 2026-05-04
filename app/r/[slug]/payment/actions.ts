"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  stripe,
  calcApplicationFee,
  ALL_CONNECT_COLUMNS,
  getActiveConnectAccount,
  isStripeTestMode,
} from "@/lib/stripe";
import { markOrderPaid } from "@/lib/stripe-orders";

const REUSABLE_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
]);

// Detect a test/live key mismatch (or different Stripe accounts entirely)
// before calling Stripe. The secret key creates the PaymentIntent; the
// publishable key is what the browser uses to load it. Mismatched keys
// produce a confusing client-side "client_secret does not match any
// associated PaymentIntent" error — catching it server-side is much clearer.
function detectStripeKeyMismatch(): string | null {
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  const pub = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!secret) return "STRIPE_SECRET_KEY is not configured.";
  if (!pub) return "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.";
  const secretMode = secret.startsWith("sk_live_")
    ? "live"
    : secret.startsWith("sk_test_")
      ? "test"
      : "unknown";
  const pubMode = pub.startsWith("pk_live_")
    ? "live"
    : pub.startsWith("pk_test_")
      ? "test"
      : "unknown";
  if (secretMode === "unknown" || pubMode === "unknown") {
    return `Stripe key format unrecognized (secret=${secretMode}, publishable=${pubMode}). Re-paste the keys from Stripe Dashboard → Developers → API keys.`;
  }
  if (secretMode !== pubMode) {
    return `Stripe key mode mismatch — STRIPE_SECRET_KEY is ${secretMode}, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is ${pubMode}. Both must be from the same Stripe account and mode (both test or both live). Update in Vercel env vars and redeploy.`;
  }
  return null;
}

export async function createPaymentIntent(orderId: string) {
  const keyMismatch = detectStripeKeyMismatch();
  if (keyMismatch) {
    console.error("[createPaymentIntent] " + keyMismatch);
    return { error: keyMismatch };
  }

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
    .select(`name, ${ALL_CONNECT_COLUMNS}`)
    .eq("id", order.organization_id)
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Unable to load organization." };
  }

  const orgName = (org as { name?: string }).name ?? "This organization";
  const active = getActiveConnectAccount(org as unknown as Record<string, unknown>);
  const modeLabel = isStripeTestMode() ? "test" : "live";

  if (!active.accountId) {
    return {
      error: `${orgName} hasn't connected a ${modeLabel}-mode Stripe account yet. Have them sign in and finish Stripe setup at /dashboard/settings.`,
    };
  }

  if (!active.chargesEnabled) {
    return {
      error: `${orgName}'s ${modeLabel}-mode Stripe account isn't ready to accept charges yet (onboarding incomplete). Have them finish Stripe setup at /dashboard/settings.`,
    };
  }

  const stripeAccountId = active.accountId;

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
