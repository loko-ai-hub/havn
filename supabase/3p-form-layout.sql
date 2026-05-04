-- Persist Document AI Form Parser output so the staff review page can
-- render the original PDF with editable HTML inputs overlaid on each
-- form field, and the delivery flow can stamp values onto a copy of the
-- original PDF at the same coordinates.
--
-- Run once. Idempotent.

-- Per-page geometry: { page: 1, width: 612, height: 792 } for each page.
ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS pdf_pages JSONB;

-- Per-detected-field bbox info, in normalized 0..1 coords:
--   [{ registryKey, label, page, valueBbox: { x, y, w, h }, labelBbox?: {...} }]
-- registryKey is null when the form parser found a field but our
-- universal extractor couldn't map it to a registry key.
ALTER TABLE public.third_party_templates
  ADD COLUMN IF NOT EXISTS field_layout JSONB;
