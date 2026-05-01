/**
 * Canonical document-category taxonomy.
 *
 * These names match the exact attachment categories declared by state
 * templates (e.g. the WA resale certificate) — they are the legally-accurate
 * labels that should appear in generated documents and should be what OCR
 * classifies into going forward.
 *
 * `LEGACY_TO_CANONICAL` aliases older category strings that may still be
 * stored on existing `community_documents` rows so the packager can find
 * them without a database migration.
 */

export const CANONICAL_CATEGORIES = [
  // Template-referenced categories (the "legal words")
  "Declaration and amendments",
  "Bylaws and amendments",
  "Rules and regulations",
  "Articles of incorporation",
  "Current operating budget",
  "Most recent balance sheet and income/expense statement",
  "Reserve study (most recent) – attachment supplements but does not substitute for the (1)(m) disclosure on the face of the certificate",
  "Certificate of insurance",
  "Meeting minutes (most recent annual and board)",
  "WUCIOA buyer notice (for RCW 64.90.640 communities)",

  // Extended categories — not referenced by any template's `attachments.categories`
  // today, but useful for OCR classification and community-doc management.
  "Site Plan / Map",
  "FHA/VA Certification",
  "Management Agreement",
  "Other",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

/**
 * Legacy → canonical mapping. Existing DB rows may be tagged with any of
 * these keys; the canonical value on the right is what they semantically
 * are. Used by the packager to resolve attachments without migrating rows.
 */
export const LEGACY_TO_CANONICAL: Record<string, CanonicalCategory> = {
  "CC&Rs / Declaration": "Declaration and amendments",
  "Declaration": "Declaration and amendments",
  "Amendments": "Declaration and amendments",
  "Bylaws": "Bylaws and amendments",
  "Rules & Regulations": "Rules and regulations",
  "Articles of Incorporation": "Articles of incorporation",
  "Budget": "Current operating budget",
  "Financial Reports": "Most recent balance sheet and income/expense statement",
  "Reserve Study":
    "Reserve study (most recent) – attachment supplements but does not substitute for the (1)(m) disclosure on the face of the certificate",
  "Insurance Certificate": "Certificate of insurance",
  "Meeting Minutes": "Meeting minutes (most recent annual and board)",
};

/**
 * Normalize any raw category string to its canonical form. Returns the
 * input unchanged when already canonical or when no alias exists (e.g.
 * preserves "Other", "Site Plan / Map").
 */
export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "Other";
  const trimmed = raw.trim();
  if (LEGACY_TO_CANONICAL[trimmed]) return LEGACY_TO_CANONICAL[trimmed];
  return trimmed;
}

/**
 * All DB strings that should match a given canonical category — the
 * canonical name itself plus every legacy alias that maps to it. Use this
 * to build `IN (…)` clauses when looking up stored documents.
 */
export function dbAliasesForCategory(canonical: string): string[] {
  const aliases = new Set<string>([canonical]);
  for (const [legacy, target] of Object.entries(LEGACY_TO_CANONICAL)) {
    if (target === canonical) aliases.add(legacy);
  }
  return [...aliases];
}

/**
 * Given a list of canonical categories (e.g. a template's `attachments.categories`),
 * return the flat list of every DB string that should match any of them.
 */
export function dbAliasesForCategories(categories: string[]): string[] {
  const out = new Set<string>();
  for (const c of categories) {
    for (const alias of dbAliasesForCategory(c)) out.add(alias);
  }
  return [...out];
}
