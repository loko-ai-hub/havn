// Synthesize PDF-overlay bounding boxes for fields that Claude's text-based
// extraction (`detected_fields`) recognized but Document AI's Form Parser
// missed. The Ticor HOA Request form is the canonical example: Form Parser
// only finds checkboxes + already-filled context fields, leaving every
// underline-style response blank ("1. Amount of Maintenance Fee: $___",
// "Account paid through: ___", etc.) un-positioned and therefore invisible
// in the PDF view.
//
// This module walks the OCR token stream looking for each detected field's
// label, then projects forward on the same line to estimate where the value
// blank sits. The synthesized layout is merged with the Form Parser output
// — Form Parser's spatial accuracy wins where it exists, this fills the
// gaps.

import type { OcrPage, OcrToken } from "@/lib/pdf-text";
import type { ParsedFormField } from "@/lib/pdf-form-layout";

type DetectedField = {
  externalLabel: string;
  registryKey: string | null;
  fieldKind?: string | null;
};

const NORM = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[(),:$_/\\.*-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Treat a token as part of the value blank if it's whitespace, an
 * underscore run, or a common placeholder ($, /, dash). Used to extend
 * the synthesized bbox right past non-content tokens.
 */
function isBlankToken(t: OcrToken): boolean {
  const t2 = t.text.trim();
  if (t2.length === 0) return true;
  if (/^_+$/.test(t2)) return true;
  if (/^[\-/$.,]+$/.test(t2)) return true;
  return false;
}

/**
 * Find the first occurrence of `labelTokens` (a normalized token sequence)
 * in the page's token list. Returns the start + end token indices, or null.
 */
function findLabelSequence(
  pageTokens: OcrToken[],
  labelTokens: string[]
): { start: number; end: number } | null {
  if (labelTokens.length === 0) return null;
  outer: for (let i = 0; i <= pageTokens.length - labelTokens.length; i++) {
    for (let j = 0; j < labelTokens.length; j++) {
      const tok = NORM(pageTokens[i + j].text);
      if (tok !== labelTokens[j]) continue outer;
    }
    return { start: i, end: i + labelTokens.length - 1 };
  }
  return null;
}

/**
 * Estimate the value bounding box for a label whose last token sits at
 * `endIdx`. Walks forward on the same visual line:
 *   - skips blank-marker tokens (underscores, dashes, dollar signs)
 *   - if the next real token is on the same line, the value extends from
 *     end-of-label to start-of-next-token
 *   - otherwise the value extends from end-of-label to the right edge
 *     (with a tiny margin)
 */
function estimateValueBbox(
  pageTokens: OcrToken[],
  endIdx: number
): { x: number; y: number; w: number; h: number } | null {
  const lastLabelTok = pageTokens[endIdx];
  if (!lastLabelTok.bbox) return null;

  const startX = Math.min(0.99, lastLabelTok.bbox.x + lastLabelTok.bbox.w + 0.005);
  const labelY = lastLabelTok.bbox.y;
  const labelH = lastLabelTok.bbox.h;

  // Walk forward on the same line, skipping blank tokens, until either:
  //   1) we hit a non-blank, same-line token (value ends just before it)
  //   2) the line ends (value extends to ~95% of page width)
  let endX = 0.95;
  let lineEnded = lastLabelTok.endOfLine;
  for (let k = endIdx + 1; k < pageTokens.length && !lineEnded; k++) {
    const tok = pageTokens[k];
    if (!tok.bbox) {
      if (tok.endOfLine) lineEnded = true;
      continue;
    }
    // Different line if vertical center is more than half a line away.
    const vDelta = Math.abs(tok.bbox.y - labelY);
    if (vDelta > Math.max(labelH * 0.7, 0.01)) break;
    if (isBlankToken(tok)) {
      if (tok.endOfLine) lineEnded = true;
      continue;
    }
    endX = Math.max(startX + 0.02, tok.bbox.x - 0.005);
    break;
  }

  const w = Math.max(0.04, endX - startX);
  return {
    x: startX,
    y: labelY,
    w,
    h: Math.max(labelH, 0.012),
  };
}

/**
 * Produce a list of synthetic ParsedFormField entries — one per
 * detected-field-with-no-existing-bbox we can locate in the OCR.
 * Existing fields (already in `formParserFields`) are not duplicated.
 */
export function synthesizeFieldLayout(params: {
  ocrPages: OcrPage[];
  detectedFields: DetectedField[];
  formParserFields: ParsedFormField[];
}): ParsedFormField[] {
  const { ocrPages, detectedFields, formParserFields } = params;
  if (ocrPages.length === 0 || detectedFields.length === 0) return [];

  // Index existing labels (normalized) so we don't synthesize a duplicate
  // for fields Form Parser already found.
  const existingNormLabels = new Set(
    formParserFields.map((f) => NORM(f.label)).filter(Boolean)
  );

  const synthesized: ParsedFormField[] = [];

  for (const detected of detectedFields) {
    const labelText = (detected.externalLabel || "").trim();
    if (!labelText) continue;
    const labelNorm = NORM(labelText);
    if (!labelNorm) continue;
    if (existingNormLabels.has(labelNorm)) continue;

    // Tokenize the label into individual normalized words for sequence
    // matching against the OCR token stream.
    const labelTokens = labelNorm.split(" ").filter(Boolean);
    if (labelTokens.length === 0) continue;

    let placed = false;
    for (const ocrPage of ocrPages) {
      const seq = findLabelSequence(ocrPage.tokens, labelTokens);
      if (!seq) continue;

      const valueBbox = estimateValueBbox(ocrPage.tokens, seq.end);
      if (!valueBbox) continue;

      // Compose a labelBbox spanning the matched tokens.
      const labelStart = ocrPage.tokens[seq.start].bbox;
      const labelEnd = ocrPage.tokens[seq.end].bbox;
      const labelBbox =
        labelStart && labelEnd
          ? {
              x: labelStart.x,
              y: labelStart.y,
              w: Math.max(0, labelEnd.x + labelEnd.w - labelStart.x),
              h: Math.max(labelStart.h, labelEnd.h, 0.012),
            }
          : null;

      const isCheckbox =
        (detected.fieldKind ?? "").toLowerCase() === "checkbox" ||
        (detected.fieldKind ?? "").toLowerCase() === "boolean";

      synthesized.push({
        page: ocrPage.page,
        label: labelText,
        currentValue: isCheckbox ? "false" : "",
        kind: isCheckbox ? "checkbox" : "text",
        labelBbox,
        valueBbox,
      });
      placed = true;
      break; // only one match per label (first occurrence)
    }
    if (!placed) {
      // Couldn't locate the label in the OCR — leave it for Form view.
    }
  }

  return synthesized;
}
