/**
 * Post-OCR merge-tag resolution.
 *
 * After every successful OCR pass, this module hands the raw extracted JSON
 * to Claude Opus (via `BEST_MODEL`) along with the Havn field registry.
 * Claude intelligently maps whatever the extractor produced into our canonical
 * merge-tag shape, handling naming drift, format normalization, splitting
 * combined fields, and flagging ambiguous matches with a confidence score.
 *
 * Resolved values are persisted to `community_field_cache` with
 * `source: "ocr"` so they immediately flow into the review UI and God Mode.
 */

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FIELD_REGISTRY,
  getLifecycleTier,
  type FieldRegistryEntry,
} from "@/lib/document-templates/field-registry";

/* ── Schema ───────────────────────────────────────────────────────────── */

const ResolvedField = z.object({
  key: z.string(),
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().nullable(),
});

const ResolutionSchema = z.object({
  resolved: z.array(ResolvedField),
  unmapped: z.array(z.string()).describe("Source keys from the input JSON that had no good registry match."),
});

export type ResolvedFieldValue = z.infer<typeof ResolvedField>;
export type ResolutionResult = z.infer<typeof ResolutionSchema>;

/* ── Confidence threshold ─────────────────────────────────────────────── */

/**
 * Minimum confidence to write a resolved value to the cache. Values below
 * this threshold are included in the return payload but not persisted,
 * so staff can review them during order fulfillment.
 */
const CACHE_CONFIDENCE_THRESHOLD = 0.7;

/* ── Prompt ───────────────────────────────────────────────────────────── */

function buildRegistryDescription(): string {
  const entries = Object.values(FIELD_REGISTRY) as FieldRegistryEntry[];
  return entries
    .filter((e) => e.sources.includes("ocr") || e.sources.includes("cache"))
    .map((e) => {
      const fmt = formatHint(e.type);
      return `- ${e.key} (${e.type}${fmt ? `, ${fmt}` : ""}): ${e.description}`;
    })
    .join("\n");
}

function formatHint(type: FieldRegistryEntry["type"]): string {
  switch (type) {
    case "currency":
      return "numeric, no symbols or commas";
    case "date":
      return "ISO date YYYY-MM-DD";
    case "boolean":
      return 'true or false';
    case "textarea":
      return "free text, preserve meaningful newlines";
    case "text":
      return "";
  }
}

function buildPrompt(extracted: Record<string, unknown>): string {
  return `You are normalizing data extracted from an HOA/COA document into Havn's canonical merge-tag registry.

The extractor already produced this JSON from a governing or financial document:

\`\`\`json
${JSON.stringify(extracted, null, 2)}
\`\`\`

Map each input value to the best-matching field in the registry below. Follow these rules strictly:

1. Use the exact \`key\` from the registry — never invent new keys.
2. Normalize values to the format indicated for each field's type.
3. Split combined inputs where appropriate (e.g. a single string containing both a contact name and a phone number should be split into the name and phone registry keys).
4. If the same registry key can be filled from multiple inputs, choose the most authoritative one and explain in \`reasoning\`.
5. Never guess — if the input does not clearly map to a registry key, list the source key under \`unmapped\`.
6. \`confidence\` should reflect how certain you are the mapping is correct (1.0 = verbatim match, 0.7 = reasonable inference, <0.7 = uncertain).
7. Do not include a resolved entry whose \`value\` is null or an empty string. Omit it entirely.

Registry (only fields that can be OCR-sourced):
${buildRegistryDescription()}

Return structured data only.`;
}

/* ── Core resolver ────────────────────────────────────────────────────── */

export async function resolveFieldsToMergeTags(
  extracted: Record<string, unknown>
): Promise<ResolutionResult> {
  if (!extracted || Object.keys(extracted).length === 0) {
    return { resolved: [], unmapped: [] };
  }

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: ResolutionSchema }),
    system:
      "You are a meticulous data normalization assistant. You respond only with structured data matching the provided schema. Never invent keys that are not in the registry. Prefer omitting a field to guessing.",
    prompt: buildPrompt(extracted),
  });

  if (!output) return { resolved: [], unmapped: [] };

  // Defensive filter: drop anything that somehow references an unknown key.
  const resolved = output.resolved.filter((r) => r.key in FIELD_REGISTRY);
  return { resolved, unmapped: output.unmapped };
}

/* ── Persistence ──────────────────────────────────────────────────────── */

export type PersistResult = {
  cached: number;
  skipped: number;
  /** Values that were NOT written because a `source: "manual"` row already exists. */
  preservedManual: number;
  errors: string[];
};

/**
 * Upsert high-confidence resolved values into `community_field_cache` for
 * this community. Low-confidence values are not written — they're returned
 * from `resolveFieldsToMergeTags` so the caller can surface them in the UI.
 *
 * `sourceDocumentId` is accepted so a future migration can add a
 * `source_document_id` column on `community_field_cache`; today it's
 * retained in memory only for the caller's logs.
 */
export async function persistResolvedMergeTags(
  result: ResolutionResult,
  params: {
    communityId: string;
    documentType?: string; // defaults to "_shared"
    sourceDocumentId?: string | null;
  }
): Promise<PersistResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const documentType = params.documentType ?? "_shared";

  let cached = 0;
  let skipped = 0;
  const errors: string[] = [];

  const candidateRows = result.resolved
    .filter((r) => r.confidence >= CACHE_CONFIDENCE_THRESHOLD)
    .filter((r) => {
      const entry = FIELD_REGISTRY[r.key as keyof typeof FIELD_REGISTRY];
      if (!entry) return false;
      // Only cache governing + onboarding tier fields. per_unit lives on
      // community_units (refetched per order); per_order lives on the
      // order row itself. Falls back to communityLevel for entries not
      // yet tagged with an explicit lifecycleTier.
      const tier = getLifecycleTier(entry as FieldRegistryEntry);
      return tier === "governing" || tier === "onboarding";
    });

  skipped = result.resolved.length - candidateRows.length;

  if (candidateRows.length === 0) {
    return { cached: 0, skipped, preservedManual: 0, errors };
  }

  // Never overwrite a manually-set cache entry. Fetch existing manual rows
  // for the candidate field keys and skip those.
  const candidateKeys = candidateRows.map((r) => r.key);
  const { data: manualRows } = await admin
    .from("community_field_cache")
    .select("field_key")
    .eq("community_id", params.communityId)
    .eq("document_type", documentType)
    .eq("source", "manual")
    .in("field_key", candidateKeys);
  const manualKeys = new Set((manualRows ?? []).map((r) => r.field_key as string));

  const rows = candidateRows
    .filter((r) => !manualKeys.has(r.key))
    .map((r) => {
      const entry = FIELD_REGISTRY[r.key as keyof typeof FIELD_REGISTRY] as
        | FieldRegistryEntry
        | undefined;
      const tier = entry ? getLifecycleTier(entry) : "onboarding";
      return {
        community_id: params.communityId,
        document_type: documentType,
        field_key: r.key,
        field_value: r.value,
        source: "ocr" as const,
        updated_at: nowIso,
        // Audit columns from the lifecycle-tiers migration. Stamped on
        // every cache write so the God Mode audit panel can show what
        // produced each row.
        lifecycle_tier: tier,
        last_refreshed_at: nowIso,
        source_event: "ocr_extract" as const,
      };
    });

  const preservedManual = candidateRows.length - rows.length;

  if (rows.length === 0) {
    return { cached: 0, skipped, preservedManual, errors };
  }

  const { error } = await admin
    .from("community_field_cache")
    .upsert(rows, { onConflict: "community_id,document_type,field_key" });

  if (error) {
    errors.push(error.message);
  } else {
    cached = rows.length;
  }

  return { cached, skipped, preservedManual, errors };
}

/**
 * Convenience wrapper: resolve + persist in one call. Used by the OCR
 * pipeline after field extraction completes.
 */
export async function resolveAndPersistMergeTags(
  extracted: Record<string, unknown>,
  params: {
    communityId: string;
    documentType?: string;
    sourceDocumentId?: string | null;
  }
): Promise<{ resolution: ResolutionResult; persist: PersistResult }> {
  const resolution = await resolveFieldsToMergeTags(extracted);
  const persist = await persistResolvedMergeTags(resolution, params);
  return { resolution, persist };
}
