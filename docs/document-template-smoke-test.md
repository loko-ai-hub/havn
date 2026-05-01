# Document template workflow — smoke test

End-to-end exercise of the code-driven document template system: community document upload → OCR + Claude Opus merge-tag resolution → order review with auto-filled fields → click-to-sign → PDF generation with cover letter, sections, attachments, signature page → versioning + 30-day download. Run this after any change to `lib/document-templates/*`, `lib/pdf-generator.ts`, `lib/pdf-packager.ts`, `lib/resolve-merge-tags.ts`, `lib/ocr-pipeline.ts`, or the dashboard review flow. Takes ~15 min.

## Prerequisites (prod)

- Latest deploy includes the document-template overhaul.
- Migration `supabase/document-versioning-and-signatures.sql` applied (adds `version`, `generated_by`, `generated_at`, `expires_at` to `order_documents` and creates `document_signatures`).
- Supabase Storage buckets exist: `community-documents`, `order-documents`, `logos`.
- Env vars set in Vercel Prod:
  - `AI_GATEWAY_API_KEY` (or OIDC auto-auth on Vercel)
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` (Document AI)
  - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`
- Stripe smoke test (`docs/stripe-smoke-test.md`) is green.
- Target community is in **Washington** (`communities.state = 'WA'`) so the WA-specific template applies. Otherwise the generic template renders and some assertions below don't apply.
- Target organization has `name`, `support_email`, `logo_url`, and ideally a contact phone configured so the cover letter memo renders completely.

## 1. Community document upload → OCR → merge-tag resolution

Upload raw governing documents so the merge-tag cache is populated before the order flow.

- As the management-company user, go to `/dashboard/communities/<community-id>/documents`.
- Upload CC&Rs, Bylaws, and an Insurance Certificate as separate PDFs.
- **Expect** within ~60 seconds per document:
  - Vercel logs show `[OCR]` extraction complete.
  - `community_documents` rows exist with `ocr_status = 'complete'`, a `document_category` from the canonical taxonomy (e.g. `Declaration and amendments`, `Bylaws and amendments`, `Certificate of insurance`), and populated `storage_path_txt` / `storage_path_json`.
  - Vercel logs show `[OCR] Merge-tag resolution: N resolved, M cached, K unmapped`.
  - `community_field_cache` rows appear with `source = 'ocr'` for community-level keys (e.g. `association_name`, `reserve_fund_balance`, `insurance_company`).

## 2. God Mode → Merge Tag Data verification

- Visit `/god-mode` → **Merge Tag Data**.
- Pick the management company in the org dropdown → pick the community.
- **Expect** a table with one row per canonical merge tag. Fields sourced from OCR show a blue OCR badge + the document's timestamp; fields set manually in the order review later will show as Manual.

## 3. Create an order + review

- As a requester, walk through `/r/<portal-slug>` to the Review page and submit a **Resale Certificate** order for a WA property. Pay with Stripe test card `4242 4242 4242 4242`.
- Once the Stripe webhook marks the order paid, the management company receives the notification email.
- Go to `/dashboard/requests/<orderId>/review`.
- **Expect**:
  - The form shows the WA Resale Certificate template's sections: Association Information, Property Information, Financial Information, Reserve Study Disclosure, Insurance, Restrictions & Governance, Litigation/Liens/Pledged Assets, Certification.
  - Fields are pre-filled from the community cache where OCR supplied values.
  - Required fields show a red asterisk; the completion percentage at the top matches filled-out-of-total.
  - The order-specific fields (Property Address, Unit Number, Requester Name, Closing Date) are filled from the order itself.
  - `Seller(s)` is an editable text field (order-specific, blank by default). Fill it in.

## 4. Click-to-sign modal

- Scroll to the bottom. Because WA's template has `requiresSignature: true`, the primary button reads **Approve & Sign**.
- Click it.
- **Expect** a click-to-sign modal:
  - Prefilled `Your name` (from the logged-in user) and `Email`.
  - Title field (optional).
  - A certification checkbox quoting the template's statutory `certificationText` (RCW 64.90.640 language).
  - Submit disabled until checkbox is ticked.
- Fill in title `Community Manager`, tick the certification, click **Sign & Generate**.

## 5. PDF generation — verify layout

Within ~15 seconds the order is fulfilled and a PDF appears. Download V1 from the versions list.

### Page 1 — Cover letter (memo format)

- Organization logo (or bold company name) top-left.
- Then, **all left-aligned**, top-to-bottom:
  - `Date: <Month Day, Year>`
  - `To: <Requester Name>` + their email below
  - `RE: Condominium Resale Certificate & Disclosures` — bold, navy
  - `Property Address:`, `Seller(s):`, `Buyer(s):` — bold labels, regular values
  - `Dear <Requester Name>,`
  - Body paragraphs with **Validity:**, **Review Period:**, **Liability:** bold labels inline.
  - `Enclosed Documents Checklist:` — bold label, then real `•` bullets for every exhibit line.
  - Closing "If you have any questions… contact at `<phone>` or `<email>`."
  - Signature block: `Jane Sample` / `Community Manager` / `<Management Co>`.
- **Footer**: `Powered by Havn` on the left, `<Brand> · Order #xxxxxxxx · Valid until <date> · Page 1 of N` on the right. No `{{TOTAL}}` literal anywhere.

### Page 2+ — Document body

- Navy header band shows `WASHINGTON RESALE CERTIFICATE` (not "STATE OF WASHINGTON — WASHINGTON RESALE CERTIFICATE") with the full statute citation wrapped beneath.
- Sections render as **filled navy-tinted bands with a 4pt left accent stripe** and bolder navy text, not thin underlines cutting through the title.
- Boolean fields (`Operating at a Deficit`, `FHA/VA Approved`, `Fidelity Bond`) render as drawn checkbox shapes — filled black when matched, outlined when unmatched — NOT Unicode ☑/☐ glyphs.
- Long text values (statute citations, mailing addresses) wrap across multiple lines instead of being ellipsized.
- Sections with no populated data + `condition: "always"` show the `emptyText` (e.g. "None reported.") rather than being omitted.
- Conditional sections like "FHA/VA Certification" only appear when the governing field is truthy.

### Required Disclosures + Signature page

- **Required Disclosures** section renders the verbatim statutory disclosures from `legalLanguage.requiredDisclosures` (14+ entries for WA: RCW 64.34.425(1)(a)–(m), WUCIOA, HOA, etc.).
- Certification paragraph is not orphan-split (does NOT start at the bottom of one page and end at the top of the next).
- Authorized Signature block shows "Signed electronically", the signer's name + title + date.
- Disclaimer (`legalLanguage.disclaimerText`) renders at the bottom.
- Footer format is identical to page 1.

### Attachments (if community docs are uploaded)

- After the main document, a TOC divider page lists every attachment.
- The canonical categories from the WA template's `attachments.categories` list each appear in order, pulling the most recent matching community document. Legacy rows tagged with old names (e.g. "CC&Rs / Declaration") still match the WA template's "Declaration and amendments" slot via the alias layer in `lib/document-categories.ts`.
- Each attachment PDF appears in full after the TOC.

## 6. Versioning — regenerate

- Back on `/dashboard/requests/<orderId>/review`, edit one field (e.g. change `reserve_fund_balance`) and click **Sign & Regenerate**. Sign again.
- **Expect**:
  - Toast reports "Signed as V2 and delivered."
  - Versions list shows both V1 and V2 at the top of the review form.
  - V1 still downloads cleanly; V2 has the updated value.
  - `order_documents` has two rows, `document_signatures` has two rows linked to each respective version.
  - Requester email subject line contains the latest version's short ID.

## 7. Delivery link — 30-day expiry

- In the requester email, click **Download Document**.
- **Expect**: Signed URL opens the V2 PDF. The URL's `token` + expiry query params resolve; the link is valid for 30 days from generation (verify with `vercel logs` or by inspecting the signed URL's `Expires` parameter).
- In the versions list on the dashboard, hit **Download** on V1. Opens the V1 PDF from a freshly-minted signed URL.

## 8. God Mode — Havn Templates validation

- `/god-mode` → **Havn Templates**.
- The WA Resale Certificate card shows:
  - A green "All templates pass validation" banner OR any specific issues.
  - Chip: `Signature required`, `Valid 30d`.
  - "Updated Apr 24, 2026" (or whatever `lastUpdated` is set to).
- Hit **Preview PDF** on the WA card. A sample PDF opens in a new tab with placeholder values (Sample Meadows HOA, Pat Buyer, etc.) — this is the exact same generator the real fulfillment uses.

## What to watch in function logs

| Log prefix | Source |
|---|---|
| `[OCR]` | `lib/ocr-pipeline.ts` — community document OCR + merge-tag resolution |
| `[fulfillAndGenerate]` | `app/dashboard/requests/actions.ts` — PDF generation + signed URL |
| `[pdf-generator]` | Logo fetch / cover letter / section rendering |
| `[attachments]` | `lib/pdf-packager.ts` — attachment bundling |

## Regression hot-spots to re-exercise after any template change

- Cover letter renders on one page (not spilling to page 2). If it does spill, tighten `COVER_LINE_HEIGHT` / `COVER_BLANK_HEIGHT` in `lib/pdf-generator.ts`.
- Footer shows neither a `{{TOTAL}}` placeholder nor an "Apr" → "lay" overlap with "Valid until". If either regresses, the single-pass footer post-render in `pdf-generator.ts` is broken.
- Boolean checkboxes render as shapes. If you see text errors like `WinAnsi cannot encode "☑"`, a Unicode glyph has slipped back in.
- Section rule does not strike through the section title text. If it does, the vertical spacing in the section-header block is wrong.
