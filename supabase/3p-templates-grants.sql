-- Table-level grants for the 3P pipeline tables. Supabase usually adds
-- these automatically on table creation, but the original 3p-templates.sql
-- migration didn't spell them out — and without them the service_role
-- admin client hits "permission denied for table third_party_templates"
-- before RLS even runs. This is also the silent-failure root cause for
-- order A2EA2214: the original requester upload's insert was rejected,
-- left third_party_template_id null, and the only signal was a console
-- error in the submitOrder server log.
--
-- Idempotent — safe to re-run.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.third_party_templates
  TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.field_registry_proposals
  TO anon, authenticated, service_role;
