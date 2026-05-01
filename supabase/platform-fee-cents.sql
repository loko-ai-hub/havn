-- Havn's 35% platform fee, in cents, captured per order at PaymentIntent creation.
-- Stripe is still authoritative (it's set as application_fee_amount on the PI),
-- but storing a local copy lets the dashboard aggregate revenue with one query
-- instead of iterating Stripe BalanceTransactions.
--
-- Reporting pattern:
--   select sum(platform_fee_cents) / 100.0 as havn_revenue_usd
--   from document_orders
--   where order_status = 'paid'
--     and paid_at >= date_trunc('month', now());
--
-- Refunded orders have order_status = 'refunded', so they drop out of revenue
-- queries automatically. We don't null out the column on refund — it reflects
-- what was originally charged.

alter table document_orders
  add column if not exists platform_fee_cents integer;

comment on column document_orders.platform_fee_cents is
  'Havn platform fee in cents (35%% of total). Set at PaymentIntent creation; mirrors the Stripe application_fee_amount.';
