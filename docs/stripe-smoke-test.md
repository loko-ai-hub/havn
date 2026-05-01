# Stripe end-to-end smoke test

Run this after any change to the payment flow, webhook handler, or `STRIPE_*` env vars. Takes ~5 min.

## Prerequisites (prod)
- Latest deploy includes the Stripe wiring
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` set in Vercel Prod
- Webhook endpoint `https://havnhq.com/api/webhooks/stripe` registered in Stripe, subscribed to: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
- Platform-account payment methods enabled: cards, Link, Apple Pay, Google Pay
- `havnhq.com` verified under Stripe → Payment method domains
- Target organization (e.g. AmLo) has completed Stripe Connect Express onboarding (`organizations.stripe_onboarding_complete = true`)

## Smoke test

### 1. Webhook reachability
- Stripe Dashboard → Developers → Webhooks → click the Havn endpoint
- Click **Send test webhook** → pick `payment_intent.succeeded`
- **Expect**: 200 response in the attempt log
- If 400 → signing secret mismatch; re-copy `whsec_…` into Vercel and redeploy

### 2. PaymentElement renders with wallet methods
- Open `https://havnhq.com/r/<portal-slug>` on Safari (iOS or Mac) — needed for Apple Pay
- Fill the portal through to the Payment step
- **Expect on the payment page**:
  - PaymentElement renders
  - Apple Pay button shows on Safari (domain verified + in Safari on Apple device)
  - Google Pay button shows on Chrome with a Google account
  - Link option shows (may be inline via email)
  - Card fields always show as the fallback

### 3. Real charge (use your own card, small amount)
- Complete checkout with a real card
- Wait for the confirmation page to render
- **Expect**:
  - URL lands on `/r/<slug>/confirmation?orderId=…` (no failure page)
  - Confirmation UI shows "Order Received" with the correct total
  - Requester confirmation email arrives (from `orders@havnhq.com`)
  - Management notification email arrives (to the org's `support_email`)

### 4. Verify state in Stripe + Supabase
- **Stripe Dashboard → Payments** → open the charge
  - `amount` matches the order total
  - `application_fee_amount` = 35% of the amount (rounded to cents)
  - `on_behalf_of` / `transfer_data.destination` = the connected account's `acct_…`
  - `metadata.orderId` matches the order row
- **Supabase → document_orders** row for that order
  - `order_status` = `paid`
  - `paid_at` is populated
  - `stripe_payment_intent_id` matches the Stripe PI
- **Stripe Dashboard → Webhooks → attempts** for the endpoint
  - `payment_intent.succeeded` attempt returned **200**

### 5. Refund (exercises the dashboard → Stripe → webhook loop)
- Log in to `https://havnhq.com/dashboard`, open the paid order
- Click **Refund** → type a reason (e.g. "smoke test") → confirm
- Wait 5–10 s, reload the page
- **Expect**:
  - Order status badge = **Refunded**
  - Stripe Dashboard on the same charge shows a refund
    - `refund_application_fee: true` — Havn's 35% fee reversed
    - `reverse_transfer: true` — transfer pulled back from connected account
    - `metadata.reason` = the reason you typed
  - Webhook dashboard shows a `charge.refunded` attempt returning 200

### 6. Balance sanity check
- Stripe Dashboard → Balances → Platform account — net-zero change from this test transaction after refund
- Stripe Dashboard → Connect → the connected account's balance — also net-zero
- If either shows a balance delta after a full refund, the fee-split reversal didn't run correctly

## Failure triage

| Symptom | Likely cause |
| --- | --- |
| `/api/webhooks/stripe` returns 400 | `STRIPE_WEBHOOK_SECRET` is unset or stale — set in Vercel, redeploy |
| PaymentElement shows cards only | Wallet methods not enabled in Stripe → Settings → Payment methods, or domain not verified |
| Order stays in `pending_payment` after success | Webhook never fired or `markOrderPaid` errored — check Stripe webhook attempts + Vercel function logs |
| Emails never arrive | `RESEND_API_KEY` unset, or the org has no `support_email` / requester has no `requester_email` |
| Refund button missing | Order status is not `paid`, or `stripe_payment_intent_id` is null on the row |
| Refund succeeds but order stays `paid` | `charge.refunded` webhook not firing — check the endpoint is subscribed to that event |
