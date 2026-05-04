-- Capture requester company on the order. Used by the title-company flow
-- (required) and lender_title flow (optional) so downstream staff and
-- delivery emails know which firm placed the order.
--
-- Idempotent — run via the Supabase SQL Editor.

alter table public.document_orders
  add column if not exists requester_company text;

comment on column public.document_orders.requester_company is
  'Firm/company name on the requester side. Required for title companies, optional for lenders.';
