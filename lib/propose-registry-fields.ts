/**
 * Claude-powered proposal generator for net-new merge-tag registry entries.
 *
 * When `ingestExternalTemplate` processes a vendor form, some labels won't
 * map to any existing Havn registry key. This module takes that list of
 * unmapped labels and asks Claude Opus (`BEST_MODEL`) which ones are
 * legitimate association-level concepts that should join the registry vs.
 * noisy vendor-specific fields (broker MLS #, form version number, etc.)
 * that should be ignored.
 *
 * Output feeds the `field_registry_proposals` table so Havn staff can
 * approve proposals and copy the generated TypeScript into
 * `lib/document-templates/field-registry.ts`.
 */

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
} from "@/lib/document-templates/field-registry";

/* ── Schema ──────────────────────────────────────────────────────────── */

const RawProposal = z.object({
  externalLabel: z.string(),
  shouldPropose: z.boolean(),
  proposedKey: z.string().nullable().optional(),
  proposedLabel: z.string().nullable().optional(),
  proposedType: z.string().nullable().optional(),
  rationale: z.string().nullable().optional(),
});

const RawProposalSet = z.object({
  proposals: z.array(RawProposal),
});

const VALID_PROPOSED_TYPES = [
  "text",
  "currency",
  "date",
  "textarea",
  "boolean",
] as const;

export type ProposedRegistryField = {
  externalLabel: string;
  proposedKey: string;
  proposedLabel: string;
  proposedType: (typeof VALID_PROPOSED_TYPES)[number];
  rationale: string;
};

/* ── Prompt helpers ──────────────────────────────────────────────────── */

function buildRegistrySummary(): string {
  const entries = Object.values(FIELD_REGISTRY) as FieldRegistryEntry[];
  return entries.map((e) => `  ${e.key} — ${e.label}`).join("\n");
}

function buildPrompt(labels: string[]): string {
  return `You are extending Havn's canonical HOA/COA merge-tag registry. The ingestion mapper couldn't resolve these vendor-form labels against any existing registry key:

${labels.map((l, i) => `${i + 1}. "${l}"`).join("\n")}

For each label, decide:
- If it represents a legitimate association-level concept Havn should track going forward (e.g. "board secretary name", "year of last roof replacement", "number of rental units permitted"), set \`shouldPropose: true\` and provide a proposed registry entry.
- If it's vendor-specific noise that has no place in a canonical registry (e.g. "Form version", "Broker MLS #", "Loan number", "Your company reference"), set \`shouldPropose: false\`. No key / label / type needed.

When proposing:
- \`proposedKey\` must be snake_case, descriptive, unique, and not already exist in the registry below.
- \`proposedLabel\` is the human-facing field title.
- \`proposedType\` MUST be one of: ${VALID_PROPOSED_TYPES.join(", ")}.
- \`rationale\` = one sentence explaining why this deserves to be canonical (why it's association-level, not vendor-specific).

Existing registry keys (avoid collisions):
${buildRegistrySummary()}

Return structured data only.`;
}

function normalizeProposedType(
  raw: string | null | undefined
): (typeof VALID_PROPOSED_TYPES)[number] {
  if (!raw) return "text";
  const v = raw.toLowerCase();
  return (VALID_PROPOSED_TYPES as readonly string[]).includes(v)
    ? (v as (typeof VALID_PROPOSED_TYPES)[number])
    : "text";
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Ask Claude Opus whether each unmapped vendor label should join the Havn
 * registry, and — when yes — how it should be shaped. Returns only the
 * labels worth proposing; vendor-specific noise is filtered out.
 */
export async function proposeRegistryFields(
  unmappedLabels: string[]
): Promise<ProposedRegistryField[]> {
  const cleaned = [...new Set(unmappedLabels.map((l) => l.trim()).filter(Boolean))];
  if (cleaned.length === 0) return [];

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawProposalSet }),
    system:
      "You are a meticulous data architect. Respond only with structured data. Be skeptical — most vendor-form labels are noise. Only propose fields that would be useful across multiple associations, not one-off vendor fields.",
    prompt: buildPrompt(cleaned),
  });

  if (!output) return [];

  return output.proposals
    .filter((p) => p.shouldPropose && p.proposedKey && p.proposedLabel)
    .filter((p) => !(p.proposedKey! in FIELD_REGISTRY))
    .map((p) => ({
      externalLabel: p.externalLabel,
      proposedKey: p.proposedKey!,
      proposedLabel: p.proposedLabel!,
      proposedType: normalizeProposedType(p.proposedType ?? null),
      rationale: p.rationale ?? "",
    }));
}

/**
 * Render an approved proposal as a ready-to-paste TypeScript entry for
 * `lib/document-templates/field-registry.ts`. Mirrors the `Copy template
 * source` pattern used elsewhere.
 */
export function buildRegistryEntrySource(proposal: ProposedRegistryField): string {
  const ocrHint =
    `${proposal.proposedKey.replace(/\s+/g, "_")}`; // simple default; staff can tune
  return `  ${proposal.proposedKey}: {
    key: ${JSON.stringify(proposal.proposedKey)},
    mergeTag: ${JSON.stringify(`{{${proposal.proposedKey}}}`)},
    label: ${JSON.stringify(proposal.proposedLabel)},
    type: ${JSON.stringify(proposal.proposedType)},
    sources: ["manual", "cache"],
    description: ${JSON.stringify(proposal.rationale)},
    communityLevel: true,
    ocrFieldKey: ${JSON.stringify(ocrHint)},
  },`;
}
