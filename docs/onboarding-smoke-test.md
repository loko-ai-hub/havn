# Onboarding flow — smoke test

Exercise of the five-step onboarding wizard at `/onboarding`. Most of this was exercised in the "MC feedback round 1-4" commit series (see `22a1afa`, `9bff4a1`, `7df85b7`, `f337cd7`) and the Stripe wiring commit (`6df2493`), so the expectations below are re-verification after any change to `app/(onboarding)/*` or `components/onboarding/*`. Takes ~10 min for the full new-signup walkthrough.

## Prerequisites

- Latest deploy.
- Test email you can sign up with (or a just-created auth user sitting on `/onboarding`).
- Supabase dashboard access to spot-check row inserts.
- Env vars: `RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Signup → land on Onboarding

- Sign up at `/signup` with a fresh email + password.
- Confirm email (or accept the auto-verify if email confirmation is disabled in Supabase Auth).
- **Expect**: redirected to `/onboarding` with step 1 active.
- ✅ **Previously verified**: round 2 of MC feedback (`6b1468c`). Re-run only after changes to `app/(auth)/signup/*` or the DB trigger that auto-creates `profiles` on signup.

## Step 1 — Account type (`StepAccountType`)

- Select **Management Company** OR **Self-managed Association**.
- **Expect**: Continue enables. No DB writes yet.
- ✅ **Previously verified** in rounds 1-2 MC feedback.

## Step 2 — Company details (`StepCompanyDetails`)

- Fill company name, portal slug, city/state/zip, website, contacts.
- Click Continue.
- **Expect**:
  - `organizations` row created with the filled fields + `portal_slug` unique against any existing slug (the slug-availability check runs live as the user types).
  - `auth.users.user_metadata.organization_id` set to the new org's id.
  - `profiles.role` set to `owner` for this user.
  - `profiles.organization_id` set.
- If the slug is taken, the UI shows an inline "That slug is already in use" message and Continue stays disabled.
- ✅ **Previously verified**: MC rounds 1-4 (slug availability, city/state/zip, website in `d27e2f4`).

## Step 3 — Fees (`StepFees`)

- For each document type the state caps, set a base fee + rush fee + turnaround days. Statutory caps are enforced inline (can't save a base fee above `state_fee_limits.pricing_cap` for the state + doc type).
- Click Continue.
- **Expect**:
  - `document_request_fees` rows inserted for each configured doc type (`resale_certificate`, `lender_questionnaire`, etc.) linked to the org.
  - Caps checked server-side — attempting to bypass via stale client state fails at insert.
- ✅ **Previously verified**: MC feedback rounds 3-4 (state unlock, table widths, progress bar, badges — `22a1afa`).

## Step 4 — Portal branding (`StepPortalSetup`)

- Upload a logo (PNG/JPG).
- Pick a primary color + optional tagline / display name.
- Click Continue.
- **Expect**:
  - File uploaded to the `logos` Supabase Storage bucket at `<orgId>/<timestamp>.<ext>`.
  - `organizations.logo_url` / `brand_color` / `portal_tagline` / `portal_display_name` populated.
  - Live preview card on the left matches the saved branding.
- ✅ **Previously verified**: round 1 (logo display), round 3 (badges + color) MC feedback.

## Step 5 — Invite admins (`StepInviteAdmins`)

- Enter one or more emails + roles (admin / property_manager / staff).
- Click **Send invitations** (or Skip).
- **Expect**:
  - `invitations` rows inserted — each row has `token`, `email`, `role`, `organization_id`, `invited_by`, `expires_at` (typically 7 days out), and `accepted_at = null`.
  - Resend dispatches one invitation email per row with the acceptance URL `https://havnhq.com/accept-invite?token=<uuid>`.
- If Resend is mis-configured, an inline UI error reports the exact failure (added in `577e027`).
- ✅ **Invite send path previously verified**: commit `2281875 Fix invite email sender + debug token lookup`. Invite acceptance path is covered in `docs/invitations-smoke-test.md`.

## Complete screen

- After step 5, redirect to `/onboarding/complete`.
- **Expect**:
  - "You're live" screen renders portal URL (`https://havnhq.com/r/<portal-slug>`), nudge cards (Stripe Connect, first community, first document), and live Supabase data (community count, invitation pending count).
  - Clicking **Go to dashboard** lands on `/dashboard` cleanly.
- ✅ **Previously verified** in rounds 2-4 MC feedback.

## Regression hot-spots

- Any change to the 5-step state machine in `app/(onboarding)/onboarding/page.tsx` — verify Continue disables when required fields are blank, Back works, refresh preserves progress (if that's the expected behavior for that step).
- Any change to `organizations` schema — rerun step 2 verifying the new columns are persisted.
- Any change to `state_fee_limits` — rerun step 3 verifying cap enforcement still surfaces the statutory max inline.
- Any change to the Resend invite template or `sendInvitationEmail` — rerun step 5 end-to-end including clicking the email link (continues into the invite-acceptance doc).

## What to watch in function logs

| Log prefix | Source |
|---|---|
| `[signup]` | `app/(auth)/signup/*` server actions |
| `[onboarding]` | 5-step page actions (org create, fees insert, logo upload, invite send) |
| `[invitations]` | `lib/resend.ts → sendInvitationEmail` |
