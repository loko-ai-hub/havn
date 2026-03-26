@AGENTS.md

# Havn — Cursor Project Context

## What is Havn
Havn is a SaaS platform for HOA/COA document management. It allows property management companies and self-managed associations to accept and fulfill document orders (resale certificates, lender questionnaires, estoppel letters, governing documents) through a branded portal. Requesters (homeowners, buyer's agents, title companies) pay per order. Havn takes a platform fee via Stripe Connect.

## Business Model
- Pure transaction fees — no subscriptions
- Management companies set their own prices; Havn enforces state statutory caps automatically
- Stripe Connect (destination charges) handles payment splitting between Havn and the management company
- Initial design partner: AmLo Management (Washington state)

## Tech Stack
- **Frontend:** Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Payments:** Stripe Connect Express (destination charges)
- **Email:** Resend
- **Hosting:** Vercel
- **UI origin:** Components were designed in Lovable and ported into this codebase

## Project Structure
```
app/
  (auth)/         — Login and signup pages
  (onboarding)/   — Onboarding flow
  r/[slug]/       — Public requester portal (stub routes; slug = organizations.portal_slug)
  (dashboard)/    — Main app after onboarding (not yet built)
components/
  onboarding/     — All onboarding step components
  ui/             — shadcn/ui primitives
lib/
  supabase/
    client.ts     — Browser Supabase client (createBrowserClient)
    server.ts     — Server Supabase client (createServerClient + cookies)
  us-states.ts    — All 50 US states as { abbr, name }
  fee-data.ts     — State fee cap definitions (currently stubbed, needs real data)
  requester-flow.ts — Requester portal step order and `/r/[slug]` path helpers (no data layer yet)
  utils.ts        — Utility functions
```

## Routing
- `/signup` — Create account (redirects to `/onboarding` on success)
- `/login` — Sign in (redirects to `/dashboard` on success)
- `/onboarding` — 5-step onboarding flow
- `/onboarding/complete` — "You're live" screen shown after onboarding finishes
- `/dashboard` — Main app (not yet built)
- `/r/[slug]` — Requester portal landing (public; `slug` = `organizations.portal_slug`)
- `/r/[slug]/role` → `/property` → `/documents` → `/delivery` → `/review` → `/confirmation` → `/r/[slug]/track/[orderId]` — stub flow (see `lib/requester-flow.ts`)

## Onboarding Flow
Lives at `app/(onboarding)/onboarding/page.tsx`. Orchestrates 5 steps:

1. **Step 1 — Account type** (`StepAccountType`) — Selects management_company or self_managed. No DB write.
2. **Step 2 — Company details** (`StepCompanyDetails`) — Creates `organizations` row, updates user metadata with `organization_id`, sets profile role to `owner`.
3. **Step 3 — Fees** (`StepFees`) — Inserts rows into `document_request_fees` for each document type with base fees, rush fees, and turnaround days.
4. **Step 4 — Portal branding** (`StepPortalSetup`) — Updates `organizations` with `brand_color`, `portal_tagline`, uploads logo to Supabase Storage `logos` bucket.
5. **Step 5 — Invite admins** (`StepInviteAdmins`) — Inserts rows into `invitations` table.

After step 5 → redirect to `/onboarding/complete`.

## Supabase Schema
Core tables:
- `organizations` — Management company or self-managed association. Has `portal_slug`, `account_type`, branding fields, Stripe Connect fields.
- `companies` — Individual HOA/COA communities belonging to an organization
- `profiles` — Users linked to `auth.users`. Has `organization_id` and `role`. Auto-created on signup via DB trigger.
- `company_users` — Junction table assigning users to specific communities
- `document_request_fees` — Fee config per organization per document type
- `document_orders` — Orders submitted through the portal
- `order_documents` — Files attached to fulfilled orders
- `invitations` — Team member invitations with token-based acceptance
- `state_fee_limits` — Statutory fee caps by state and document type (seeded, 14 states)

## Auth Pattern
- Supabase Auth handles login/signup
- On signup, a DB trigger auto-creates a `profiles` row
- After step 2 of onboarding, `organization_id` is written to user metadata via `supabase.auth.updateUser({ data: { organization_id } })`
- RLS uses `auth_company_id()` SECURITY DEFINER function that reads `organization_id` from JWT user_metadata
- Never use a profiles table join for RLS — always use `auth_company_id()`
- Always use browser client (`lib/supabase/client.ts`) in client components
- Always use server client (`lib/supabase/server.ts`) in server components and server actions

## Supabase Storage
- Bucket: `logos` — stores organization logo uploads
- Must be created manually in Supabase dashboard with public access enabled
- Logo URL is saved to `organizations.logo_url` after upload

## Key Enums
- `account_type`: `management_company`, `self_managed`
- `master_type_key`: `resale_certificate`, `lender_questionnaire`, `certificate_update`, `demand_letter`, `estoppel_letter`, `governing_documents`, `expedite`
- `order_status`: `pending_payment`, `paid`, `in_progress`, `fulfilled`, `cancelled`, `refunded`
- `delivery_speed`: `standard`, `rush_3day`, `rush_next_day`, `rush_same_day`
- `user_role`: `owner`, `admin`, `property_manager`, `staff`

## Fee Cap Logic
- State fee caps are stored in `state_fee_limits` table (14 states seeded)
- Management companies set their own base prices during onboarding
- If a base price exceeds the statutory cap for a given state, it is automatically capped down at order time — not at onboarding time
- `lib/fee-data.ts` currently exports stubbed empty arrays — needs to be populated from `state_fee_limits` table via a server query
- Fee cap enforcement happens server-side, never just in the UI

## What's Built
- ✅ Supabase schema v5 with RLS and auth trigger
- ✅ State fee limits seeded (14 states)
- ✅ Auth flow (signup, login) — styled and working
- ✅ Tailwind v4 configured with custom Havn color tokens
- ✅ Onboarding components (all 5 steps, ported from Lovable)
- ✅ Onboarding Supabase writes (organizations, fees, branding, invitations)
- ✅ Slug availability check wired to real Supabase query
- ✅ Onboarding redirects to `/onboarding/complete`
- ✅ "You're live" screen with portal URL, nudge cards, Supabase data
- ✅ Supabase Storage `logos` bucket created (public)
- ✅ Custom Havn colors: havn-navy, havn-gold, havn-surface, havn-success, havn-amber, havn-taupe

## What's Not Built Yet
- ❌ End-to-end signup → onboarding → complete flow not yet manually tested
- ❌ `/dashboard` — Main app shell and dashboard
- ❌ Stripe Connect integration
- ❌ Requester portal — stub routes at `/r/[slug]/…` with placeholder UI; full Lovable components not yet ported
- ❌ Real fee cap data wired from `state_fee_limits` to `StepFees`
- ❌ Invitation acceptance flow
- ❌ Email sending via Resend

## Requester Portal
**Stub (in repo):** Next.js routes under `app/r/[slug]/` with placeholder screens and `lib/requester-flow.ts` for step order and paths. Not wired to Supabase.

**Lovable (not yet ported):** Full requester-facing portal with these components in `src/components/portal/`:
- `PortalLanding` — homepage for a community's portal
- `PortalCreateAccount` — requester account creation
- `PortalPaymentBlock` — Stripe payment UI
- `StepDocumentSelection`, `StepPropertyAddress`, `StepRequesterType`, `StepYourInfo`, `StepDeliveryOptions`, `StepLenderDocument`, `StepAddons`, `StepReview`, `StepConfirmation`

These need to be ported after the dashboard is built.

## Important Rules
- Never put Supabase service role key in client-side code
- Always use RLS — never bypass with service role on the frontend
- State fee caps must be enforced server-side, not just in the UI
- Portal slugs must be unique — check `organizations.portal_slug` before insert
- Stripe Connect model is destination charges — platform-side refunds do not require the `stripeAccount` header
- `property_manager` is a first-class role — do not infer it from org relationship
- All client components must have `"use client"` at the top
- Use `next/navigation` not `react-router-dom`
- Use `next/image` not `<img>` where possible