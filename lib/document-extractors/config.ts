// Lightweight per-master_type_key config that biases the universal Claude
// extractor + match-resolver. New doc types ship as a small entry here; we
// don't write a bespoke pipeline per type.
//
// Each entry says:
//  - which merge-tag keys this doc type is *known* to ask for, so Claude
//    has a tighter target list when mapping form-field labels;
//  - synonyms for the three context entities (association, property, owner)
//    that may appear under non-standard labels in this doc type
//    (e.g. Ticor's "Brief Legal" line carries the association name).
//
// Anything missing falls back to a sensible default config that lets the
// extractor run unbiased.

export type DocTypeExtractorConfig = {
  /** master_type_key this config applies to */
  masterTypeKey: string;
  /** Registry keys typically present on this doc type — biases the prompt. */
  expectedRegistryKeys: string[];
  /** Labels in the doc that, when seen, should be treated as the named context entity. */
  contextSynonyms: {
    associationName: string[];
    propertyAddress: string[];
    ownerNames: string[];
    parcel: string[];
  };
};

const DEFAULT_CONTEXT_SYNONYMS = {
  associationName: [
    "association",
    "hoa",
    "homeowners association",
    "condo",
    "condominium",
    "community",
    "legal",
    "brief legal",
  ],
  propertyAddress: ["property", "property address", "subject property", "address", "site"],
  ownerNames: ["owner", "homeowner", "seller", "borrower", "buyer of record", "name"],
  parcel: ["apn", "parcel", "tax parcel", "tax id", "parcel id", "parcel number"],
};

const DEMAND_LETTER_CONFIG: DocTypeExtractorConfig = {
  masterTypeKey: "demand_letter",
  expectedRegistryKeys: [
    "assessment",
    "assessment_frequency",
    "fiscal_year_start",
    "fiscal_year_end",
    "transfer_fee",
    "transfer_fee_paid_by",
    "maintenance_reserve_fee_new_buyer",
    "insurance_company",
    "insurance_agent_name",
    "insurance_agent_company",
    "insurance_agent_address",
    "insurance_agent_phone",
    "special_assessments",
    "first_right_of_refusal",
    "first_right_of_refusal_exercised",
    "additional_associations_apply",
    "road_maintenance_apply",
    "account_paid_through",
    "account_balance_owed",
    "management_company",
    "management_contact_name",
    "management_contact_phone",
    "management_contact_email",
    "mailing_address",
  ],
  contextSynonyms: {
    ...DEFAULT_CONTEXT_SYNONYMS,
    // Title-company HOA-request forms (Ticor, etc.) often use these labels.
    associationName: [
      ...DEFAULT_CONTEXT_SYNONYMS.associationName,
      "brief legal",
      "subdivision",
    ],
    propertyAddress: [...DEFAULT_CONTEXT_SYNONYMS.propertyAddress],
    ownerNames: [...DEFAULT_CONTEXT_SYNONYMS.ownerNames, "current owner"],
  },
};

const LENDER_QUESTIONNAIRE_CONFIG: DocTypeExtractorConfig = {
  masterTypeKey: "lender_questionnaire",
  expectedRegistryKeys: [
    "association_name",
    "association_type",
    "total_units",
    "assessment",
    "fiscal_year_end",
    "reserve_fund_balance",
    "insurance_company",
    "insurance_policy_number",
    "insurance_expiry",
    "insurance_liability_amount",
    "fha_va_approved",
    "management_company",
    "management_contact_name",
    "management_contact_email",
    "management_contact_phone",
    "rental_restrictions",
    "pet_restrictions",
  ],
  contextSynonyms: DEFAULT_CONTEXT_SYNONYMS,
};

const RESALE_CERTIFICATE_CONFIG: DocTypeExtractorConfig = {
  masterTypeKey: "resale_certificate",
  expectedRegistryKeys: [
    "association_name",
    "assessment",
    "transfer_fee",
    "special_assessments",
    "insurance_company",
    "reserve_fund_balance",
    "first_right_of_refusal",
    "rental_restrictions",
    "pet_restrictions",
    "parking_restrictions",
  ],
  contextSynonyms: DEFAULT_CONTEXT_SYNONYMS,
};

const ESTOPPEL_LETTER_CONFIG: DocTypeExtractorConfig = {
  masterTypeKey: "estoppel_letter",
  expectedRegistryKeys: [
    "assessment",
    "transfer_fee",
    "special_assessments",
    "account_paid_through",
    "account_balance_owed",
    "management_company",
    "management_contact_name",
    "management_contact_email",
  ],
  contextSynonyms: DEFAULT_CONTEXT_SYNONYMS,
};

const CONFIGS: Record<string, DocTypeExtractorConfig> = {
  demand_letter: DEMAND_LETTER_CONFIG,
  lender_questionnaire: LENDER_QUESTIONNAIRE_CONFIG,
  resale_certificate: RESALE_CERTIFICATE_CONFIG,
  estoppel_letter: ESTOPPEL_LETTER_CONFIG,
};

const DEFAULT_CONFIG: DocTypeExtractorConfig = {
  masterTypeKey: "_default",
  expectedRegistryKeys: [],
  contextSynonyms: DEFAULT_CONTEXT_SYNONYMS,
};

export function getExtractorConfig(masterTypeKey: string | null | undefined): DocTypeExtractorConfig {
  if (!masterTypeKey) return DEFAULT_CONFIG;
  return CONFIGS[masterTypeKey] ?? DEFAULT_CONFIG;
}
