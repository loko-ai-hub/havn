"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";

import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { Button } from "../../../../components/ui/button";
import { formatCurrency } from "../../../../lib/portal-data";
import { confirmPayment } from "./actions";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentCardForm({
  slug,
  orderId,
  totalFee,
  confirmationQuery,
  primaryColor,
}: {
  slug: string;
  orderId: string;
  totalFee: number;
  confirmationQuery: string;
  primaryColor: string;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    if (!stripe || !elements) return;

    setIsProcessing(true);
    try {
      // Absolute return URL is required by Stripe. We include our own confirmation
      // query params so the page can render full order detail even after a redirect.
      const returnUrl = `${window.location.origin}/r/${slug}/confirmation?${confirmationQuery}`;

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        // Only redirect the user away when the payment method actually requires it
        // (e.g. 3DS, some wallets). Cards / Link / Apple Pay / Google Pay resolve inline.
        redirect: "if_required",
      });

      if (error) {
        setSubmitError(error.message ?? "Payment failed. Please try again.");
        return;
      }

      if (!paymentIntent) {
        setSubmitError("Payment did not complete. Please try again.");
        return;
      }

      if (paymentIntent.status === "succeeded" || paymentIntent.status === "processing") {
        // Fast-path status sync — webhook is still the source of truth.
        const result = await confirmPayment(orderId, paymentIntent.id);
        if ("error" in result) {
          // Non-fatal — webhook will catch up. Log and continue to confirmation.
          console.error("confirmPayment server action error:", result.error);
        }
        router.push(`/r/${slug}/confirmation?${confirmationQuery}`);
        return;
      }

      setSubmitError(`Unexpected payment status: ${paymentIntent.status}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Payment</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pay securely to complete your document request.</p>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Total due</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(totalFee)}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PaymentElement options={{ layout: "tabs" }} />

          {submitError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">{submitError}</p>
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 text-base"
              onClick={() => router.push(`/r/${slug}/review`)}
              disabled={isProcessing}
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={isProcessing || !stripe || !elements}
              className="h-12 flex-1 text-base font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {isProcessing ? "Processing..." : `Pay ${formatCurrency(totalFee)}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PaymentForm(props: {
  slug: string;
  orderId: string;
  clientSecret: string;
  totalFee: number;
  confirmationQuery: string;
  primaryColor: string;
}) {
  const { clientSecret, ...rest } = props;
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: "stripe" },
      }}
    >
      <PaymentCardForm {...rest} />
    </Elements>
  );
}
