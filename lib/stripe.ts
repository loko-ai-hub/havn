import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Stripe's TS types don't include this exact literal in their union; the cast keeps runtime behavior as specified.
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

// Havn's platform fee in basis points (1 bp = 0.01%). 3500 = 35%.
export const PLATFORM_FEE_BPS = 3500;

export function calcApplicationFee(amountInCents: number): number {
  return Math.round((amountInCents * PLATFORM_FEE_BPS) / 10_000);
}

