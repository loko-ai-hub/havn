-- Phase 3 — Document versioning + e-signatures.
--
-- Adds per-version metadata to order_documents and a new document_signatures
-- table tying a signed certification to a specific version of a generated
-- document. Idempotent — safe to re-run.

begin;

-- ── order_documents: version, generated_by, generated_at, expires_at ──

alter table public.order_documents
  add column if not exists version integer not null default 1;

alter table public.order_documents
  add column if not exists generated_by uuid references auth.users(id) on delete set null;

alter table public.order_documents
  add column if not exists generated_at timestamptz not null default now();

alter table public.order_documents
  add column if not exists expires_at timestamptz;

-- Allow a client to efficiently fetch versions in display order.
create index if not exists order_documents_order_id_version_idx
  on public.order_documents (order_id, version desc);

-- ── document_signatures ──

create table if not exists public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.document_orders(id) on delete cascade,
  order_document_id uuid references public.order_documents(id) on delete set null,
  version integer not null default 1,
  signer_name text not null,
  signer_email text not null,
  signer_title text,
  signer_user_id uuid references auth.users(id) on delete set null,
  certification_text text,
  signed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  -- Base64-encoded signature image (PNG/JPEG) OR the marker 'click-to-sign'.
  signature_data text
);

create index if not exists document_signatures_order_id_idx
  on public.document_signatures (order_id);

create index if not exists document_signatures_order_document_idx
  on public.document_signatures (order_document_id);

-- RLS — signatures inherit access from the parent order's organization.

alter table public.document_signatures enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'document_signatures'
      and policyname = 'org members can read signatures for their orders'
  ) then
    create policy "org members can read signatures for their orders"
      on public.document_signatures
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.document_orders o
          where o.id = document_signatures.order_id
            and o.organization_id = auth_company_id()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'document_signatures'
      and policyname = 'org members can insert signatures for their orders'
  ) then
    create policy "org members can insert signatures for their orders"
      on public.document_signatures
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.document_orders o
          where o.id = document_signatures.order_id
            and o.organization_id = auth_company_id()
        )
      );
  end if;
end
$$;

commit;
