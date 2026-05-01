# Third-party template workflow — smoke test

End-to-end exercise of the lender/title "upload your own form" flow: requester upload → OCR + AI mapping → God Mode review → approve / deny / 5-day auto-default. Run this after any change to `lib/3p-template-pipeline.ts`, `lib/ingest-external-template.ts`, `lib/propose-registry-fields.ts`, the Stripe webhook, or the God Mode 3P tab. Takes ~15 min for the happy path (longer only if exercising the 5-day expiry).

## Prerequisites (prod)

- Latest deploy includes the 3P workflow (post-`floating-purring-river` rollout).
- Migration `supabase/3p-templates.sql` applied to the production Supabase project.
- Supabase Storage bucket `third-party-templates` exists (private, service-role access).
- Env vars set in Vercel Prod:
  - `AI_GATEWAY_API_KEY` (or OIDC auto-auth on Vercel)
  - `CRON_SECRET`
  - `RESEND_API_KEY`
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` (Document AI)
  - `NEXT_PUBLIC_APP_URL=https://havnhq.com`
- Stripe prerequisites from `docs/stripe-smoke-test.md` are green.
- AmLo (or the target org) has at least one active community.
- A real lender questionnaire PDF handy for the upload step. (Sample at `public/sample-lender-questionnaire.pdf` works as a fallback.)
- `GOD_MODE_EMAILS[0]` (currently `loren@havnhq.com`) is the address that receives staff-notification emails.

## Happy path — Approve

### 1. Requester upload

- Open `https://havnhq.com/r/<portal-slug>` in a private/incognito window.
- Start an order, pick **Lender / Title** as the requester role.
- Fill `info` → `property`.
- On the **Documents** step, pick **Upload Your Own Form**. Attach a real lender questionnaire PDF.
- **Expect**: the file input shows "Uploading…" briefly, then "Uploaded: <filename>". The Continue button stays disabled while uploading.
- Proceed through `delivery` → `addons` → `review` → click **Submit**.

### 2. Payment

- On the Payment step, pay with Stripe test card `4242 4242 4242 4242` (any future expiry, any CVC).
- Land on the confirmation page.

### 3. Ingestion (server-side)

Within ~30–60 seconds after payment:

- **Supabase → `document_orders`** for the new order: `third_party_template_id` is set and `third_party_review_status = 'pending'`.
- **Supabase → `third_party_templates`**: `ingest_status` transitions `pending` → `processing` → `ready`. Fields `form_title`, `issuer`, `document_type`, `detected_fields` (JSONB), `mapped_count`, `unmapped_count`, and `auto_fill_coverage_pct` are populated.
- **Vercel function logs** (`/api/webhooks/stripe`): contains `[3p-ingest]` lines; no errors.
- **`field_registry_proposals`**: may contain rows with `status = 'pending'` when the form had labels not already in the Havn registry.
- **Resend dashboard**: a `3P form awaiting review` email was sent to `GOD_MODE_EMAILS[0]`.

### 4. Havn staff review — Approve

- Log in as a God Mode admin at `https://havnhq.com/god-mode`.
- Go to the **3P Templates** tab. The Pending filter shows the uploaded form row.
- Expand the row:
  - **Coverage pill** shows the auto-fill %.
  - Ingestion badge is green (`Ready`).
  - **Open vendor PDF** opens the signed URL in a new tab.
  - **Detected fields** table lists every external label with its inferred registry key + confidence.
  - **Proposed new registry fields** list (if any) shows pending proposals.
- If any proposals are present: hit **Approve + copy** on one. A toast reports the snippet was copied. Paste into `lib/document-templates/field-registry.ts` via Claude Code + commit to persist.
- Add a short note in the **Review** textarea and hit **Approve**.
- **Expect**:
  - Row moves to the Approved filter.
  - `third_party_templates.review_status = 'approved'`, `reviewer_email` + `reviewed_at` set.
  - `document_orders.third_party_review_status = 'approved'`.
  - Requester receives the "Your form has been approved" email from Resend.
- Visit `/dashboard/requests/<orderId>` as the management company: an **Using requester-supplied form** badge renders next to the order status.

## Denial path

- Repeat steps 1–3 for a fresh order.
- In God Mode, enter a reason in the Deny field and click **Deny**.
- **Expect**:
  - `review_status = 'denied'` on the template row.
  - `document_orders.third_party_review_status = 'denied'`.
  - Requester receives the "Your form could not be used" email with the reason quoted.
  - Management-company dashboard shows the **Default Havn form (3P denied)** badge.
  - Order proceeds to the existing Havn fulfillment flow unchanged — no extra friction for the management company.

## 5-day auto-default path

This exercises the daily cron.

- Create a third order + payment as in steps 1–2. Wait until `third_party_templates.ingest_status = 'ready'` and `review_status = 'pending'`.
- In the Supabase table editor, edit the row's `created_at` to a timestamp 6+ days ago. (Production shortcut: shave the window by running the cron manually.)
- Manually trigger the cron:
  ```bash
  curl -i "https://havnhq.com/api/cron/3p-expire" \
    -H "x-cron-secret: $CRON_SECRET"
  ```
  **Expect**: 200 response with `{"expired": <n>, "errors": [], "elapsedMs": …}` where `<n>` includes your test row.
- In Supabase:
  - `review_status = 'auto_defaulted'`, `auto_defaulted_at` set.
  - `document_orders.third_party_review_status = 'auto_defaulted'`.
- Resend: requester receives the "Your form was not reviewed in time" email.
- Dashboard: order shows **Default Havn form (3P timed out)** badge.
- **If not exercising for real**: the Vercel cron fires daily at 15:00 UTC. Check the deployment's Logs tab for a `[cron/3p-expire] done — expired=N` line at the scheduled time to confirm production wiring works.

## Failure + retry path

To verify the "Retry ingestion" path handles upstream OCR flakes:

- Upload a deliberately corrupt PDF (or a password-protected one with no text layer).
- After payment, `ingest_status` should land on `failed` with an `ingest_error` message.
- In God Mode, the row shows an **Ingestion failed** banner with the error text plus a **Retry** button.
- Upload a valid file in Supabase Storage at the same `storage_path_pdf` (or replace the file upstream), then click **Retry**.
- **Expect**: status flips to `ready`, mapping populates, and Approve / Deny controls unlock.

## Abandoned uploads (sanity check)

- Pick **Upload Your Own Form** and upload a file, but navigate away before hitting Submit on the review page. The file lives in `third-party-templates/pending/<uuid>.pdf` with no DB row.
- These orphan files are currently acceptable (no cleanup job). Manually prune via the Supabase Storage UI if they accumulate.

## What to watch in function logs

| Log prefix | Source |
|---|---|
| `[3p-ingest]` | Stripe webhook fires the pipeline |
| `[3p-pipeline]` | `lib/3p-template-pipeline.ts` — ingestion success, failure, proposal generation |
| `[cron/3p-expire]` | Daily 5-day sweep (start + done + errors) |
| `[submitOrder]` | Requester-side order creation (3P row insert) |

Look for any line containing `Error:` or `failed` under the deployment's Logs tab; each run should otherwise be quiet with one `done` summary per invocation.
