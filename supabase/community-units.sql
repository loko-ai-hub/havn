-- Per-community unit roster: one row per property, with parsed owner info,
-- property address, and a mailing address that may differ for non-resident
-- owners. Imported from Vantaca (and eventually other PMS) exports.
--
-- Replace-all import semantics: each fresh import deletes existing rows for
-- the community and inserts the new file, so the operator's latest export
-- is always the source of truth. The `imported_at` timestamp + raw_import
-- jsonb give us forensics.

CREATE TABLE IF NOT EXISTS public.community_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,

  -- Vantaca-style account number (e.g. "GFPC10338"). Useful for reconciling
  -- with the source PMS later. Optional because not every importer will have it.
  account_number TEXT,

  -- Property address (where the unit physically sits). Vantaca exports only
  -- the street; city/state/zip are inherited from the community at import time.
  property_street TEXT,
  property_city TEXT,
  property_state TEXT,
  property_zip TEXT,

  -- Mailing address. Same as property by default; differs for non-resident
  -- (e.g. investor) owners. Vantaca emits "P: <street> M: <street>" inline.
  mailing_street TEXT,
  mailing_city TEXT,
  mailing_state TEXT,
  mailing_zip TEXT,
  mailing_same_as_property BOOLEAN NOT NULL DEFAULT TRUE,

  -- Owners. One row per unit; multiple owners as a parsed array.
  owner_names TEXT[] NOT NULL DEFAULT '{}',
  primary_email TEXT,
  additional_emails TEXT[] NOT NULL DEFAULT '{}',
  phone TEXT,

  -- "Owner-occupied" / "Rented" / null when not specified.
  lease_status TEXT,

  -- Original row from the source export, kept for forensics.
  raw_import JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_units_community
  ON public.community_units(community_id);

-- Account number is unique per community (when present). Allows on-conflict
-- upserts in the future if we move from replace-all to merge semantics.
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_units_account
  ON public.community_units(community_id, account_number)
  WHERE account_number IS NOT NULL;

-- Case-insensitive street lookup for order-time address matching.
CREATE INDEX IF NOT EXISTS idx_community_units_property_street_lower
  ON public.community_units(community_id, lower(property_street));

-- RLS — operators can read/write units only for their own org's communities.
ALTER TABLE public.community_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_units_select ON public.community_units;
CREATE POLICY community_units_select ON public.community_units
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_units.community_id
        AND c.organization_id = public.auth_company_id()
    )
  );

DROP POLICY IF EXISTS community_units_modify ON public.community_units;
CREATE POLICY community_units_modify ON public.community_units
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_units.community_id
        AND c.organization_id = public.auth_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_units.community_id
        AND c.organization_id = public.auth_company_id()
    )
  );
