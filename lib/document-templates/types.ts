export type FieldType = "text" | "currency" | "date" | "textarea" | "boolean";

export type FieldDef = {
  key: string;
  label: string;
  section: string;
  type: FieldType;
  required: boolean;
  /** true = same for all units in a community, cached across orders */
  communityLevel: boolean;
  /** Maps to the key in OCR-extracted JSON */
  ocrFieldKey?: string;
  /** Pre-rendered merge tag, e.g. `{{association_name}}`. If omitted, derived from `key`. */
  mergeTag?: string;
  /** Inline help text surfaced in the review UI and God Mode template viewer. */
  helpText?: string;
};

/**
 * Condition for a template section. `"always"` = render even when empty
 * (optionally with `emptyText`). Object form = render only when a
 * referenced field's value equals the given value.
 */
export type SectionCondition =
  | "always"
  | { field: string; equals: string | number | boolean };

/**
 * Per-section rendering metadata. Looked up by section name. Sections
 * without an entry default to `condition: "always"` and `emptyText: "None"`.
 */
export type SectionConfig = {
  condition?: SectionCondition;
  /** What to render in place of field rows when the section has no data. */
  emptyText?: string;
};

export type CoverLetterConfig = {
  enabled: boolean;
  /** Letter body — supports merge tags. Rendered on page 1 of the PDF. */
  template: string;
};

export type LegalLanguage = {
  /** Certification sentence signed by the preparing party. */
  certificationText: string;
  /** Disclaimer — supports merge tags. */
  disclaimerText: string;
  /** Statute the document is issued under, e.g. "RCW 64.90.640". */
  statuteReference: string;
  /** Verbatim statutory disclosures (mandatory wording, in order). */
  requiredDisclosures?: string[];
};

export type AttachmentsConfig = {
  enabled: boolean;
  /** Ordered list of community document categories to bundle after the main PDF. */
  categories: string[];
  /** Ordering strategy. `"as_listed"` = exactly the order above. */
  order: "as_listed";
};

export type DocumentTemplate = {
  /** Stable identifier for this template (e.g. `resale_certificate`). */
  key: string;
  title: string;
  /** Two-letter state code for state-specific templates. Omitted for generic fallbacks. */
  state?: string;
  /** Havn `master_type_key` for the document this template produces. */
  documentType?: string;
  /** Statutory reference displayed below the state header on page 2. */
  statute?: string;
  /** Ordered list of section names. Render order comes from this array. */
  sections: string[];
  /** Optional per-section rendering config, keyed by section name. */
  sectionConfig?: Record<string, SectionConfig>;
  fields: FieldDef[];
  coverLetter?: CoverLetterConfig;
  legalLanguage?: LegalLanguage;
  /** Short fallback disclaimer used when `legalLanguage.disclaimerText` is absent. */
  disclaimer?: string;
  /** Number of days the issued document is valid. Required for Phase 2+ templates. */
  expirationDays?: number;
  /** Whether an authorized signer must sign before the PDF can be generated. */
  requiresSignature?: boolean;
  attachments?: AttachmentsConfig;
  /**
   * ISO date (YYYY-MM-DD) the template was last materially updated. Displayed
   * in the Havn Templates viewer so staff know how fresh the legal content is.
   */
  lastUpdated?: string;
};
