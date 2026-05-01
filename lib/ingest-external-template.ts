/**
 * Third-party template ingestion.
 *
 * When a lender, title company, or other requester supplies their own form
 * (e.g. a specific lender questionnaire PDF), this module hands the OCR'd
 * form text to Claude Opus and asks it to map each form field to Havn's
 * merge-tag registry.
 *
 * The output is a mapping file that enables Havn to auto-fill the external
 * form with community data. Unmapped fields are flagged for manual review.
 */

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
} from "@/lib/document-templates/field-registry";

/* ── Schema ──────────────────────────────────────────────────────────── */

// Loose schema — the LLM fills in whatever shape it produces, we coerce
// into the stricter public shape in `ingestExternalTemplate`.
const RawMappedField = z.object({
  externalLabel: z.string(),
  registryKey: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  fieldKind: z.string().optional(),
});

const RawIngestionSchema = z.object({
  formTitle: z.string().nullable().optional(),
  issuer: z.string().nullable().optional(),
  fields: z.array(RawMappedField),
  unmappedCount: z.number().optional(),
  mappedCount: z.number().optional(),
});

const VALID_FIELD_KINDS = [
  "text",
  "checkbox",
  "signature",
  "date",
  "currency",
  "textarea",
  "unknown",
] as const;

export type ExternalTemplateIngestion = {
  formTitle: string | null;
  issuer: string | null;
  fields: Array<{
    externalLabel: string;
    registryKey: string | null;
    confidence: number | null;
    reasoning: string | null;
    fieldKind: (typeof VALID_FIELD_KINDS)[number];
  }>;
  mappedCount: number;
  unmappedCount: number;
};

/* ── Prompt ──────────────────────────────────────────────────────────── */

function buildRegistryList(): string {
  const entries = Object.values(FIELD_REGISTRY) as FieldRegistryEntry[];
  return entries
    .map((e) => `  ${e.key} — ${e.label} (${e.type})${e.sources.length ? ` · sources: ${e.sources.join(",")}` : ""}`)
    .join("\n");
}

function buildPrompt(formText: string): string {
  return `You are mapping an external HOA/COA document form to Havn's canonical merge-tag registry.

The text below was extracted from the form (labels, questions, blank lines, checkboxes). Read every field and map it to the best registry key when one exists.

Form text:
\`\`\`
${formText.slice(0, 60000)}
\`\`\`

Rules:
1. Walk the form field-by-field. For each detected field, output one entry in \`fields\`.
2. \`registryKey\` must be an exact key from the registry listed below, or null if nothing fits.
3. Do NOT invent registry keys. When there's no good match, set \`registryKey: null\` and explain why in \`reasoning\`.
4. \`confidence\` should be 1.0 for a verbatim match, ~0.8 for a paraphrased match, lower when the label is ambiguous. null when unmapped.
5. Set \`fieldKind\` based on the widget type (e.g. a "☐ Yes / ☐ No" row is "checkbox"; a signature line is "signature"; a dollar amount is "currency").
6. Count \`mappedCount\` and \`unmappedCount\` accurately — they must sum to \`fields.length\`.
7. If the form has a clear title or issuer name visible, extract it.

Havn field registry:
${buildRegistryList()}

Return structured data only.`;
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Map an external form's fields to the Havn registry.
 *
 * Pass the OCR-extracted raw text from the external form. The returned
 * mapping can be stored (e.g. in a future `external_template_mappings`
 * table) and re-used to auto-fill any future copy of the same form.
 */
export async function ingestExternalTemplate(
  formText: string
): Promise<ExternalTemplateIngestion> {
  if (!formText || formText.trim().length === 0) {
    return {
      formTitle: null,
      issuer: null,
      fields: [],
      mappedCount: 0,
      unmappedCount: 0,
    };
  }

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawIngestionSchema }),
    system:
      "You are a meticulous form-mapping assistant. You respond only with structured data matching the provided schema. Never invent registry keys. Prefer null registryKey to guessing. fieldKind must be one of: text, checkbox, signature, date, currency, textarea, unknown.",
    prompt: buildPrompt(formText),
  });

  if (!output) {
    throw new Error("Failed to ingest external template.");
  }

  const sanitized: ExternalTemplateIngestion["fields"] = output.fields.map((f) => {
    const key = f.registryKey && f.registryKey in FIELD_REGISTRY ? f.registryKey : null;
    const conf = typeof f.confidence === "number"
      ? Math.max(0, Math.min(1, f.confidence))
      : null;
    const kind = (VALID_FIELD_KINDS as readonly string[]).includes(f.fieldKind ?? "")
      ? (f.fieldKind as ExternalTemplateIngestion["fields"][number]["fieldKind"])
      : ("unknown" as const);
    const rejectionNote =
      f.registryKey && key === null
        ? `(rejected: "${f.registryKey}" is not a Havn registry key)`
        : "";
    return {
      externalLabel: f.externalLabel,
      registryKey: key,
      confidence: key == null ? null : conf,
      reasoning: [f.reasoning ?? "", rejectionNote].filter(Boolean).join(" ") || null,
      fieldKind: kind,
    };
  });

  const mapped = sanitized.filter((f) => f.registryKey != null).length;
  return {
    formTitle: output.formTitle ?? null,
    issuer: output.issuer ?? null,
    fields: sanitized,
    mappedCount: mapped,
    unmappedCount: sanitized.length - mapped,
  };
}
