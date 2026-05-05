-- Lifecycle-tier metadata + audit columns for community_field_cache.
--
-- Every entry in lib/document-templates/field-registry.ts will get a
-- `lifecycleTier` ("governing" | "onboarding" | "per_unit" | "per_order").
-- The cache only stores governing + onboarding tiers (per_unit re-fetches
-- from community_units; per_order reads from the order). For each cache
-- write, we stamp the tier + when it was last refreshed + which event
-- produced it ("manual_edit" | "ocr_extract" | "order_carry" | "seed").
--
-- This unlocks per-tier cache rules:
--   - governing  → cache forever; only invalidated on new governing-doc OCR
--                  or manual edit
--   - onboarding → cache until manual edit
--   - per_unit   → never cached (read live from community_units)
--   - per_order  → never cached (read live from the order row)
--
-- Idempotent — run via the Supabase SQL Editor.

alter table public.community_field_cache
  add column if not exists lifecycle_tier text;

alter table public.community_field_cache
  add column if not exists last_refreshed_at timestamptz;

alter table public.community_field_cache
  add column if not exists source_event text;

create index if not exists community_field_cache_tier_refreshed_idx
  on public.community_field_cache (community_id, lifecycle_tier, last_refreshed_at desc);

-- Backfill: stamp existing rows so the index is useful and the audit
-- panel doesn't show null tiers everywhere. Existing rows came from
-- some mix of OCR + manual entry; mark them as such with a refreshed
-- timestamp pulled from updated_at where available, falling back to
-- created_at, falling back to now().
update public.community_field_cache
set last_refreshed_at = coalesce(last_refreshed_at, updated_at, created_at, now())
where last_refreshed_at is null;

update public.community_field_cache
set source_event = case
  when source = 'manual' then 'manual_edit'
  when source = 'ocr' then 'ocr_extract'
  else 'seed'
end
where source_event is null;

-- Table-level grants — explicit, to avoid the silent-failure mode that
-- bit third_party_templates earlier (server-side admin client hit
-- "permission denied for table" because Supabase didn't auto-grant).
grant select, insert, update, delete
  on public.community_field_cache
  to anon, authenticated, service_role;

comment on column public.community_field_cache.lifecycle_tier is
  'one of: governing | onboarding | per_unit | per_order. Drives per-tier cache rules in lib/hydrate-draft-fields.ts.';
comment on column public.community_field_cache.last_refreshed_at is
  'When this cache value was last written. Per-tier rules can use this for staleness checks (none implemented yet).';
comment on column public.community_field_cache.source_event is
  'one of: manual_edit | ocr_extract | order_carry | seed. Audit signal for the God Mode cache panel.';
