-- ingest_telemetry: per-row audit of which positioner(s) produced
-- the field_layout. Snapshotted at the end of each runThirdPartyIngestion
-- so the God Mode 3P panel can show the layered fast-path stack at work.
--
-- Shape (set in lib/3p-template-pipeline.ts):
--   {
--     cache_hit: boolean,
--     cache_template_id: uuid | null,
--     acroform_field_count: number,
--     form_parser_field_count: number,
--     vision_field_count: number,
--     synthesis_field_count: number,
--     filtered_response_count: number,
--     filtered_requester_count: number,
--     filtered_metadata_count: number,
--     total_layout_field_count: number,
--     timestamp: ISO datetime
--   }
--
-- Idempotent — run via the Supabase SQL Editor.

alter table public.third_party_templates
  add column if not exists ingest_telemetry jsonb;

create index if not exists third_party_templates_telemetry_idx
  on public.third_party_templates ((ingest_telemetry->>'cache_hit'));

comment on column public.third_party_templates.ingest_telemetry is
  'Per-row audit: which positioner(s) ran, how many fields each contributed, filter classifications. Used by God Mode 3P panel.';
