/**
 * Client-safe Stripe helpers. Kept in its own module so importing from a
 * client component doesn't drag the server-side `new Stripe(...)` in
 * lib/stripe.ts (which reads STRIPE_SECRET_KEY) into the browser bundle.
 */

export function isStripeTestModeClient(): boolean {
  return (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").startsWith(
    "pk_test_"
  );
}
