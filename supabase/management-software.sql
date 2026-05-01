-- Capture the incumbent management software a new org is using when they sign up.
-- Optional field from onboarding step 2 — intended for competitive intel / integration prioritization,
-- not for business logic. Nullable.

alter table organizations
  add column if not exists management_software text,
  add column if not exists management_software_other text;

comment on column organizations.management_software is
  'Onboarding step 2: incumbent software (e.g. appfolio, vantaca, cinc, "other", "none"). Optional.';

comment on column organizations.management_software_other is
  'Free-text value when management_software = "other". Optional.';
