# Communities (associations) — smoke test

Exercises the management-company Communities pages: listing, detail, and document library. Core CRUD + doc upload was exercised in MC feedback rounds 1-4 (`419bbef`, `dccdd20`, `7df85b7`, `22a1afa`), so most items below are marked as previously verified. Re-run after any change to `app/dashboard/communities/*`, the OCR pipeline, or the canonical document-category taxonomy in `lib/document-categories.ts`.

## Prerequisites

- Latest deploy.
- Management company user with at least one community already seeded, plus a test PDF for CC&Rs / Bylaws / Insurance uploads.
- Env vars: `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `AI_GATEWAY_API_KEY` (for the post-OCR merge-tag resolver), Supabase keys, Resend (not strictly needed for this flow).

## 1. Communities list (`/dashboard/communities`)

- Visit the page.
- **Expect**:
  - Grid/list of active communities (`communities.status = 'active'`).
  - Per-community badges showing counts: documents uploaded, required-categories met, OCR-indexed pages.
  - Search / filter input at the top.
- ✅ **Previously verified**: MC rounds 1-3 (performance counts, progress bar, badges — `22a1afa`).

## 2. Community detail (`/dashboard/communities/[id]`)

- Click a community card.
- **Expect**:
  - Detail page with legal name, city/state/zip, property manager contact, document counts by category.
  - "Required categories" checklist comparing what's uploaded vs. the required set (canonical categories from `lib/document-categories.ts`).
- ✅ **Previously verified**: round 4 MC feedback (`f337cd7` for MC-22 around community detail).

## 3. Create / edit community

- Hit **+ Add community** on the list page.
- Fill legal name, state, zip, property manager fields. Save.
- **Expect**:
  - New row in `communities` with `organization_id` set to the current org, `status: 'active'`.
  - Redirect to the new community's detail page.
- Edit any field → Save.
- **Expect**: row updates; no duplicate rows.
- ✅ **Previously verified**: round 2 MC feedback.

## 4. Document library (`/dashboard/communities/[id]/documents`)

This is where most of the new document-handling code lives. Re-run in full after any change.

### 4a. Upload

- Click **Upload document**.
- Pick a PDF (CC&Rs or similar). The uploader accepts PDF and DOCX.
- **Expect** within ~60 seconds:
  - `community_documents` row appears with `ocr_status: 'pending'` → `'processing'` → `'complete'`.
  - `document_category` auto-classified via Claude Opus against the canonical taxonomy (e.g. "Declaration and amendments", "Bylaws and amendments", "Certificate of insurance"). If the classifier is uncertain, it returns "Other".
  - `storage_path_pdf`, `storage_path_txt`, and `storage_path_json` all populated in `community_documents`.
  - Function logs: `[OCR]` extraction complete + `[OCR] Merge-tag resolution: N resolved, M cached, K unmapped`.
  - `community_field_cache` rows appear for community-level keys with `source: 'ocr'` and confidence ≥ 0.7.
- Re-run the **Refresh this community** action in `/god-mode/Merge Tag Data` tab (see `docs/god-mode-ai-tools-smoke-test.md` § 2c) to confirm the refresh path also populates without clobbering manuals.

### 4b. Manual category override

- On any document row, click the category pill → pick a different category.
- **Expect**:
  - `community_documents.document_category` updates.
  - Any future attachment lookup from the packager honors the new category (via `lib/document-categories.ts` aliases).

### 4c. Archive

- Click the archive action on a document row.
- **Expect**:
  - `community_documents.archived = true`.
  - Doc disappears from the main list (unless toggled to show archived).
  - Archived docs are **excluded** from the 3P attachment packager.

### 4d. Preview / download original

- Click the file name or preview action.
- **Expect**: signed URL opens the raw PDF in a new tab (30-min expiry, private bucket).

### 4e. Canonical vs legacy categories

- If the community has older uploads tagged with legacy categories (e.g. "CC&Rs / Declaration", "Bylaws", "Insurance Certificate"), those rows still match the new WA resale template's `attachments.categories` (e.g. "Declaration and amendments", "Bylaws and amendments", "Certificate of insurance") via the alias layer in `lib/document-categories.ts`.
- To verify: generate a resale certificate PDF for a community that has both legacy-tagged and canonical-tagged documents — both should appear in the attachment bundle TOC. See `docs/document-template-smoke-test.md` § 5 for the attachment assertion.

## Regression hot-spots

- After any change to the OCR classifier prompt in `lib/ocr-pipeline.ts`, re-upload one document per canonical category and confirm the classifier returns the verbatim canonical string.
- After any change to `lib/document-categories.ts`, re-run the attachment bundle on an order that pulls from a community with legacy-tagged rows to confirm aliases resolve.
- After any change to the merge-tag resolver in `lib/resolve-merge-tags.ts`, re-upload a document where `field_value` is already manual in `community_field_cache` and verify the manual row is preserved (the refresh path in God Mode tests this explicitly).

## What to watch in function logs

| Log prefix | Source |
|---|---|
| `[OCR]` | `lib/ocr-pipeline.ts` — classification + extraction |
| `[OCR] Merge-tag resolution` | Post-OCR resolver |
| `[attachments]` | `lib/pdf-packager.ts` — attachment pick-per-category |
