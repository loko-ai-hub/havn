-- Test seed data for local development. Do not run in production.

begin;

-- Upsert org by slug while staying compatible with evolving local schemas.
do $$
declare
  org_id uuid;
  org_has_secondary_color boolean;
  org_has_welcome_message boolean;
  org_has_city boolean;
  org_has_state boolean;
  org_has_zip boolean;
  org_has_is_multi_state boolean;
  org_has_operating_states boolean;
  org_sql text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'secondary_color'
  ) into org_has_secondary_color;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'welcome_message'
  ) into org_has_welcome_message;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'city'
  ) into org_has_city;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'state'
  ) into org_has_state;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'zip'
  ) into org_has_zip;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'is_multi_state'
  ) into org_has_is_multi_state;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'operating_states'
  ) into org_has_operating_states;

  org_sql :=
    'insert into public.organizations (' ||
      'id, name, account_type, portal_slug, brand_color, portal_tagline, support_email, support_phone' ||
      case when org_has_secondary_color then ', secondary_color' else '' end ||
      case when org_has_welcome_message then ', welcome_message' else '' end ||
      case when org_has_city then ', city' else '' end ||
      case when org_has_state then ', state' else '' end ||
      case when org_has_zip then ', zip' else '' end ||
      case when org_has_is_multi_state then ', is_multi_state' else '' end ||
      case when org_has_operating_states then ', operating_states' else '' end ||
    ') values (' ||
      'gen_random_uuid(), ' ||
      quote_literal('AmLo Management') || ', ' ||
      quote_literal('management_company') || ', ' ||
      quote_literal('amlo-management') || ', ' ||
      quote_literal('#000000') || ', ' ||
      quote_literal('Request HOA and association documents for your closing or refinance. Pay securely and track status in one place.') || ', ' ||
      quote_literal('loren@amlo-management.com') || ', ' ||
      quote_literal('(612) 750-7304') ||
      case when org_has_secondary_color then ', ' || quote_literal('#FDA63F') else '' end ||
      case when org_has_welcome_message then ', ' || quote_literal('Request HOA and association documents for your closing or refinance. Pay securely and track status in one place.') else '' end ||
      case when org_has_city then ', ' || quote_literal('Duvall') else '' end ||
      case when org_has_state then ', ' || quote_literal('WA') else '' end ||
      case when org_has_zip then ', ' || quote_literal('98019') else '' end ||
      case when org_has_is_multi_state then ', true' else '' end ||
      case when org_has_operating_states then ', array[' || quote_literal('WA') || ', ' || quote_literal('CA') || ']::text[]' else '' end ||
    ') on conflict (portal_slug) do update set ' ||
      'name = excluded.name, ' ||
      'account_type = excluded.account_type, ' ||
      'brand_color = excluded.brand_color, ' ||
      'portal_tagline = excluded.portal_tagline, ' ||
      'support_email = excluded.support_email, ' ||
      'support_phone = excluded.support_phone' ||
      case when org_has_secondary_color then ', secondary_color = excluded.secondary_color' else '' end ||
      case when org_has_welcome_message then ', welcome_message = excluded.welcome_message' else '' end ||
      case when org_has_city then ', city = excluded.city' else '' end ||
      case when org_has_state then ', state = excluded.state' else '' end ||
      case when org_has_zip then ', zip = excluded.zip' else '' end ||
      case when org_has_is_multi_state then ', is_multi_state = excluded.is_multi_state' else '' end ||
      case when org_has_operating_states then ', operating_states = excluded.operating_states' else '' end;

  execute org_sql;

  select id
  into org_id
  from public.organizations
  where portal_slug = 'amlo-management'
  limit 1;

  -- Re-seed fee config for WA + CA. Adds state column only if present.
  declare
    fees_has_state boolean;
    fees_sql text;
  begin
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'document_request_fees' and column_name = 'state'
    ) into fees_has_state;

    execute 'delete from public.document_request_fees where organization_id = ' || quote_literal(org_id::text) || '::uuid';

    fees_sql :=
      'insert into public.document_request_fees (' ||
        'id, organization_id, document_type, base_fee, rush_same_day_fee, rush_next_day_fee, rush_3day_fee, standard_turnaround_days' ||
        case when fees_has_state then ', state' else '' end ||
      ') values ' ||
      -- WA rows
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''resale_certificate'', 275, null, null, null, 5' || case when fees_has_state then ', ''WA''' else '' end || '), ' ||
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''certificate_update'', 100, null, null, null, 5' || case when fees_has_state then ', ''WA''' else '' end || '), ' ||
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''lender_questionnaire'', 200, null, null, null, 5' || case when fees_has_state then ', ''WA''' else '' end || '), ' ||
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''demand_letter'', 250, null, null, null, 5' || case when fees_has_state then ', ''WA''' else '' end || '), ' ||
      -- CA rows
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''resale_certificate'', 275, null, null, null, 5' || case when fees_has_state then ', ''CA''' else '' end || '), ' ||
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''certificate_update'', 100, null, null, null, 5' || case when fees_has_state then ', ''CA''' else '' end || '), ' ||
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''lender_questionnaire'', 200, null, null, null, 5' || case when fees_has_state then ', ''CA''' else '' end || '), ' ||
      '(gen_random_uuid(), ' || quote_literal(org_id::text) || '::uuid, ''demand_letter'', 250, null, null, null, 5' || case when fees_has_state then ', ''CA''' else '' end || ')';

    execute fees_sql;
  end;
end $$;

commit;
