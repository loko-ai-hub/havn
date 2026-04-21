import type { DocumentTemplate } from "./types";
import { RESALE_CERTIFICATE } from "./resale-certificate";
import { LENDER_QUESTIONNAIRE } from "./lender-questionnaire";

export type { DocumentTemplate, FieldDef, FieldType } from "./types";

const TEMPLATES: Record<string, DocumentTemplate> = {
  resale_certificate: RESALE_CERTIFICATE,
  lender_questionnaire: LENDER_QUESTIONNAIRE,
};

export function getTemplate(masterTypeKey: string): DocumentTemplate | null {
  return TEMPLATES[masterTypeKey] ?? null;
}

export function getAllTemplateKeys(): string[] {
  return Object.keys(TEMPLATES);
}
