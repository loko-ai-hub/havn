-- The fingerprint formula changed (now built from issuer + form_title
-- + vendor form-variant identifiers + sorted detected-field labels —
-- never the requester's filled values). Old vendor_form_templates rows
-- have stale fingerprints under the new formula, so they'd never match
-- a new ingest's lookup. Clear them so staff can re-curate against
-- fresh ingests.
--
-- Idempotent. Run via the Supabase SQL Editor.
--
-- (Skip this migration if you have NO existing rows in
-- vendor_form_templates yet — nothing to clear.)

delete from public.vendor_form_templates
where created_at < now();
