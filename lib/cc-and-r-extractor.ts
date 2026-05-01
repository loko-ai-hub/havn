// Extract structured community metadata from a governing-documents PDF
// (CC&Rs / Bylaws / Declaration). Pipeline:
//   1. PDF → text via Google Document AI (existing OCR helper)
//   2. Text → Claude with a structured-output schema
//   3. Return per-field values with confidence scores so the UI can
//      surface low-confidence fields as questions for the operator.

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import { extractTextFromBuffer } from "@/lib/pdf-text";

const Confidence = z.enum(["high", "medium", "low", "not_found"]);

const ConfidentString = z.object({
  value: z.string().nullable(),
  confidence: Confidence,
});

const ConfidentNumber = z.object({
  value: z.number().nullable(),
  confidence: Confidence,
});

const ConfidentEnum = <T extends [string, ...string[]]>(values: T) =>
  z.object({
    value: z.enum(values).nullable(),
    confidence: Confidence,
  });

export const COMMUNITY_TYPES: [string, ...string[]] = [
  "HOA",
  "COA",
  "Condo Association",
  "Planned Development",
];

export const CcAndRExtraction = z.object({
  community_name: ConfidentString,
  street: ConfidentString,
  city: ConfidentString,
  state: ConfidentString, // 2-letter abbr
  zip: ConfidentString,
  community_type: ConfidentEnum(COMMUNITY_TYPES),
  monthly_assessment_dollars: ConfidentNumber,
  annual_dues_dollars: ConfidentNumber,
  year_founded: ConfidentNumber,
  governing_body_name: ConfidentString,
  board_positions: z.array(
    z.object({
      title: z.string(),
      name: z.string().nullable(),
    })
  ),
  key_restrictions_summary: z.string(),
});

export type CcAndRExtractionResult = z.infer<typeof CcAndRExtraction>;

const MAX_TEXT_CHARS = 80_000; // ~100 pages of text; well below model context

const SYSTEM_PROMPT = [
  "You are a meticulous paralegal extracting structured metadata from HOA / COA",
  "governing documents (CC&Rs, Declaration, Bylaws). The user will eventually",
  "review your output, so honesty matters more than completeness:",
  "- For each field, set `confidence` to 'high' only when the value is stated",
  "  unambiguously somewhere in the document. Use 'medium' when you inferred",
  "  it from a partial mention. Use 'low' when you are guessing. Use",
  "  'not_found' when the document does not state the value at all.",
  "- For 'not_found' fields, return null as the value.",
  "- Do not invent board members. Only list positions/people that are explicitly",
  "  named in the document.",
  "- key_restrictions_summary should be 2-4 short sentences summarizing the",
  "  most important rules a homeowner would want to know. If the document is",
  "  pure declaration boilerplate, return an empty string.",
  "- state must be a 2-letter US abbreviation (e.g. 'WA').",
].join(" ");

function buildPrompt(text: string): string {
  return [
    "Extract community metadata from the following governing document.",
    "Document text follows between the markers:",
    "",
    "----- BEGIN DOCUMENT -----",
    text,
    "----- END DOCUMENT -----",
  ].join("\n");
}

export async function extractCommunityFromText(
  text: string
): Promise<CcAndRExtractionResult> {
  const truncated = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: CcAndRExtraction }),
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(truncated),
  });

  if (!output) {
    throw new Error("Extraction returned no output");
  }
  return output;
}

export async function extractCommunityFromBuffer(
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ extraction: CcAndRExtractionResult; pageCount: number; rawText: string }> {
  const { rawText, pageCount } = await extractTextFromBuffer(fileBuffer, mimeType);
  if (!rawText.trim()) {
    throw new Error(
      "Could not read any text from the document. It may be a scanned image without text content."
    );
  }
  const extraction = await extractCommunityFromText(rawText);
  return { extraction, pageCount, rawText };
}
