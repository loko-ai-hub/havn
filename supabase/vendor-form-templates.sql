-- Vendor form template cache. After a 3P upload's field_layout has been
-- positioned + reviewed once, the layout is saved here keyed by the form's
-- (issuer, form_title, content_fingerprint). Future uploads of the same
-- form load the layout instantly — no Form Parser, no synthesis, no
-- Claude vision call. Staff effort compounds: every drag-to-fix becomes
-- a permanent improvement for every subsequent order.
--
-- content_fingerprint: sha256 of the first 4 KB of normalized rawText.
-- Lets us distinguish form variants (e.g., "Ticor HOA Request 2024" vs
-- "Ticor HOA Request 2026") even when issuer + title match. Computed in
-- lib/3p-template-pipeline.ts and looked up before any positioning step.
--
-- Idempotent — run via the Supabase SQL Editor.

create table if not exists public.vendor_form_templates (
  id uuid primary key default gen_random_uuid(),
  issuer text,
  form_title text,
  content_fingerprint text not null,
  master_type_key text,
  -- Snapshot of pdf_pages [{page,width,height}] from the source ingestion
  -- so the overlay can size correctly without re-rendering.
  pdf_pages jsonb,
  -- Snapshot of field_layout — position + label + kind + registryKey per
  -- field. Same shape third_party_templates.field_layout uses.
  field_layout jsonb not null,
  -- Audit: which 3P template row produced this template, who approved
  -- the layout (typically by clicking Save Layout with "Save as
  -- template" checked), when.
  source_template_id uuid references public.third_party_templates(id)
    on delete set null,
  approved_by text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One template per (issuer, form_title, fingerprint). Re-saves overwrite
-- via on-conflict in the application code.
create unique index if not exists vendor_form_templates_unique_idx
  on public.vendor_form_templates (
    coalesce(issuer, ''),
    coalesce(form_title, ''),
    content_fingerprint
  );

-- Lookup index used by the pipeline cache hit path.
create index if not exists vendor_form_templates_fingerprint_idx
  on public.vendor_form_templates (content_fingerprint);

-- Table-level grants — explicit, to avoid the silent-failure mode that
-- bit third_party_templates (server-side admin client hit "permission
-- denied for table" because Supabase didn't auto-grant on table create).
grant select, insert, update, delete
  on public.vendor_form_templates
  to anon, authenticated, service_role;

-- RLS: any logged-in dashboard user can read templates (they're shared
-- across orgs by design — the form layout is a property of the vendor
-- form, not any one customer). Insert/update/delete restricted to god-
-- mode service-role flow via the dashboard server actions.
alter table public.vendor_form_templates enable row level security;

drop policy if exists vendor_form_templates_select on public.vendor_form_templates;
create policy vendor_form_templates_select on public.vendor_form_templates
  for select
  using (true);

-- Modify policy: only service_role bypasses RLS for writes; user-side
-- writes are denied (server actions use the admin client).
drop policy if exists vendor_form_templates_modify on public.vendor_form_templates;
create policy vendor_form_templates_modify on public.vendor_form_templates
  for all
  using (false)
  with check (false);

comment on table public.vendor_form_templates is
  'Cached field_layout per vendor form variant. Hit before any positioning step in the 3P pipeline.';
comment on column public.vendor_form_templates.content_fingerprint is
  'sha256(rawText[0..4096]) after whitespace normalization. Distinguishes form versions with the same issuer + title.';
