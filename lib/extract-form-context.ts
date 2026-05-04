// Universal Claude pass that pulls (a) the three context entities every HOA
// document carries — association name, property address, owner — plus
// (b) for every form-field-with-a-blank, the canonical merge-tag key from
// the Havn registry that fits.
//
// One prompt covers every doc type we accept (lender questionnaires, payoff
// letters, estoppels, resale certs, custom title-company forms). Per-type
// nuance comes through `getExtractorConfig()` — synonyms + an "expected
// fields" hint — without forking the prompt.

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
} from "@/lib/document-templates/field-registry";
import {
  type DocTypeExtractorConfig,
  getExtractorConfig,
} from "@/lib/document-extractors/config";

export type ContextConfidence = "high" | "medium" | "low" | "none";

export type ExtractedFormContext = {
  associationName: string | null;
  propertyAddress: string | null;
  ownerNames: string[];
  parcel: string | null;
  confidence: {
    association: ContextConfidence;
    property: ContextConfidence;
    owner: ContextConfidence;
  };
};

export type ExtractedFieldMapping = {
  label: string;
  registryKey: string;
  confidence: "high" | "medium" | "low";
};

export type FormExtractionResult = {
  context: ExtractedFormContext;
  fieldMap: ExtractedFieldMapping[];
  unmapped: string[];
};

const ContextSchema = z.object({
  association_name: z.string().nullable(),
  property_address: z.string().nullable(),
  owner_names: z.array(z.string()),
  parcel: z.string().nullable(),
  association_confidence: z.enum(["high", "medium", "low", "none"]),
  property_confidence: z.enum(["high", "medium", "low", "none"]),
  owner_confidence: z.enum(["high", "medium", "low", "none"]),
});

const FieldMappingSchema = z.object({
  label: z.string(),
  registry_key: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const OutputSchema = z.object({
  context: ContextSchema,
  field_map: z.array(FieldMappingSchema),
  unmapped: z.array(z.string()),
});

const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_TEXT_CHARS = 20_000;

function buildPrompt(rawText: string, config: DocTypeExtractorConfig): string {
  const registryEntries = Object.values(FIELD_REGISTRY) as FieldRegistryEntry[];
  // Bias the registry list — the doc type's expected keys come first, so
  // they're easier for Claude to reach for.
  const expected = new Set(config.expectedRegistryKeys);
  const sortedRegistry = [...registryEntries].sort((a, b) => {
    const aFav = expected.has(a.key) ? 0 : 1;
    const bFav = expected.has(b.key) ? 0 : 1;
    return aFav - bFav;
  });

  const registryList = sortedRegistry
    .map((e) => `- ${e.key}: ${e.label} (${e.type}) — ${e.description}`)
    .join("\n");

  const synonymHint = [
    `- associationName: ${config.contextSynonyms.associationName.join(", ")}`,
    `- propertyAddress: ${config.contextSynonyms.propertyAddress.join(", ")}`,
    `- ownerNames: ${config.contextSynonyms.ownerNames.join(", ")}`,
    `- parcel: ${config.contextSynonyms.parcel.join(", ")}`,
  ].join("\n");

  return [
    `You are reading a real-estate / HOA document and extracting two things:`,
    ``,
    `(A) CONTEXT BLOCK — three entities that identify which property this`,
    `document is about:`,
    `   - associationName: the HOA / condo / homeowners association the unit`,
    `     belongs to. Often appears under labels like "Brief Legal" or`,
    `     "Subdivision" or in a phrase like "UNIT 61, GREENFIELD PARK, A`,
    `     SINGLE FAMILY CONDO". Pull just the association name itself, not`,
    `     the whole legal description.`,
    `   - propertyAddress: the street address (and city/state/zip if shown)`,
    `     of the unit being sold or refinanced. NOT the management company's`,
    `     address or the requester's address.`,
    `   - ownerNames: full name(s) of the current owner(s) of record.`,
    `   - parcel: the APN / tax parcel ID, when shown.`,
    ``,
    `   For each, give a confidence: high (verbatim, unambiguous), medium`,
    `   (inferred from context), low (guess), none (truly absent from the doc).`,
    ``,
    `   Synonyms for these labels in this doc type:`,
    synonymHint,
    ``,
    `(B) FIELD MAP — every form-field-with-a-blank-line in the document, mapped`,
    `to one of Havn's canonical registry keys below. The registry is the`,
    `single source of truth for what we can fill in; use the EXACT key.`,
    ``,
    `   Rules:`,
    `   - Use the registry key verbatim. Never invent.`,
    `   - If a label clearly maps to a registry key, include it in field_map`,
    `     with confidence high or medium.`,
    `   - If a label is on the form but doesn't match any registry key,`,
    `     include the literal label string in 'unmapped' so we can decide`,
    `     whether to add a new registry entry later.`,
    `   - Skip purely descriptive headings — only emit form-fields-with-a-blank.`,
    ``,
    `   Registry (preferred for this doc type listed first):`,
    registryList,
    ``,
    `--- DOCUMENT TEXT ---`,
    rawText.slice(0, MAX_TEXT_CHARS),
    `--- END DOCUMENT ---`,
  ].join("\n");
}

export async function extractFormContext(
  rawText: string,
  masterTypeKey: string | null | undefined
): Promise<FormExtractionResult> {
  const config = getExtractorConfig(masterTypeKey);

  try {
    const { output } = await generateText({
      model: BEST_MODEL,
      output: Output.object({ schema: OutputSchema }),
      system:
        "You are a meticulous extractor for HOA / real-estate documents. Respond only with structured data. Never invent registry keys; if a label doesn't match the registry, place it in 'unmapped'.",
      prompt: buildPrompt(rawText, config),
      abortSignal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    });

    if (!output) {
      return emptyResult();
    }

    const fieldMap: ExtractedFieldMapping[] = output.field_map
      .filter((f) => f.registry_key in FIELD_REGISTRY)
      .map((f) => ({
        label: f.label,
        registryKey: f.registry_key,
        confidence: f.confidence,
      }));

    return {
      context: {
        associationName: output.context.association_name?.trim() || null,
        propertyAddress: output.context.property_address?.trim() || null,
        ownerNames: (output.context.owner_names ?? [])
          .map((n) => n.trim())
          .filter(Boolean),
        parcel: output.context.parcel?.trim() || null,
        confidence: {
          association: output.context.association_confidence,
          property: output.context.property_confidence,
          owner: output.context.owner_confidence,
        },
      },
      fieldMap,
      unmapped: (output.unmapped ?? []).map((s) => s.trim()).filter(Boolean),
    };
  } catch (err) {
    console.error("[extractFormContext] Claude call failed:", err);
    return emptyResult();
  }
}

function emptyResult(): FormExtractionResult {
  return {
    context: {
      associationName: null,
      propertyAddress: null,
      ownerNames: [],
      parcel: null,
      confidence: { association: "none", property: "none", owner: "none" },
    },
    fieldMap: [],
    unmapped: [],
  };
}
