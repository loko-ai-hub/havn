import type { DocumentTemplate } from "./types";
import { RESALE_CERTIFICATE } from "./resale-certificate";
import { LENDER_QUESTIONNAIRE } from "./lender-questionnaire";
import { WA_RESALE_CERTIFICATE } from "./wa-resale-certificate";

export type {
  DocumentTemplate,
  FieldDef,
  FieldType,
  SectionCondition,
  SectionConfig,
  CoverLetterConfig,
  LegalLanguage,
  AttachmentsConfig,
} from "./types";

export {
  FIELD_REGISTRY,
  getFieldRegistryEntry,
  getFieldLabel,
  getAllMergeTags,
  getLifecycleTier,
} from "./field-registry";
export type { FieldRegistryEntry, FieldRegistryKey, FieldSource } from "./field-registry";
export type { LifecycleTier } from "./types";

/**
 * Generic templates — used when no state-specific override exists for a
 * given (state, documentType) pair.
 */
const GENERIC_TEMPLATES: Record<string, DocumentTemplate> = {
  resale_certificate: RESALE_CERTIFICATE,
  lender_questionnaire: LENDER_QUESTIONNAIRE,
};

/**
 * State-specific templates, keyed by `${STATE}:${documentType}`
 * (e.g. `WA:resale_certificate`). Populated at module load below.
 */
const STATE_TEMPLATES: Record<string, DocumentTemplate> = {};

function registerStateTemplate(template: DocumentTemplate): void {
  if (!template.state || !template.documentType) return;
  STATE_TEMPLATES[`${template.state.toUpperCase()}:${template.documentType}`] = template;
}

registerStateTemplate(WA_RESALE_CERTIFICATE);

/**
 * Resolve a template by document type and optional state, applying the
 * fallback chain: state-specific → generic → null.
 */
export function getTemplate(
  masterTypeKey: string,
  state?: string | null
): DocumentTemplate | null {
  if (state) {
    const stateKey = `${state.toUpperCase()}:${masterTypeKey}`;
    if (STATE_TEMPLATES[stateKey]) return STATE_TEMPLATES[stateKey];
  }
  return GENERIC_TEMPLATES[masterTypeKey] ?? null;
}

export function getAllTemplateKeys(): string[] {
  return Object.keys(GENERIC_TEMPLATES);
}

/** Internal registration hook for state templates to call on import. */
export const _internal = { registerStateTemplate };
