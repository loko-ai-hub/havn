import type { FieldType } from "./types";

/**
 * Where a merge-tag value can be sourced from.
 * - `ocr`:    extracted from uploaded governing/financial documents
 * - `cache`:  resolved from `community_field_cache` (prior OCR or manual entry)
 * - `manual`: entered by staff during order review
 * - `order`:  carried from the inbound order itself (property, requester, etc.)
 */
export type FieldSource = "ocr" | "cache" | "manual" | "order";

export type FieldRegistryEntry = {
  /** Stable field key — must match the merge tag content (e.g. `monthly_assessment` → `{{monthly_assessment}}`). */
  key: string;
  /** Pre-rendered merge tag, e.g. `{{association_name}}`. */
  mergeTag: string;
  /** Default human-facing label. */
  label: string;
  /** How the value is formatted + validated. */
  type: FieldType;
  /** Where this field's value can come from (one or more). Empty = internal/derived. */
  sources: FieldSource[];
  /** Key used when reading OCR-extracted JSON. Only meaningful if `sources` includes `ocr`. */
  ocrFieldKey?: string;
  /** Plain-English explanation used by Claude resolution + God Mode viewer. */
  description: string;
  /**
   * Per-state label overrides (two-letter state abbreviation → label).
   * Rendering code should prefer `stateLabels[state]` when present,
   * falling back to `label`.
   */
  stateLabels?: Record<string, string>;
  /**
   * true  = value is consistent across units in a community (cacheable across orders).
   * false = unit/order-specific; must be collected or verified per order.
   */
  communityLevel: boolean;
};

/**
 * Central registry of every merge tag available across Havn templates.
 *
 * Rules:
 * - Adding a merge tag to a template requires adding it here first.
 * - `key` MUST equal the object property name; `mergeTag` MUST equal `{{key}}`.
 * - `sources` should be the minimum needed — don't list sources that aren't wired up.
 */
export const FIELD_REGISTRY = {
  // ── Association Information ───────────────────────────────────────────
  association_name: {
    key: "association_name",
    mergeTag: "{{association_name}}",
    label: "Association Name",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "association_name",
    description: "Legal name of the HOA/COA from governing documents.",
    communityLevel: true,
  },
  association_type: {
    key: "association_type",
    mergeTag: "{{association_type}}",
    label: "Association Type",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "association_type",
    description: "Whether the association is an HOA or COA (condominium).",
    communityLevel: true,
  },
  state: {
    key: "state",
    mergeTag: "{{state}}",
    label: "State",
    type: "text",
    sources: ["cache", "manual", "order"],
    description: "Two-letter state abbreviation where the property sits.",
    communityLevel: true,
  },
  county: {
    key: "county",
    mergeTag: "{{county}}",
    label: "County",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "county",
    description: "County in which the association is located.",
    communityLevel: true,
  },
  total_units: {
    key: "total_units",
    mergeTag: "{{total_units}}",
    label: "Total Units",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "total_units",
    description: "Total number of units in the association.",
    communityLevel: true,
  },
  tax_id: {
    key: "tax_id",
    mergeTag: "{{tax_id}}",
    label: "Tax ID / EIN",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "tax_id",
    description: "Federal Employer Identification Number for the association.",
    communityLevel: true,
  },
  fiscal_year_end: {
    key: "fiscal_year_end",
    mergeTag: "{{fiscal_year_end}}",
    label: "Fiscal Year End",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "fiscal_year_end",
    description: "Month and day the association's fiscal year ends (e.g. December 31).",
    communityLevel: true,
  },
  mailing_address: {
    key: "mailing_address",
    mergeTag: "{{mailing_address}}",
    label: "Mailing Address",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "mailing_address",
    description: "Primary mailing address for association correspondence.",
    communityLevel: true,
  },
  website: {
    key: "website",
    mergeTag: "{{website}}",
    label: "Website",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "website",
    description: "Association's public website, if any.",
    communityLevel: true,
  },

  // ── Management & Governance ───────────────────────────────────────────
  management_company: {
    key: "management_company",
    mergeTag: "{{management_company}}",
    label: "Management Company",
    type: "text",
    sources: ["cache", "manual"],
    description: "Name of the company managing the association (or the self-managed association name).",
    communityLevel: true,
  },
  management_contact_name: {
    key: "management_contact_name",
    mergeTag: "{{management_contact_name}}",
    label: "Manager Contact Name",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "management_contact_name",
    description: "Primary point of contact at the management company.",
    communityLevel: true,
  },
  management_contact_email: {
    key: "management_contact_email",
    mergeTag: "{{management_contact_email}}",
    label: "Manager Email",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "management_contact_email",
    description: "Email for the primary management contact.",
    communityLevel: true,
  },
  management_contact_phone: {
    key: "management_contact_phone",
    mergeTag: "{{management_contact_phone}}",
    label: "Manager Phone",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "management_contact_phone",
    description: "Phone number for the primary management contact.",
    communityLevel: true,
  },

  // ── Financial Information ─────────────────────────────────────────────
  monthly_assessment: {
    key: "monthly_assessment",
    mergeTag: "{{monthly_assessment}}",
    label: "Monthly Assessment",
    type: "currency",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "monthly_assessment",
    description: "Regular monthly assessment amount for the subject unit.",
    stateLabels: {
      NY: "Common Charges",
      FL: "Maintenance Fee",
      CA: "Regular Assessment",
    },
    communityLevel: false,
  },
  special_assessments: {
    key: "special_assessments",
    mergeTag: "{{special_assessments}}",
    label: "Special Assessments",
    type: "textarea",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "special_assessments",
    description: "Any pending or active special assessments levied by the association.",
    communityLevel: true,
  },
  reserve_fund_balance: {
    key: "reserve_fund_balance",
    mergeTag: "{{reserve_fund_balance}}",
    label: "Reserve Fund Balance",
    type: "currency",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "reserve_fund_balance",
    description: "Current balance of the association's reserve fund.",
    communityLevel: true,
  },
  outstanding_liens: {
    key: "outstanding_liens",
    mergeTag: "{{outstanding_liens}}",
    label: "Outstanding Liens on Unit",
    type: "textarea",
    sources: ["manual"],
    description: "Any outstanding liens recorded against the subject unit.",
    communityLevel: false,
  },
  pending_litigation: {
    key: "pending_litigation",
    mergeTag: "{{pending_litigation}}",
    label: "Pending Litigation",
    type: "textarea",
    sources: ["cache", "manual"],
    description: "Pending litigation involving the association, if any.",
    communityLevel: true,
  },
  delinquency_rate: {
    key: "delinquency_rate",
    mergeTag: "{{delinquency_rate}}",
    label: "Delinquency Rate",
    type: "text",
    sources: ["manual"],
    description: "Percentage of units more than 60 days delinquent on assessments.",
    communityLevel: true,
  },
  budget_deficit: {
    key: "budget_deficit",
    mergeTag: "{{budget_deficit}}",
    label: "Operating at a Deficit",
    type: "boolean",
    sources: ["cache", "manual"],
    description: "Whether the association's operating budget is currently in deficit.",
    communityLevel: true,
  },

  // ── Insurance ─────────────────────────────────────────────────────────
  insurance_company: {
    key: "insurance_company",
    mergeTag: "{{insurance_company}}",
    label: "Insurance Company",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_company",
    description: "Carrier providing the association's master policy.",
    communityLevel: true,
  },
  insurance_policy_number: {
    key: "insurance_policy_number",
    mergeTag: "{{insurance_policy_number}}",
    label: "Policy Number",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_policy_number",
    description: "Master policy number.",
    communityLevel: true,
  },
  insurance_expiry: {
    key: "insurance_expiry",
    mergeTag: "{{insurance_expiry}}",
    label: "Policy Expiration",
    type: "date",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_expiry_date",
    description: "Expiration date of the master insurance policy.",
    communityLevel: true,
  },
  insurance_liability_amount: {
    key: "insurance_liability_amount",
    mergeTag: "{{insurance_liability_amount}}",
    label: "Liability Coverage Amount",
    type: "currency",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_liability_amount",
    description: "Liability coverage limit on the master policy.",
    communityLevel: true,
  },
  insurance_agent_name: {
    key: "insurance_agent_name",
    mergeTag: "{{insurance_agent_name}}",
    label: "Insurance Agent Name",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_agent_name",
    description: "Name of the broker / producer / agent listed on the COI as the contact (distinct from the underwriting carrier).",
    communityLevel: true,
  },
  insurance_agent_company: {
    key: "insurance_agent_company",
    mergeTag: "{{insurance_agent_company}}",
    label: "Insurance Agent Company",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_agent_company",
    description: "Brokerage or agency that placed the policy, distinct from the underwriting carrier.",
    communityLevel: true,
  },
  insurance_agent_email: {
    key: "insurance_agent_email",
    mergeTag: "{{insurance_agent_email}}",
    label: "Insurance Agent Email",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_agent_email",
    description: "Email for the insurance broker / agent contact.",
    communityLevel: true,
  },
  insurance_agent_phone: {
    key: "insurance_agent_phone",
    mergeTag: "{{insurance_agent_phone}}",
    label: "Insurance Agent Phone",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_agent_phone",
    description: "Phone number for the insurance broker / agent contact.",
    communityLevel: true,
  },
  insurance_agent_address: {
    key: "insurance_agent_address",
    mergeTag: "{{insurance_agent_address}}",
    label: "Insurance Agent Address",
    type: "text",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "insurance_agent_address",
    description: "Mailing address for the insurance broker / agent.",
    communityLevel: true,
  },
  fha_va_approved: {
    key: "fha_va_approved",
    mergeTag: "{{fha_va_approved}}",
    label: "FHA/VA Approved",
    type: "boolean",
    sources: ["cache", "manual"],
    description: "Whether the association holds current FHA and/or VA approval.",
    communityLevel: true,
  },
  fidelity_bond: {
    key: "fidelity_bond",
    mergeTag: "{{fidelity_bond}}",
    label: "Fidelity Bond / Crime Coverage",
    type: "boolean",
    sources: ["ocr", "cache", "manual"],
    description: "Whether the association carries a fidelity bond or crime coverage policy.",
    communityLevel: true,
  },

  // ── Restrictions & Rules ──────────────────────────────────────────────
  pet_restrictions: {
    key: "pet_restrictions",
    mergeTag: "{{pet_restrictions}}",
    label: "Pet Restrictions",
    type: "textarea",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "pet_restrictions",
    description: "Pet-related rules from governing documents.",
    communityLevel: true,
  },
  rental_restrictions: {
    key: "rental_restrictions",
    mergeTag: "{{rental_restrictions}}",
    label: "Rental Restrictions",
    type: "textarea",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "rental_restrictions",
    description: "Rental / leasing rules from governing documents.",
    communityLevel: true,
  },
  parking_restrictions: {
    key: "parking_restrictions",
    mergeTag: "{{parking_restrictions}}",
    label: "Parking Restrictions",
    type: "textarea",
    sources: ["ocr", "cache", "manual"],
    ocrFieldKey: "parking_restrictions",
    description: "Parking-related rules from governing documents.",
    communityLevel: true,
  },

  // ── Property & Requester (order-specific) ─────────────────────────────
  property_address: {
    key: "property_address",
    mergeTag: "{{property_address}}",
    label: "Property Address",
    type: "text",
    sources: ["order"],
    description: "Street address of the unit being sold or refinanced.",
    communityLevel: false,
  },
  unit_number: {
    key: "unit_number",
    mergeTag: "{{unit_number}}",
    label: "Unit Number",
    type: "text",
    sources: ["order"],
    description: "Unit or lot number, when applicable.",
    communityLevel: false,
  },
  requester_name: {
    key: "requester_name",
    mergeTag: "{{requester_name}}",
    label: "Requester Name",
    type: "text",
    sources: ["order"],
    description: "Full name of the party requesting the document.",
    communityLevel: false,
  },
  requester_email: {
    key: "requester_email",
    mergeTag: "{{requester_email}}",
    label: "Requester Email",
    type: "text",
    sources: ["order"],
    description: "Email of the requester for delivery and support.",
    communityLevel: false,
  },
  closing_date: {
    key: "closing_date",
    mergeTag: "{{closing_date}}",
    label: "Closing Date",
    type: "date",
    sources: ["order"],
    description: "Scheduled closing date for the transaction, if known.",
    communityLevel: false,
  },

  // ── Template-level / contextual tags ──────────────────────────────────
  statute: {
    key: "statute",
    mergeTag: "{{statute}}",
    label: "Statute",
    type: "text",
    sources: [],
    description: "Statutory reference the document is issued under (template-derived).",
    communityLevel: true,
  },
  expiration_days: {
    key: "expiration_days",
    mergeTag: "{{expiration_days}}",
    label: "Expiration (days)",
    type: "text",
    sources: [],
    description: "Number of days the issued document remains valid (template-derived).",
    communityLevel: true,
  },
  certificate_preparer_name: {
    key: "certificate_preparer_name",
    mergeTag: "{{certificate_preparer_name}}",
    label: "Certificate Preparer Name",
    type: "text",
    sources: ["manual"],
    description:
      "Name of the person executing the certificate. Auto-populated from the signature block at render time.",
    communityLevel: false,
  },
  certificate_issue_date: {
    key: "certificate_issue_date",
    mergeTag: "{{certificate_issue_date}}",
    label: "Certificate Issue Date",
    type: "date",
    sources: [],
    description:
      "Date the certificate was issued. Auto-populated from the signature timestamp (or generation timestamp) at render time.",
    communityLevel: false,
  },
  signer_title: {
    key: "signer_title",
    mergeTag: "{{signer_title}}",
    label: "Signer Title",
    type: "text",
    sources: ["manual"],
    description:
      "Title of the person signing the certificate (e.g. Community Manager, Board President). Auto-populated from the signature block at render time.",
    communityLevel: false,
  },
  seller_name: {
    key: "seller_name",
    mergeTag: "{{seller_name}}",
    label: "Seller(s)",
    type: "text",
    sources: ["manual"],
    description:
      "Name(s) of the current unit owner(s) selling the property. Filled during order review.",
    communityLevel: false,
  },
  buyer_name: {
    key: "buyer_name",
    mergeTag: "{{buyer_name}}",
    label: "Buyer(s)",
    type: "text",
    sources: ["manual", "order"],
    description:
      "Name(s) of the party buying the unit. Defaults to the requester at render time when left empty.",
    communityLevel: false,
  },
} satisfies Record<string, FieldRegistryEntry>;

export type FieldRegistryKey = keyof typeof FIELD_REGISTRY;

/** Resolve the registry entry for a given field key, or null if unknown. */
export function getFieldRegistryEntry(
  key: string
): FieldRegistryEntry | null {
  return (FIELD_REGISTRY as Record<string, FieldRegistryEntry>)[key] ?? null;
}

/**
 * Resolve the display label for a field, honoring per-state overrides when
 * a two-letter state abbreviation is supplied.
 */
export function getFieldLabel(key: string, state?: string | null): string {
  const entry = getFieldRegistryEntry(key);
  if (!entry) return key;
  if (state && entry.stateLabels?.[state.toUpperCase()]) {
    return entry.stateLabels[state.toUpperCase()];
  }
  return entry.label;
}

/** All merge tags currently defined in the registry. */
export function getAllMergeTags(): string[] {
  return Object.values(FIELD_REGISTRY).map((e) => e.mergeTag);
}
