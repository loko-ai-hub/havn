"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";

import { loadStripe } from "@stripe/stripe-js";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";

import { Button } from "../../../../components/ui/button";
import { formatCurrency } from "../../../../lib/portal-data";
import { confirmPayment } from "./actions";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentCardForm({
  slug,
  orderId,
  clientSecret,
  totalFee,
  confirmationQuery,
  primaryColor,
}: {
  slug: string;
  orderId: string;
  clientSecret: string;
  totalFee: number;
  confirmationQuery: string;
  primaryColor: string;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCardError(null);
    setSubmitError(null);

    if (!stripe || !elements) return;

    const card = elements.getElement(CardElement);
    if (!card) {
      setCardError("Card details are not ready. Please try again.");
      return;
    }

    setIsProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card,
        },
      });

      if (error) {
        setCardError(error.message ?? "Payment failed. Please try again.");
        return;
      }

      if (!paymentIntent) {
        setCardError("Payment failed. Please try again.");
        return;
      }

      const result = await confirmPayment(orderId, paymentIntent.id);
      if ("error" in result) {
        setSubmitError(result.error ?? "Unable to confirm payment. Please try again.");
        return;
      }

      router.push(`/r/${slug}/confirmation?${confirmationQuery}`);
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
          <div>
            <p className="text-sm font-medium text-foreground">Card details</p>
            <div className="mt-2 rounded-md border border-border bg-background px-3 py-2">
              <CardElement options={{ hidePostalCode: true }} />
            </div>
          </div>

          {cardError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">{cardError}</p>
            </div>
          ) : null}

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
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <PaymentCardForm {...props} />
    </Elements>
  );
}

