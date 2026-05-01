/**
 * AI-assisted state onboarding.
 *
 * When Havn enables a new state, this module asks Claude Opus to draft a
 * resale-certificate (or other document-type) template for that state: the
 * sections, the statutory fields, the legal language, and an expiration
 * window that match the state's actual law.
 *
 * Havn staff review the draft in God Mode and commit it to code via Claude
 * Code — the AI output is a starting point, not a live template.
 */

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
} from "@/lib/document-templates/field-registry";
import { US_STATES } from "@/lib/us-states";

/* ── Schema ──────────────────────────────────────────────────────────── */

// Loose schema: the AI SDK validates this verbatim against the LLM output,
// so every unnecessary constraint is a potential crash point. Optional +
// permissive here, then clamp / coerce below in `suggestStateTemplate`.
const SuggestedField = z.object({
  key: z.string(),
  section: z.string(),
  required: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const RawSuggestedTemplate = z.object({
  documentType: z.string(),
  title: z.string(),
  statute: z.string(),
  expirationDays: z.number(),
  requiresSignature: z.boolean(),
  sections: z.array(z.string()),
  fields: z.array(SuggestedField),
  certificationText: z.string(),
  disclaimerText: z.string(),
  requiredDisclosures: z.array(z.string()).optional().default([]),
  attachmentCategories: z.array(z.string()).optional().default([]),
  newFieldsToConsider: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.string(),
        rationale: z.string(),
      })
    )
    .optional()
    .default([])
    .describe("Fields that do NOT exist in the registry but the AI thinks the state requires."),
});

const VALID_DOC_TYPES = [
  "resale_certificate",
  "lender_questionnaire",
  "certificate_update",
  "demand_letter",
  "estoppel_letter",
  "governing_documents",
] as const;

const VALID_FIELD_TYPES = ["text", "currency", "date", "textarea", "boolean"] as const;

export type SuggestedStateTemplate = {
  documentType: (typeof VALID_DOC_TYPES)[number];
  title: string;
  statute: string;
  expirationDays: number;
  requiresSignature: boolean;
  sections: string[];
  fields: Array<{ key: string; section: string; required: boolean; notes: string | null }>;
  certificationText: string;
  disclaimerText: string;
  requiredDisclosures: string[];
  attachmentCategories: string[];
  newFieldsToConsider: Array<{
    key: string;
    label: string;
    type: (typeof VALID_FIELD_TYPES)[number];
    rationale: string;
  }>;
};

/* ── Prompt ──────────────────────────────────────────────────────────── */

function buildRegistryList(): string {
  const entries = Object.values(FIELD_REGISTRY) as FieldRegistryEntry[];
  return entries.map((e) => `  ${e.key} — ${e.label} (${e.type})`).join("\n");
}

function buildPrompt(stateAbbr: string, stateName: string, documentType: string): string {
  return `You are a regulatory-compliance expert drafting a Havn document template for ${stateName} (${stateAbbr}).

Task: propose a ${documentType.replaceAll("_", " ")} template that meets ${stateName} statutory requirements.

Rules:
1. Reuse field keys from the existing Havn registry whenever a registry field covers the concept. Do not invent keys when a registry key fits.
2. When a concept is required by ${stateName} law but no registry field covers it, list the proposed new field under \`newFieldsToConsider\` (do NOT put it in \`fields\`). Havn engineers will review and add it to the registry before the template lands.
3. \`statute\` must be a specific statutory cite (e.g. "RCW 64.90.640", "Fla. Stat. § 720.3085", "Cal. Civ. Code § 4525").
4. \`expirationDays\` must reflect what the statute requires — do not make up a number.
5. \`certificationText\`, \`disclaimerText\`, and \`requiredDisclosures\` must be usable verbatim in the final document. Use merge tags like {{management_company}} or {{property_address}} where appropriate.
6. \`sections\` is the display order; every \`fields[i].section\` must appear in the \`sections\` array.
7. Only include \`fields\` whose registry key exists in the registry below.

Havn field registry (available keys):
${buildRegistryList()}

Return structured data only.`;
}

/* ── Public API ──────────────────────────────────────────────────────── */

export type SuggestStateTemplateParams = {
  state: string; // two-letter abbreviation
  documentType?:
    | "resale_certificate"
    | "lender_questionnaire"
    | "certificate_update"
    | "demand_letter"
    | "estoppel_letter"
    | "governing_documents";
};

/**
 * Ask Claude Opus to draft a state-specific template. Returns the raw
 * suggestion — the caller (God Mode) shows it to staff for review before
 * any code change happens.
 */
export async function suggestStateTemplate(
  params: SuggestStateTemplateParams
): Promise<SuggestedStateTemplate> {
  const stateAbbr = params.state.toUpperCase();
  const stateName =
    US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;
  const documentType = params.documentType ?? "resale_certificate";

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawSuggestedTemplate }),
    system:
      "You are an HOA/COA regulatory expert. Return structured data only. Cite specific statutes. When uncertain, say so in the notes fields rather than guessing. Use documentType values from this set only: resale_certificate, lender_questionnaire, certificate_update, demand_letter, estoppel_letter, governing_documents. Field types must be one of: text, currency, date, textarea, boolean.",
    prompt: buildPrompt(stateAbbr, stateName, documentType),
  });

  if (!output) {
    throw new Error(`Failed to generate template suggestion for ${stateAbbr}.`);
  }

  // Normalize: clamp expirationDays, coerce enums, filter unknown registry keys.
  const docType = (VALID_DOC_TYPES as readonly string[]).includes(output.documentType)
    ? (output.documentType as SuggestedStateTemplate["documentType"])
    : "resale_certificate";

  const expirationDays = Math.max(
    1,
    Math.min(365, Math.round(Number(output.expirationDays) || 30))
  );

  const filteredFields = output.fields
    .filter((f) => f.key in FIELD_REGISTRY)
    .map((f) => ({
      key: f.key,
      section: f.section,
      required: Boolean(f.required),
      notes: f.notes ?? null,
    }));

  const newFields = output.newFieldsToConsider.map((f) => ({
    key: f.key,
    label: f.label,
    type: (VALID_FIELD_TYPES as readonly string[]).includes(f.type)
      ? (f.type as SuggestedStateTemplate["newFieldsToConsider"][number]["type"])
      : ("text" as const),
    rationale: f.rationale,
  }));

  return {
    documentType: docType,
    title: output.title,
    statute: output.statute,
    expirationDays,
    requiresSignature: output.requiresSignature,
    sections: output.sections,
    fields: filteredFields,
    certificationText: output.certificationText,
    disclaimerText: output.disclaimerText,
    requiredDisclosures: output.requiredDisclosures ?? [],
    attachmentCategories: output.attachmentCategories ?? [],
    newFieldsToConsider: newFields,
  };
}

/* ── Legal review (agent 2) ──────────────────────────────────────────── */

const RawLegalFinding = z.object({
  section: z.string(),
  severity: z.string(),
  issue: z.string(),
  recommendation: z.string(),
  statuteReference: z.string().nullable().optional(),
});

const RawLegalReview = z.object({
  overallAssessment: z.string(),
  verdict: z.string(),
  findings: z.array(RawLegalFinding),
  complianceConcerns: z.array(z.string()).optional().default([]),
});

const VALID_SEVERITIES = ["critical", "warning", "suggestion"] as const;
const VALID_VERDICTS = ["approve", "approve-with-changes", "revise"] as const;

export type LegalFinding = {
  section: string;
  severity: (typeof VALID_SEVERITIES)[number];
  issue: string;
  recommendation: string;
  statuteReference: string | null;
};

export type LegalReview = {
  overallAssessment: string;
  verdict: (typeof VALID_VERDICTS)[number];
  findings: LegalFinding[];
  complianceConcerns: string[];
};

function buildReviewPrompt(
  draft: SuggestedStateTemplate,
  stateName: string,
  stateAbbr: string
): string {
  return `You are a senior attorney with deep expertise in HOA/COA law in ${stateName} (${stateAbbr}).

A Havn drafter has proposed the following template for a ${draft.documentType.replaceAll("_", " ")}. Your job: review it for legal accuracy, statutory compliance, and completeness. Be critical — it is far more helpful to call out a missing disclosure than to rubber-stamp the draft.

Look hard for:
- Incorrect or outdated statute citations (e.g. wrong RCW section, superseded citation)
- Missing statutorily-required disclosures for this document type in ${stateAbbr}
- Fields the statute requires but that are missing from \`fields\`
- Fields included that are not required and could expose the association to liability
- Certification / disclaimer / cover letter wording that does not match the statute's actual language
- Wrong expiration window relative to what the statute prescribes
- Missing notarization, witness, or signature requirements
- Missing attachments the statute requires

Draft to review:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

For each finding, pick severity:
- \`critical\` — the draft is legally non-compliant or could harm an association if shipped as-is
- \`warning\` — the draft is arguably legal but deviates from best practice or prevailing interpretation
- \`suggestion\` — optional polish or alternate wording

For \`verdict\`, pick exactly one of: \`approve\`, \`approve-with-changes\`, \`revise\`.

Return structured findings only.`;
}

function normalizeLegalReview(raw: z.infer<typeof RawLegalReview>): LegalReview {
  const verdict = (VALID_VERDICTS as readonly string[]).includes(raw.verdict)
    ? (raw.verdict as LegalReview["verdict"])
    : "approve-with-changes";

  return {
    overallAssessment: raw.overallAssessment,
    verdict,
    complianceConcerns: raw.complianceConcerns ?? [],
    findings: raw.findings.map((f) => ({
      section: f.section,
      severity: (VALID_SEVERITIES as readonly string[]).includes(f.severity)
        ? (f.severity as LegalFinding["severity"])
        : "suggestion",
      issue: f.issue,
      recommendation: f.recommendation,
      statuteReference: f.statuteReference ?? null,
    })),
  };
}

export async function reviewStateTemplate(params: {
  draft: SuggestedStateTemplate;
  state: string;
}): Promise<LegalReview> {
  const stateAbbr = params.state.toUpperCase();
  const stateName =
    US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawLegalReview }),
    system:
      "You are a rigorous legal reviewer. Respond only with structured data. Cite specific statutes. If the draft is correct, say so briefly — do not invent issues. Severity must be one of: critical, warning, suggestion. Verdict must be one of: approve, approve-with-changes, revise.",
    prompt: buildReviewPrompt(params.draft, stateName, stateAbbr),
  });

  if (!output) {
    throw new Error("Legal review produced no output.");
  }
  return normalizeLegalReview(output);
}

/* ── Revision (agent 3) ──────────────────────────────────────────────── */

function buildRevisionPrompt(
  draft: SuggestedStateTemplate,
  review: LegalReview,
  stateName: string,
  stateAbbr: string
): string {
  return `You are refining a Havn document template for ${stateName} (${stateAbbr}) after a legal review.

Your job: take the original draft and the reviewer's findings, and produce a revised template that resolves every \`critical\` finding and every \`warning\` finding. Treat \`suggestion\` findings as optional — apply only if they improve the document without adding noise.

Rules:
1. Preserve whatever the original got right. Do not rewrite the whole thing — apply targeted edits.
2. Use existing registry field keys when adding fields. If the reviewer asks for a field that is not in the registry, add it to \`newFieldsToConsider\` rather than inventing a registry key.
3. Update the statute citation, expiration window, certification text, disclaimer, and required disclosures if the review flagged them.
4. Keep the same schema as the original draft.
5. documentType must stay: ${draft.documentType}.

Original draft:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Legal review:
\`\`\`json
${JSON.stringify(review, null, 2)}
\`\`\`

Return the revised template using the same schema as the original draft.`;
}

export async function reviseStateTemplate(params: {
  draft: SuggestedStateTemplate;
  review: LegalReview;
  state: string;
}): Promise<SuggestedStateTemplate> {
  const stateAbbr = params.state.toUpperCase();
  const stateName =
    US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawSuggestedTemplate }),
    system:
      "You are revising a legal document template based on prior review. Respond only with structured data. Preserve the original schema. Keep documentType unchanged. Field types must be text, currency, date, textarea, or boolean.",
    prompt: buildRevisionPrompt(params.draft, params.review, stateName, stateAbbr),
  });

  if (!output) {
    throw new Error("Revision produced no output.");
  }

  // Normalize using the same coercion path as the initial draft.
  const docType = (VALID_DOC_TYPES as readonly string[]).includes(output.documentType)
    ? (output.documentType as SuggestedStateTemplate["documentType"])
    : params.draft.documentType;

  const expirationDays = Math.max(
    1,
    Math.min(365, Math.round(Number(output.expirationDays) || params.draft.expirationDays))
  );

  const filteredFields = output.fields
    .filter((f) => f.key in FIELD_REGISTRY)
    .map((f) => ({
      key: f.key,
      section: f.section,
      required: Boolean(f.required),
      notes: f.notes ?? null,
    }));

  const newFields = output.newFieldsToConsider.map((f) => ({
    key: f.key,
    label: f.label,
    type: (VALID_FIELD_TYPES as readonly string[]).includes(f.type)
      ? (f.type as SuggestedStateTemplate["newFieldsToConsider"][number]["type"])
      : ("text" as const),
    rationale: f.rationale,
  }));

  return {
    documentType: docType,
    title: output.title,
    statute: output.statute,
    expirationDays,
    requiresSignature: output.requiresSignature,
    sections: output.sections,
    fields: filteredFields,
    certificationText: output.certificationText,
    disclaimerText: output.disclaimerText,
    requiredDisclosures: output.requiredDisclosures ?? [],
    attachmentCategories: output.attachmentCategories ?? [],
    newFieldsToConsider: newFields,
  };
}

/* ── Pipeline orchestrator ────────────────────────────────────────────── */

export type StateOnboardingRun = {
  draft: SuggestedStateTemplate;
  review: LegalReview;
  final: SuggestedStateTemplate;
};

/**
 * Three-agent pipeline: drafter → legal reviewer → revisor. Returns all
 * three outputs so God Mode can show the full trace and let staff decide
 * whether to ship the draft or the revised version.
 */
export async function generateReviewedStateTemplate(
  params: SuggestStateTemplateParams
): Promise<StateOnboardingRun> {
  const draft = await suggestStateTemplate(params);
  const review = await reviewStateTemplate({ draft, state: params.state });

  // Optimization: skip the revise step when the reviewer has no warnings/criticals.
  const hasBlockingFindings = review.findings.some(
    (f) => f.severity === "critical" || f.severity === "warning"
  );
  if (!hasBlockingFindings && review.verdict === "approve") {
    return { draft, review, final: draft };
  }

  const final = await reviseStateTemplate({ draft, review, state: params.state });
  return { draft, review, final };
}

/* ── Serialize suggestion → TypeScript template source ────────────────── */

function jsString(value: string): string {
  return "`" + value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

function tsName(state: string, documentType: string): string {
  return `${state.toUpperCase()}_${documentType.toUpperCase()}`;
}

function tsFileName(state: string, documentType: string): string {
  return `${state.toLowerCase()}-${documentType.replace(/_/g, "-")}.ts`;
}

/**
 * Render an AI suggestion as a ready-to-commit TypeScript template file.
 *
 * Staff paste the output into Claude Code to land the template in
 * `lib/document-templates/`. Field definitions are hydrated from the
 * registry so `mergeTag`, `label`, `type`, `communityLevel`, and
 * `ocrFieldKey` don't need to be inferred from the AI output.
 */
export function buildTemplateSource(
  suggestion: SuggestedStateTemplate,
  state: string
): { fileName: string; source: string } {
  const stateUpper = state.toUpperCase();
  const constName = tsName(stateUpper, suggestion.documentType);
  const fileName = tsFileName(stateUpper, suggestion.documentType);

  const fieldLines = suggestion.fields
    .map((f) => {
      const entry = (FIELD_REGISTRY as Record<string, FieldRegistryEntry>)[f.key];
      if (!entry) return "";
      const ocrLine = entry.ocrFieldKey
        ? `\n      ocrFieldKey: ${JSON.stringify(entry.ocrFieldKey)},`
        : "";
      return `    {
      key: ${JSON.stringify(f.key)},
      mergeTag: ${JSON.stringify(entry.mergeTag)},
      label: ${JSON.stringify(entry.label)},
      section: ${JSON.stringify(f.section)},
      type: ${JSON.stringify(entry.type)},
      required: ${f.required},
      communityLevel: ${entry.communityLevel},${ocrLine}
    }`;
    })
    .filter(Boolean)
    .join(",\n");

  const sectionsLine = suggestion.sections.map((s) => JSON.stringify(s)).join(", ");

  const requiredDisclosuresBlock =
    suggestion.requiredDisclosures.length === 0
      ? "[]"
      : `[\n      ${suggestion.requiredDisclosures.map(jsString).join(",\n      ")},\n    ]`;

  const attachmentsBlock =
    suggestion.attachmentCategories.length === 0
      ? "  // attachments: disabled (no categories suggested)"
      : `  attachments: {
    enabled: true,
    order: "as_listed",
    categories: [
      ${suggestion.attachmentCategories.map((c) => JSON.stringify(c)).join(",\n      ")},
    ],
  },`;

  const coverLetterStub = `Dear {{requester_name}},

Please find enclosed the ${suggestion.title} for {{property_address}}, prepared in accordance with ${suggestion.statute}.

This certificate is valid for {{expiration_days}} days from the date of issuance.

If you have questions, please contact {{management_company}} at {{management_contact_email}} or {{management_contact_phone}}.

Sincerely,
{{management_company}}`;

  const newFieldsComment =
    suggestion.newFieldsToConsider.length === 0
      ? ""
      : `\n// TODO — before this template ships, add these registry fields in
// lib/document-templates/field-registry.ts:
${suggestion.newFieldsToConsider
  .map(
    (f) =>
      `//   ${f.key} (${f.type}) — ${f.label}\n//     ${f.rationale.replace(/\n/g, "\n//     ")}`
  )
  .join("\n")}
`;

  const today = new Date().toISOString().slice(0, 10);
  const source = `import type { DocumentTemplate } from "./types";

${newFieldsComment}
const COVER_LETTER_BODY = ${jsString(coverLetterStub)};

export const ${constName}: DocumentTemplate = {
  key: ${JSON.stringify(suggestion.documentType)},
  state: ${JSON.stringify(stateUpper)},
  documentType: ${JSON.stringify(suggestion.documentType)},
  title: ${JSON.stringify(suggestion.title)},
  statute: ${JSON.stringify(suggestion.statute)},
  expirationDays: ${suggestion.expirationDays},
  requiresSignature: ${suggestion.requiresSignature},
  lastUpdated: ${JSON.stringify(today)},
  coverLetter: {
    enabled: true,
    template: COVER_LETTER_BODY,
  },
  legalLanguage: {
    statuteReference: ${JSON.stringify(suggestion.statute.replace(/^Per\\s+/i, ""))},
    certificationText: ${jsString(suggestion.certificationText)},
    disclaimerText: ${jsString(suggestion.disclaimerText)},
    requiredDisclosures: ${requiredDisclosuresBlock},
  },
  disclaimer: ${jsString(suggestion.disclaimerText)},
${attachmentsBlock}
  sections: [${sectionsLine}],
  fields: [
${fieldLines},
  ],
};

// After committing this file:
//   1. Import it in lib/document-templates/index.ts
//   2. Call registerStateTemplate(${constName}) alongside the existing templates
`;

  return { fileName, source };
}
