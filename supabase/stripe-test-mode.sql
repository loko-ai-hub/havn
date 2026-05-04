-- Dual-mode Stripe Connect: keep test-mode and live-mode connected
-- account state side-by-side on each organization. The platform's
-- active key mode (sk_test_... vs sk_live_...) decides which set of
-- columns reads/writes for any given request.
--
-- Existing columns (stripe_account_id, stripe_onboarding_complete,
-- stripe_charges_enabled, stripe_payouts_enabled,
-- stripe_requirements_currently_due) keep their meaning: live mode.
-- New _test counterparts mirror them for test mode.
--
-- Idempotent — run via the Supabase SQL Editor.

alter table public.organizations
  add column if not exists stripe_test_account_id text,
  add column if not exists stripe_test_onboarding_complete boolean default false,
  add column if not exists stripe_test_charges_enabled boolean default false,
  add column if not exists stripe_test_payouts_enabled boolean default false,
  add column if not exists stripe_test_requirements_currently_due text[];

create index if not exists organizations_stripe_test_account_id_idx
  on public.organizations(stripe_test_account_id);

comment on column public.organizations.stripe_test_account_id is
  'Stripe Connect account ID for test mode. Mirror of stripe_account_id; whichever matches the platform key mode is the active account.';
