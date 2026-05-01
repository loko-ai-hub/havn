-- Third-party template ingestion + review workflow.
--
-- Adds tables for:
--   * third_party_templates — one row per requester-uploaded vendor form,
--     plus the AI-mapping result and the Havn-staff review state.
--   * field_registry_proposals — new merge-tag candidates the mapper flagged
--     but can't resolve against the current registry. Staff approves to
--     generate a TypeScript snippet for committing into the registry file.
--
-- Adds columns on document_orders so the management-company dashboard knows
-- which orders are blocked on 3P review vs. ready to fulfill.
--
-- Idempotent — safe to re-run.

begin;

-- ── third_party_templates ─────────────────────────────────────────────

create table if not exists public.third_party_templates (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.document_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Uploaded artifact
  storage_path_pdf text not null,
  storage_path_text text,
  original_filename text,
  mime_type text,
  -- AI ingestion result
  form_title text,
  issuer text,
  document_type text,                    -- resolved master_type_key (nullable until ingestion completes)
  detected_fields jsonb,                 -- [{ externalLabel, registryKey, confidence, fieldKind, reasoning }, …]
  mapped_count integer not null default 0,
  unmapped_count integer not null default 0,
  auto_fill_coverage_pct numeric,        -- mapped / (mapped + unmapped) * 100
  -- Ingestion state
  ingest_status text not null default 'pending',  -- pending | processing | ready | failed
  ingest_error text,
  -- Review state
  review_status text not null default 'pending',  -- pending | approved | denied | auto_defaulted
  reviewer_email text,
  reviewed_at timestamptz,
  review_notes text,
  auto_defaulted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists third_party_templates_order_id_idx
  on public.third_party_templates (order_id);

create index if not exists third_party_templates_review_status_idx
  on public.third_party_templates (review_status, created_at);

create index if not exists third_party_templates_ingest_status_idx
  on public.third_party_templates (ingest_status);

-- ── field_registry_proposals ──────────────────────────────────────────

create table if not exists public.field_registry_proposals (
  id uuid primary key default gen_random_uuid(),
  source_template_id uuid references public.third_party_templates(id) on delete cascade,
  proposed_field_key text not null,
  proposed_label text not null,
  proposed_type text not null,             -- text | currency | date | textarea | boolean
  rationale text,
  status text not null default 'pending',  -- pending | approved | rejected
  reviewer_email text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists field_registry_proposals_status_idx
  on public.field_registry_proposals (status, created_at);

create index if not exists field_registry_proposals_source_idx
  on public.field_registry_proposals (source_template_id);

-- ── document_orders columns ───────────────────────────────────────────

alter table public.document_orders
  add column if not exists third_party_template_id uuid
    references public.third_party_templates(id) on delete set null;

alter table public.document_orders
  add column if not exists third_party_review_status text;
-- Mirrors third_party_templates.review_status for quick dashboard filtering.
-- Null = no 3P form attached to this order.

create index if not exists document_orders_third_party_review_status_idx
  on public.document_orders (third_party_review_status)
  where third_party_review_status is not null;

-- ── RLS ────────────────────────────────────────────────────────────────

alter table public.third_party_templates enable row level security;
alter table public.field_registry_proposals enable row level security;

-- Requester: can read the 3P template they uploaded (by email on the linked
-- order). No insert/update — server actions handle those via service role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'third_party_templates'
      and policyname = 'requesters can read their own 3p template'
  ) then
    create policy "requesters can read their own 3p template"
      on public.third_party_templates
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.document_orders o
          where o.id = third_party_templates.order_id
            and o.requester_email = auth.jwt() ->> 'email'
        )
      );
  end if;

  -- Management-company members: can read 3P templates tied to orders for
  -- their org. They never mutate these rows directly.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'third_party_templates'
      and policyname = 'org members can read 3p templates for their orders'
  ) then
    create policy "org members can read 3p templates for their orders"
      on public.third_party_templates
      for select
      to authenticated
      using (organization_id = auth_company_id());
  end if;

  -- field_registry_proposals: god-mode-only via service role. No RLS policy
  -- needed beyond enabling RLS (default deny for authenticated users).
end
$$;

commit;

-- ── Storage bucket (run once via Supabase dashboard or the snippet below)
-- Create a private bucket named `third-party-templates`.
-- Using the SQL:
--
--   insert into storage.buckets (id, name, public)
--   values ('third-party-templates', 'third-party-templates', false)
--   on conflict (id) do nothing;
--
-- Service role bypasses RLS so the server actions can upload/download
-- without additional storage policies.
