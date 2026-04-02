import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Stripe's TS types don't include this exact literal in their union; the cast keeps runtime behavior as specified.
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

