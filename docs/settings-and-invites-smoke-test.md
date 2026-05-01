# Settings, management, & invitations — smoke test

Exercises `/dashboard/settings` (company details, branding, fees, Stripe Connect, team roster, pending invites) and the end-to-end invite flow (Step 5 onboarding send → email receipt → `/accept-invite` acceptance → dashboard access). The bulk of this was tested in MC feedback rounds 1-4 (`22a1afa`, `9bff4a1`, `6b1468c`, `d27e2f4`, `e2e034c`) and the invitation-fix commits (`2281875`, `d3d4a0e`), so sections below are marked with ✅ where already verified.

## Prerequisites

- Latest deploy.
- Management company owner account already logged in.
- A second email address you can receive invitations at (ideally one NOT in `blocked_emails`).
- Env vars: `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Supabase keys.

---

## 1. Settings page shell (`/dashboard/settings`)

- Log in as the org owner and visit `/dashboard/settings`.
- **Expect**:
  - Sections render in order: Company details → Branding → Portal → Fees → Stripe Connect → Team → Pending invitations.
  - Breadcrumb + sidebar reflect the current route.
- ✅ **Previously verified**: rounds 1-4 MC feedback.

## 2. Company details

- Edit company name, city, state, zip, website, support email.
- Save.
- **Expect**:
  - `organizations` row updated; no duplicate rows.
  - Optimistic UI feedback; success toast.
- ✅ **Previously verified**: `d27e2f4` MC-20 (website + street address).

## 3. Branding

- Upload a new logo, tweak primary color, update portal tagline + display name.
- Save.
- **Expect**:
  - Logo uploaded to `logos` bucket at `<orgId>/<timestamp>.<ext>`.
  - `organizations.logo_url`, `brand_color`, `portal_tagline`, `portal_display_name` updated.
  - `/r/<portal-slug>` landing page reflects the new branding within a refresh.
- ✅ **Previously verified**: MC rounds 1-3 + round 4 MC-8 fixes (`dccdd20`).

## 4. Fees

- Pick a state tile; update a document's base fee + rush fee + turnaround days.
- **Expect**:
  - Statutory cap bar renders above each input; entering a value above the cap shows inline error.
  - Save updates `document_request_fees` rows — one per doc type per state.
  - The requester portal `/r/<slug>/delivery` / `/r/<slug>/documents` pages pick up the new fees on next load.
- ✅ **Previously verified**: MC rounds 3-4 (state unlock, table widths, cap enforcement).

## 5. Stripe Connect

- Follow prompts to start or refresh Stripe Connect Express onboarding.
- **Expect**: round-trips to Stripe's hosted form, redirects back to `/dashboard/settings`, `organizations.stripe_onboarding_complete` flips to `true` when Stripe confirms.
- ✅ **Previously verified** end-to-end in `6df2493 Wire up Stripe Connect end-to-end`. See also `docs/stripe-smoke-test.md` for the payment-side coverage.

## 6. Team roster

- **Expect**: table of team members with email, role (owner / admin / property_manager / staff), joined date.
- Role changes: not part of the initial MVP — leave as read-only unless explicitly implemented.
- ✅ **Previously verified**: round 2 MC feedback.

## 7. Pending invitations (send from settings)

- Click **Invite team member**.
- Enter the second test email + pick a role. Click Send.
- **Expect**:
  - Row inserted into `invitations`: `email`, `role`, `organization_id`, `invited_by = <current user id>`, `token` (uuid), `expires_at` ≈ 7 days out, `accepted_at: null`.
  - Resend dispatches the invite email. Email contains a `https://havnhq.com/accept-invite?token=<uuid>` link.
  - UI reflects the pending invite with a "Resend" and "Revoke" action.
- ✅ **Send path previously verified**: `2281875 Fix invite email sender + debug token lookup`.

### Revoke a pending invitation

- Click **Revoke** on a pending row.
- **Expect**: row deleted from `invitations`; the token becomes invalid immediately (the accept flow short-circuits with "Invitation no longer valid").

---

## 8. Invitation acceptance end-to-end

Starts from the email, ends with the invitee logged into the dashboard. Exercises `app/(auth)/accept-invite/*`.

### 8a. Click the email link

- Open the invite email and click the link.
- **Expect**: `/accept-invite?token=<uuid>` loads. The form renders with the invited email pre-filled + read-only, role displayed, organization name + brand color.

### 8b. Accept

- Set a password (if the account doesn't exist yet) OR log in (if the email matches an existing auth user).
- Submit.
- **Expect**:
  - If NEW user: `auth.users` row created, `profiles` row auto-created via DB trigger with `organization_id` + `role` matching the invitation.
  - If EXISTING user: `profiles.organization_id` + `role` updated to match the invitation. If the user was already associated with a different org, handle as a transfer with a confirmation screen (verify the exact behavior against the implementation — this was hardened in `d3d4a0e`).
  - `invitations.accepted_at` set to `now()` (column was renamed from `accepted` in `d3d4a0e`; regression check: confirm this is timestamptz, not boolean).
  - Redirect to `/dashboard` as the newly-joined user.
- ✅ **Previously verified**: `d3d4a0e Fix invitation system: column is accepted_at not accepted` + `2281875`.

### 8c. Invalid token

- Manually tamper with the URL or use an already-accepted token.
- **Expect**: "Invitation no longer valid" page — no auth created, no DB mutation.
- ✅ **Previously verified** with the fix in `2281875` (token-lookup debug logging).

### 8d. Expired token

- Take a pending invite and manually set its `expires_at` to the past in Supabase.
- Open the link.
- **Expect**: "This invitation has expired" error screen; no acceptance.

---

## 9. Blocked emails / orgs (god-mode tie-in)

If the org is blocked by a god-mode admin, the settings page for that org redirects to `/blocked` (exercised in `90ef665` and `67fc5c4`).

- Block an org via god-mode → try to log in as any of its users → land on `/blocked`.
- Unblock → users can log back in and hit `/dashboard/settings` normally.
- ✅ **Previously verified**: `90ef665 Fix unblock flow: unban users properly, blocked page auto-redirects`.

---

## Regression hot-spots

- Any change to `app/dashboard/settings/actions.ts` — re-run items 2, 3, 4, 7 above.
- Any change to `lib/resend.ts → sendInvitationEmail` — re-run item 7 + 8a.
- Any change to the DB trigger that auto-creates `profiles` on signup — re-run item 8b for a NEW user.
- Any change to `invitations` schema — re-run items 7 + 8b + 8c + 8d.
- Any change to `/accept-invite` UI — re-run 8a + 8b only (the UI-layer paths).

## What to watch in function logs

| Log prefix | Source |
|---|---|
| `[settings]` | `app/dashboard/settings/actions.ts` |
| `[invitations]` | `lib/resend.ts → sendInvitationEmail` + `app/(auth)/accept-invite/actions.ts` |
| `[accept-invite] Token not found` | Specific failure path (logged in `2281875`) |
| `[stripe-connect]` | `app/dashboard/settings/stripe/actions.ts` |
