-- Rename merge-tag key `monthly_assessment` → `assessment`.
--
-- Reason: the value is the regular periodic dues amount per unit. The
-- frequency (monthly / quarterly / etc.) lives separately on
-- `assessment_frequency`. Calling the field `monthly_assessment`
-- forced a misleading constraint into the data model. `assessment` is
-- the right concept name.
--
-- Touches every place the key lives in the database:
--   1. community_field_cache.field_key
--   2. document_orders.draft_fields (JSONB object key)
--   3. third_party_templates.detected_fields (JSONB array element)
--   4. third_party_templates.field_layout (JSONB array element)
--   5. vendor_form_templates.field_layout (JSONB array element)
--
-- Idempotent. Run via the Supabase SQL Editor.

-- 1) community_field_cache
update public.community_field_cache
set field_key = 'assessment'
where field_key = 'monthly_assessment';

-- 2) document_orders.draft_fields — JSONB object key rename
update public.document_orders
set draft_fields = (draft_fields - 'monthly_assessment')
  || jsonb_build_object('assessment', draft_fields->'monthly_assessment')
where draft_fields ? 'monthly_assessment';

-- 3) third_party_templates.detected_fields — array of objects with registryKey
update public.third_party_templates
set detected_fields = (
  select jsonb_agg(
    case when elem->>'registryKey' = 'monthly_assessment'
      then jsonb_set(elem, '{registryKey}', '"assessment"')
      else elem
    end
  )
  from jsonb_array_elements(detected_fields) as elem
)
where detected_fields @> '[{"registryKey":"monthly_assessment"}]';

-- 4) third_party_templates.field_layout — same shape
update public.third_party_templates
set field_layout = (
  select jsonb_agg(
    case when elem->>'registryKey' = 'monthly_assessment'
      then jsonb_set(elem, '{registryKey}', '"assessment"')
      else elem
    end
  )
  from jsonb_array_elements(field_layout) as elem
)
where field_layout @> '[{"registryKey":"monthly_assessment"}]';

-- 5) vendor_form_templates.field_layout — same shape
update public.vendor_form_templates
set field_layout = (
  select jsonb_agg(
    case when elem->>'registryKey' = 'monthly_assessment'
      then jsonb_set(elem, '{registryKey}', '"assessment"')
      else elem
    end
  )
  from jsonb_array_elements(field_layout) as elem
)
where field_layout @> '[{"registryKey":"monthly_assessment"}]';
