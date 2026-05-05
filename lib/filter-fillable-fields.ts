// Post-process pass over Form Parser output. Document AI's Form Parser is
// permissive — it tags any rectangle that looks like a form-shaped slot,
// including:
//
//   - The form-issuer's pre-printed return address ("PLEASE RETURN TO:
//     Ticor Title Company / University Place WA / Erica Harrell …").
//   - Requester-supplied context fields at the top of the form (Date,
//     Escrow No., Owner, Property, Estimated Settlement Date) that are
//     already filled by the requester and aren't questions for the
//     management company to answer.
//
// Both inflate the "fields detected" count and clutter the staff overlay
// with inputs sitting on top of already-rendered text. This module asks
// Claude to classify each detected field as either:
//
//   - `response`    — a genuine blank the management company response
//                     should fill in.
//   - `requester`   — context the requester provided (already filled,
//                     part of the order, not a response field).
//   - `metadata`    — pre-printed form-issuer info (return address,
//                     contact block, instructional text).
//
// Only `response` fields survive. The pass is best-effort: a Claude error
// or schema mismatch falls through to the heuristic — drop fields whose
// `currentValue` is non-empty AND not just "_____" — so the pipeline
// always returns something sensible.

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import type { ParsedFormField, ParsedFormLayout } from "@/lib/pdf-form-layout";

type FieldClassification = "response" | "requester" | "metadata";

const ClassificationSchema = z.object({
  classifications: z.array(
    z.object({
      index: z.number().int().min(0),
      classification: z.enum(["response", "requester", "metadata"]),
      reason: z.string().optional(),
    })
  ),
});

const FILTER_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You are reviewing fields detected in an HOA management form (resale certificate, lender questionnaire, payoff/demand letter, estoppel, governing-doc cover, etc.). The form has three categories of detected fields:

- "response": a blank the management company filling out the form will answer (e.g. "Monthly assessment: $___", "Account paid through: ___", "Pending litigation: Yes / No"). These are the questions Havn needs to fill in.
- "requester": context the requester (title company, lender, agent) provided when ordering. Already filled at the top of the form to identify the property and transaction (e.g. Date, Escrow No., Owner, Property, APN/Parcel, Estimated Settlement Date). Not questions for the management company.
- "metadata": pre-printed information from the form issuer themselves — their company name, return address, contact phone/fax/email, "PLEASE RETURN COMPLETED FORM TO:" footer, instructional text. Never to be re-filled.

Heuristics:
- Currently-empty value + label phrased as a question → almost always "response".
- Currently-filled value at the TOP of the form, with labels like Date / Owner / Property / Escrow / Settlement / Buyer / Seller → almost always "requester".
- Currently-filled value in a return-address or contact block at the bottom → "metadata".
- Numbered list items with prompts like "1. Amount of …", "2. Fees are due", "Make checks payable to" → "response".

Classify every field. Return JSON only.`;

export type FilterableField = {
  index: number;
  page: number;
  label: string;
  currentValue: string;
  kind: "text" | "checkbox";
};

/**
 * Classify each detected field and return only the ones a management
 * company response should fill. Falls back to a heuristic when Claude
 * is unavailable.
 */
export async function filterFillableFields(
  layout: ParsedFormLayout,
  context: { issuer?: string | null; formTitle?: string | null }
): Promise<ParsedFormField[]> {
  if (layout.fields.length === 0) return layout.fields;

  // Prep input — strip bounding boxes so we minimize tokens.
  const fields: FilterableField[] = layout.fields.map((f, idx) => ({
    index: idx,
    page: f.page,
    label: f.label,
    currentValue: f.currentValue,
    kind: f.kind,
  }));

  let classifications: Array<{
    index: number;
    classification: FieldClassification;
  }> | null = null;

  try {
    const { output } = await generateText({
      model: BEST_MODEL,
      output: Output.object({ schema: ClassificationSchema }),
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify({
        formTitle: context.formTitle ?? null,
        issuer: context.issuer ?? null,
        fields,
      }),
      abortSignal: AbortSignal.timeout(FILTER_TIMEOUT_MS),
    });
    if (output) classifications = output.classifications;
  } catch (err) {
    console.warn("[filter-fillable-fields] Claude classification failed:", err);
  }

  if (classifications && classifications.length > 0) {
    const keep = new Set(
      classifications
        .filter((c) => c.classification === "response")
        .map((c) => c.index)
    );
    return layout.fields.filter((_, idx) => keep.has(idx));
  }

  // Heuristic fallback: drop fields whose currentValue is non-empty and
  // doesn't look like an empty placeholder. Best-effort only.
  return layout.fields.filter((f) => {
    if (f.kind === "checkbox") return true; // always keep checkboxes
    const cv = f.currentValue.trim();
    if (cv.length === 0) return true;
    if (/^[_\s\-.]+$/.test(cv)) return true; // "_____", "------"
    return false;
  });
}
