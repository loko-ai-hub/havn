import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe, activeConnectColumns } from "@/lib/stripe";
import { markOrderPaid, markOrderRefunded } from "@/lib/stripe-orders";
import { createAdminClient } from "@/lib/supabase/admin";

// Node.js runtime is required — Stripe signature verification needs the raw request body.
export const runtime = "nodejs";
// We handle idempotency ourselves; never cache or dedupe at the framework layer.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing stripe-signature header or STRIPE_WEBHOOK_SECRET env var." },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    console.warn("Stripe webhook signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook error: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) {
          console.warn("payment_intent.succeeded missing orderId metadata:", pi.id);
          break;
        }
        const result = await markOrderPaid(orderId, pi.id);
        if (!result.ok) {
          console.error("markOrderPaid failed in webhook:", result.error);
          // Return 500 so Stripe retries.
          return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // If the order has an attached third-party template, fire the
        // ingestion pipeline. Dynamic import so a missing module doesn't
        // break payment processing; errors are logged and caught — the
        // cron will sweep stuck rows after the review window.
        void (async () => {
          try {
            const { createAdminClient } = await import("@/lib/supabase/admin");
            const admin = createAdminClient();
            const { data: order } = await admin
              .from("document_orders")
              .select("third_party_template_id")
              .eq("id", orderId)
              .maybeSingle();
            const tplId = order?.third_party_template_id as string | null;
            if (tplId) {
              const { runThirdPartyIngestion } = await import("@/lib/3p-template-pipeline");
              const res = await runThirdPartyIngestion({ thirdPartyTemplateId: tplId });
              if (!res.ok) {
                console.error("[3p-ingest] pipeline failed:", res.error);
              }
            }
          } catch (err) {
            console.error("[3p-ingest] webhook hook failed:", err);
          }
        })();

        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        console.warn(
          "payment_intent.payment_failed",
          { orderId, paymentIntentId: pi.id, reason: pi.last_payment_error?.message }
        );
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (!paymentIntentId) break;
        const result = await markOrderRefunded(paymentIntentId);
        if (!result.ok) {
          console.error("markOrderRefunded failed in webhook:", result.error);
          return NextResponse.json({ error: result.error }, { status: 500 });
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const supabase = createAdminClient();
        // Webhook signature already proved this event came from the platform
        // mode whose secret signed it, so we trust activeConnectColumns()
        // and write into the matching column set. Filter the row by the
        // same mode's account_id column to avoid touching the other mode's row.
        const cols = activeConnectColumns();
        const { error } = await supabase
          .from("organizations")
          .update({
            [cols.onboardingComplete]: Boolean(account.details_submitted),
            [cols.payoutsEnabled]: Boolean(account.payouts_enabled),
            [cols.chargesEnabled]: Boolean(account.charges_enabled),
            [cols.requirementsCurrentlyDue]:
              account.requirements?.currently_due ?? [],
          })
          .eq(cols.accountId, account.id);
        if (error) {
          console.error("account.updated: failed to sync organization:", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        break;
      }

      default:
        // Ignore all other event types.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown webhook handler error";
    console.error("Stripe webhook handler error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
