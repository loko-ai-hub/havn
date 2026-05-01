# God Mode AI tools — smoke test

Exercises the three AI-driven operator surfaces in God Mode:

1. **Havn Templates tab** — template registry viewer, validation health banner, PDF preview, 3-agent AI state onboarding (drafter → legal reviewer → revisor), Copy-as-TypeScript output.
2. **Merge Tag Data tab** — two-level org → community filter, per-community merge-tag table with source badges, manual refresh of OCR resolution.
3. **State Config tab** — 3-agent AI state-service generator (discovery → per-service deep-dive → pricing), Apply-to-state-config, remove-service confirmation modal.

Takes ~20 min to run all three. Each sub-flow is independent; run individually after changes to its respective area.

## Prerequisites (prod)

- Latest deploy includes the God Mode AI tooling.
- Env vars set in Vercel Prod:
  - `AI_GATEWAY_API_KEY` (or OIDC auto-auth on Vercel)
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` (only needed for merge-tag refresh)
- The logged-in user's email is in `app/god-mode/constants.ts → GOD_MODE_EMAILS`.
- `state_fee_limits` has rows for at least one state; `organizations` has at least one entry with `account_type` set.

---

## 1. Havn Templates tab

### 1a. Registry viewer + health banner

- Go to `/god-mode` → **Havn Templates**.
- **Expect**:
  - Heading: "Havn Templates" with `<count> templates · <field-count> merge tags defined` below.
  - Health banner at the top: green "All templates pass validation" when clean; amber/red summary when `validateTemplate` flags issues.
  - At least three cards: Resale Certificate (generic), Lender Questionnaire (generic), Washington Resale Certificate (state = WA).
- Click the WA Resale Certificate card to expand.
- **Expect**:
  - Section-by-section tables listing every field with merge tag, type, required flag, and sources (OCR / cache / manual / order).
  - "Statute" / "Cover letter" / "Legal language" / "Attachments" info lines populated.
  - Chips: `Signature required`, `Valid 30d`, and the `Updated <date>` line in the card subtitle (whatever `lastUpdated` is set to in `wa-resale-certificate.ts`).

### 1b. PDF preview

- Inside the expanded WA card (or while collapsed — preview button is always visible), hit **Preview PDF**.
- **Expect**: a new browser tab opens with a blob: URL serving the rendered sample PDF.
  - Sample values: "Sample Meadows HOA", "Pat Buyer", "456 Sample Lane, Unit 7, Seattle, WA 98101", "$325.00", "$182,500.00", "Sample Insurance Co.", "POL-123456".
  - The page 1 cover letter renders in memo format (see `docs/document-template-smoke-test.md` § 5 for the detailed layout expectations).

### 1c. 3-agent AI state onboarding

Tests the pipeline in `lib/state-onboarding.ts` (`suggestStateTemplate` → `reviewStateTemplate` → `reviseStateTemplate`).

- At the bottom of the Havn Templates tab, find the **AI-assisted state onboarding** panel.
- Pick a state you DON'T already have a template for (e.g., `CA` or `OR`).
- Pick document type `Resale Certificate`.
- Click **Generate + review**.
- **Expect** within 30–90 seconds:
  - Stage indicator ticks through `Drafting` → `Legal review` → `Revising`.
  - Toast: "Reviewed draft ready — N finding(s) from legal review."
  - **Legal review panel** shows a verdict chip (`approve`, `approve-with-changes`, or `revise`), an overall assessment sentence, and findings grouped by severity. Each finding has severity pill, section, issue, recommendation, and optional statute cite.
  - **Draft / Final toggle** appears. "Revised (final)" is selected by default. Switching to "Original draft" shows the pre-review version.
  - When the reviewer approves with zero warnings/criticals, you'll see "reviewer approved with no changes — draft = final" inline.
- Hit **Copy template source**.
- **Expect**:
  - Toast: "Copied <filename>.ts to clipboard."
  - Inline `<pre>` box shows the generated TypeScript with `import type { DocumentTemplate } from "./types";`, a `COVER_LETTER_BODY` stub, and the full `<STATE>_RESALE_CERTIFICATE` export with hydrated field definitions from the registry.
  - Footer comment in the snippet reminds you to import + `registerStateTemplate(...)` in `lib/document-templates/index.ts`.
  - `lastUpdated` is stamped to today's ISO date.
- Paste into `lib/document-templates/<state>-resale-certificate.ts` via Claude Code + wire the registration in `index.ts` + commit.

---

## 2. Merge Tag Data tab

### 2a. Two-level filter

- `/god-mode` → **Merge Tag Data**.
- **Expect**:
  - Left dropdown labeled "Management Company / Self-Managed Association" with `<optgroup>`s: "Management companies" / "Self-managed associations". Inactive orgs annotated with `· (inactive)`.
  - Right dropdown labeled "Community", disabled with placeholder "Pick an organization first…".
- Pick an org with multiple communities.
- **Expect**: community dropdown enables, populated only with that org's communities. Helper line reads `N communities in <Org Name>`.
- Pick a community.
- **Expect**: table renders one row per canonical merge tag (~33 fields), with columns: Field (label + type), Merge tag (monospace), Value, Source, Updated.
- Switching the org dropdown clears the community selection and empties the table.

### 2b. Source badges

For any community that's had governing documents OCR'd:

- **Expect** tags where `community_field_cache` has `source: 'ocr'` show the blue **OCR** badge with a document icon. Manually-entered values (after an order review) show the amber **Manual** badge. Cached-from-prior-order values show the green **Cached** badge. Empty tags show "empty" italic + `—` for source.

### 2c. Refresh this community

- With a community selected, click **Refresh this community**.
- **Expect**:
  - Confirmation modal: "Refresh merge tags for <Community>?" — confirms manual values are preserved and expect 15–30 seconds.
- Click **Refresh community**.
- **Expect** within ~30s:
  - Toast: "Refreshed: N cached, M manual preserved, K unmapped across L OCR doc(s)."
  - Table reloads. Values with `source: 'manual'` are untouched.
- In Supabase, verify `community_field_cache` rows with `source: 'manual'` were NOT overwritten by this run. If the OCR found a higher-confidence answer for an OCR-sourced tag, that row updates; manual rows are preserved.

---

## 3. State Config tab — AI state-service generator

Tests the pipeline in `lib/state-service-onboarding.ts` (`discoverStateServices` → `deepDiveService` (parallel) → `recommendPricing`).

### 3a. Generate + review

- `/god-mode` → **State Config**.
- In the **AI state-service generator** panel at the top, pick a state you want to (re)research. WA exercises the consolidation logic.
- Click **Research services**.
- **Expect** within ~60–90 seconds:
  - Stage indicator ticks through `Discovering services` → `Legal deep-dives` → `Pricing analysis`.
  - Toast: "Drafted N services for <state>."
- Draft view shows one card per service (resale_certificate, lender_questionnaire, demand_letter, etc.). **Expedite must not appear as its own service** — rush is captured per-service via rush chips + rush premium.
- **For WA specifically**: resale_certificate appears exactly ONCE (not two or three times). The `statute` line lists all applicable chapters separated by semicolons, e.g. `"RCW 64.34.425(3) (Condo Act); RCW 64.90.640 (WUCIOA); RCW 64.38.045 (HOA)"`. The `pricingCap` / `standardTurnaround` / `rushTriggerDays` reflect the **tightest** value across the cited statutes.
- Per-service card shows:
  - Cap label (`Max $X.XX (statutory)`, `Actual/reasonable cost (no statutory max)`, or `No statutory cap`).
  - `<N>-day standard` chip.
  - `Rush ≤ <N>d` chip, or `Rush disallowed` (red), or `Rush cap $X.XX`.
  - Auto-refund chip (red "Auto-refund (statutory)" when required by law, amber "Auto-refund (policy)" when vendor policy, hidden when no auto-refund).
  - **Maximum allowable** info row: dollar amount for fixed caps, "No statutory max" otherwise.
  - **Rush threshold** info row.
  - **Auto-refund** info row: "Required by statute" / "Policy (not statutory)" / "No".
  - Rush definition explanatory line when set.

### 3b. Apply to state config

- Click **Apply to state config**.
- **Expect**:
  - Toast: "Applied N services to <state>."
  - `state_fee_limits` table: all draft rows upserted. Existing rows for `master_type_key` values in the draft are **replaced** (delete-then-insert keyed on `(state, master_type_key)`) so duplicates can't accumulate from repeated AI runs. Services outside the draft's key set are untouched.
  - `cap_type` column values are `'fixed'` or `'actual_cost'` (NEVER `'actual'` — that would fail the `fee_cap_type` enum).
  - `ai_memory` text field on each new row contains `Rationale:`, `Pricing:`, `Rush definition:`, `Rush trigger:`, `Notes:`, and `Suggested rush premium:` lines.
- The lower editor panel (the existing State Config editor) reloads and shows the new services with their tight-of values.

### 3c. Remove-service confirmation modal

- In the State Config editor, select a service (e.g. `demand_letter`).
- Click **Remove Service**.
- **Expect**:
  - A red-accented confirmation modal titled `Remove <Formal Name>?` with the `master_type_key` quoted in monospace.
  - "This action cannot be undone."
- Click **Remove service**.
- **Expect**:
  - Row is deleted from `state_fee_limits` for that `(state, master_type_key)`.
  - Toast: "Removed <Formal Name> from <State Name>."
  - Editor snaps to a valid remaining service.
  - Duplicate rows (if any ever existed for the same `master_type_key` in the same state from earlier broken runs) are ALSO removed by the same click, because the delete filters only on `(state, master_type_key)`.

---

## What to watch in function logs

| Log prefix | Source |
|---|---|
| `[state-service-onboarding]` | `lib/state-service-onboarding.ts` — deep-dive parallel calls, failures |
| `[OCR] Merge-tag resolution` | Post-OCR resolver + manual refresh |
| `[god-mode]` / generic console.warn | Server actions in `app/god-mode/*-actions.ts` |

## Common regressions to re-test after changes

- **WA resale shows more than once.** Dedupe in `discoverStateServices` + the upsert-via-delete in `applyDraftedStateConfig` both must be functioning.
- **`cap_type` enum error on Apply.** Every write path needs to go through `capTypeForDb()` in `lib/state-service-onboarding.ts` or the explicit `"actual" → "actual_cost"` translation in `saveStateConfig`.
- **Legal review returns "No object generated: response did not match schema."** The loose `RawSuggestedTemplate` / `RawLegalReview` Zod schemas + post-validation coercion in `state-onboarding.ts` must stay permissive (optional fields, string enums, no numeric bounds).
- **Merge-tag refresh clobbers a manual value.** `persistResolvedMergeTags` in `lib/resolve-merge-tags.ts` must query for existing `source: 'manual'` rows and filter them out of the upsert.
- **Copy template source produces invalid TypeScript.** `buildTemplateSource` in `lib/state-onboarding.ts` should reference only registry keys that exist; newly-proposed fields are commented at the top of the file as TODO.
