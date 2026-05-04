-- Order ↔ community/unit auto-matching + extracted-context persistence.
-- Adds the columns the 3P-template pipeline needs to (a) remember what
-- Claude pulled out of an uploaded form and (b) record the resulting
-- match (auto-applied or staff-confirmed).
--
-- Run once. Safe to re-run — every clause uses IF NOT EXISTS / DROP IF
-- EXISTS where the dialect supports it.

-- ── document_orders: link to a unit + audit who applied the match ──────

ALTER TABLE public.document_orders
  ADD COLUMN IF NOT EXISTS community_unit_id UUID REFERENCES public.community_units(id) ON DELETE SET NULL;

ALTER TABLE public.document_orders
  ADD COLUMN IF NOT EXISTS match_source TEXT;

ALTER TABLE public.document_orders
  ADD COLUMN IF NOT EXISTS match_applied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_document_orders_community_unit
  ON public.document_orders(community_unit_id);

-- ── third_party_templates: extracted context + suggested match ────────

ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS extracted_context JSONB;

ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS match_level TEXT;

ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS match_confidence TEXT;

ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS match_reasoning TEXT;

ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS suggested_community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL;

ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS suggested_unit_id UUID REFERENCES public.community_units(id) ON DELETE SET NULL;

-- Grants on new columns are inherited from table-level grants — no
-- additional GRANT needed.
