/**
 * Template validator — catches template misconfigurations early.
 *
 * Runs in two modes:
 *   - Build-time (CI / scripted): walk every registered template and report
 *     structural errors against the field registry.
 *   - Runtime (pre-generation): verify a single template + resolved values
 *     are complete enough to safely produce a PDF.
 */

import type {
  DocumentTemplate,
  FieldDef,
} from "@/lib/document-templates/types";
import {
  FIELD_REGISTRY,
  getFieldRegistryEntry,
  type FieldRegistryEntry,
} from "@/lib/document-templates/field-registry";

export type ValidationIssue = {
  severity: "error" | "warning";
  templateKey: string;
  state?: string;
  field?: string;
  message: string;
};

export type ValidationReport = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

const MERGE_TAG_RE = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function identifier(template: DocumentTemplate): Pick<ValidationIssue, "templateKey" | "state"> {
  return { templateKey: template.key, state: template.state };
}

function expectedMergeTag(field: FieldDef): string {
  return field.mergeTag ?? `{{${field.key}}}`;
}

function collectMergeTagsFromText(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(MERGE_TAG_RE)) {
    tags.push(match[1]);
  }
  return tags;
}

/**
 * Validate the structural integrity of a single template against the
 * field registry. Use at build time.
 */
export function validateTemplate(template: DocumentTemplate): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const id = identifier(template);

  const fieldKeys = new Set<string>();

  // Field-level checks
  for (const field of template.fields) {
    if (fieldKeys.has(field.key)) {
      errors.push({
        ...id,
        severity: "error",
        field: field.key,
        message: `Duplicate field key \`${field.key}\` in template`,
      });
    }
    fieldKeys.add(field.key);

    const entry = getFieldRegistryEntry(field.key);
    if (!entry) {
      errors.push({
        ...id,
        severity: "error",
        field: field.key,
        message: `Field \`${field.key}\` is not registered in FIELD_REGISTRY`,
      });
      continue;
    }

    // Merge tag drift: if the template pins a mergeTag, it must match the registry.
    if (field.mergeTag && field.mergeTag !== entry.mergeTag) {
      errors.push({
        ...id,
        severity: "error",
        field: field.key,
        message: `Merge tag \`${field.mergeTag}\` does not match registry entry \`${entry.mergeTag}\``,
      });
    }

    // Required fields must have at least one data source.
    if (field.required && entry.sources.length === 0) {
      errors.push({
        ...id,
        severity: "error",
        field: field.key,
        message: `Required field \`${field.key}\` has no data source configured in the registry`,
      });
    }

    // OCR key mismatches
    if (field.ocrFieldKey && entry.ocrFieldKey && field.ocrFieldKey !== entry.ocrFieldKey) {
      warnings.push({
        ...id,
        severity: "warning",
        field: field.key,
        message: `ocrFieldKey \`${field.ocrFieldKey}\` differs from registry \`${entry.ocrFieldKey}\``,
      });
    }

    // Section must be declared in sections[]
    if (!template.sections.includes(field.section)) {
      errors.push({
        ...id,
        severity: "error",
        field: field.key,
        message: `Field \`${field.key}\` references section \`${field.section}\` that is not listed in template.sections`,
      });
    }
  }

  // Section-level checks
  const sectionCounts = new Map<string, number>();
  for (const section of template.sections) {
    sectionCounts.set(section, 0);
  }
  for (const field of template.fields) {
    if (sectionCounts.has(field.section)) {
      sectionCounts.set(field.section, (sectionCounts.get(field.section) ?? 0) + 1);
    }
  }
  for (const [section, count] of sectionCounts) {
    if (count === 0) {
      warnings.push({
        ...id,
        severity: "warning",
        message: `Section \`${section}\` has no fields`,
      });
    }
  }

  // Section condition references must point to known fields
  if (template.sectionConfig) {
    for (const [sectionName, config] of Object.entries(template.sectionConfig)) {
      if (!template.sections.includes(sectionName)) {
        warnings.push({
          ...id,
          severity: "warning",
          message: `sectionConfig includes \`${sectionName}\` but it is not listed in template.sections`,
        });
      }
      if (config.condition && typeof config.condition === "object") {
        if (!getFieldRegistryEntry(config.condition.field)) {
          errors.push({
            ...id,
            severity: "error",
            message: `Section \`${sectionName}\` condition references unknown field \`${config.condition.field}\``,
          });
        }
      }
    }
  }

  // Cover letter merge tags must resolve to registry entries.
  if (template.coverLetter?.enabled) {
    for (const tag of collectMergeTagsFromText(template.coverLetter.template)) {
      if (!getFieldRegistryEntry(tag)) {
        errors.push({
          ...id,
          severity: "error",
          message: `Cover letter references unknown merge tag \`{{${tag}}}\``,
        });
      }
    }
  }

  // Legal language merge tags must resolve.
  if (template.legalLanguage) {
    const texts: string[] = [
      template.legalLanguage.certificationText,
      template.legalLanguage.disclaimerText,
      ...(template.legalLanguage.requiredDisclosures ?? []),
    ];
    for (const text of texts) {
      for (const tag of collectMergeTagsFromText(text)) {
        if (!getFieldRegistryEntry(tag)) {
          errors.push({
            ...id,
            severity: "error",
            message: `Legal language references unknown merge tag \`{{${tag}}}\``,
          });
        }
      }
    }
  }

  // State-specific templates must carry legal language + expiration.
  if (template.state) {
    if (!template.legalLanguage) {
      errors.push({
        ...id,
        severity: "error",
        message: `State-specific template must define legalLanguage`,
      });
    }
    if (template.expirationDays == null) {
      errors.push({
        ...id,
        severity: "error",
        message: `State-specific template must define expirationDays`,
      });
    }
  } else {
    // Generic templates: expirationDays is recommended but not required yet.
    if (template.expirationDays == null) {
      warnings.push({
        ...id,
        severity: "warning",
        message: `Generic template is missing expirationDays`,
      });
    }
  }

  // Attachments, if enabled, need at least one category.
  if (template.attachments?.enabled && template.attachments.categories.length === 0) {
    errors.push({
      ...id,
      severity: "error",
      message: `Attachments are enabled but no categories are configured`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/** Validate a list of templates and merge results. */
export function validateTemplates(templates: DocumentTemplate[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  for (const template of templates) {
    const result = validateTemplate(template);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Runtime check: given a template and a map of resolved merge tag values,
 * determine whether PDF generation can proceed safely.
 *
 * Returns issues describing any required fields that are missing / empty.
 */
export function validateTemplateRuntime(
  template: DocumentTemplate,
  resolvedValues: Record<string, unknown>,
  opts: { signatureProvided?: boolean } = {}
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const id = identifier(template);

  for (const field of template.fields) {
    if (!field.required) continue;
    const raw = resolvedValues[field.key];
    if (raw == null || raw === "" || (typeof raw === "string" && raw.trim() === "")) {
      errors.push({
        ...id,
        severity: "error",
        field: field.key,
        message: `Required field \`${field.key}\` is missing a value`,
      });
    }
  }

  if (template.requiresSignature && !opts.signatureProvided) {
    errors.push({
      ...id,
      severity: "error",
      message: `Template requires a signature before generation`,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Utility: list every registry entry not referenced by any template in the
 * provided set. Useful for God Mode health checks to surface unused tags.
 */
export function findUnusedRegistryEntries(
  templates: DocumentTemplate[]
): FieldRegistryEntry[] {
  const used = new Set<string>();
  for (const t of templates) {
    for (const f of t.fields) used.add(f.key);
  }
  return Object.values(FIELD_REGISTRY).filter((e) => !used.has(e.key));
}

/** Escape hatch exposed for unit tests. */
export const _internal = { expectedMergeTag, collectMergeTagsFromText };
