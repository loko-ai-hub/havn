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
  // Punctuation + currency markers commonly between a label and its blank.
  // Without `:` the synthesis stops one token after the label and produces
  // a 4%-wide minimum box right on top of the label-end colon.
  if (/^[\-/$.,:;=]+$/.test(t2)) return true;
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
 * Common stopwords to ignore when fuzzy-matching labels. Claude tends to
 * pad labels with prepositions and articles that aren't in the OCR.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "have", "in", "is", "it", "of", "on", "or", "that", "the", "to", "with",
  "this", "will", "any", "you", "your", "our", "we", "us", "if", "yes",
  "no", "not", "do", "does", "did", "been", "was", "were",
]);

/**
 * Pull "significant" words from a label — letters/digits only, length ≥ 3,
 * not stopwords. Used by the fuzzy matcher when the verbatim sequence
 * isn't in the OCR (because Claude paraphrased the label across line
 * breaks or rephrased clusters of related questions into a single label).
 */
function significantWords(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Fuzzy fallback for `findLabelSequence`. Slides a window across the
 * OCR token stream looking for clusters of significant label words.
 * Wins go to the smallest window that contains the most distinct
 * matched words; ties broken by earliest occurrence. Returns the index
 * range [first-match, last-match] within that window so callers can
 * project a value bbox forward from the last matched token.
 */
function findFuzzyLabel(
  pageTokens: OcrToken[],
  sigWords: string[]
): { start: number; end: number } | null {
  if (sigWords.length === 0) return null;
  const need = new Set(sigWords);
  const minMatches = Math.max(
    2,
    Math.ceil(Math.min(sigWords.length, 4) * 0.6)
  );
  const windowSize = Math.max(8, sigWords.length * 4);

  let best: { start: number; end: number; score: number } | null = null;
  for (let i = 0; i < pageTokens.length; i++) {
    const matched = new Set<string>();
    let firstHit = -1;
    let lastHit = -1;
    for (
      let j = i;
      j < Math.min(i + windowSize, pageTokens.length);
      j++
    ) {
      const tok = NORM(pageTokens[j].text)
        .replace(/\s+/g, " ")
        .split(" ")
        .find((s) => s.length >= 3 && need.has(s));
      if (tok) {
        matched.add(tok);
        if (firstHit === -1) firstHit = j;
        lastHit = j;
      }
    }
    if (matched.size < minMatches || lastHit === -1) continue;
    const score = matched.size;
    if (!best || score > best.score) {
      best = { start: firstHit, end: lastHit, score };
    }
  }
  if (!best || best.start === -1) return null;
  return { start: best.start, end: best.end };
}

/**
 * Detect the "label below blank" pattern common in signature blocks and
 * "Information Provided By" sections. The blank underline gets drawn
 * directly above the descriptive label ("Print Name", "Signature",
 * "Print Company Name", "Date"), so forward projection lands the input
 * next to the label instead of on the line above where it belongs.
 *
 * Heuristic: if the line directly above the label has no OCR tokens
 * overlapping the label's x-range, treat that empty span as the blank
 * and emit a value bbox positioned there. Underlines themselves don't
 * tokenize, so this works for forms that draw signature lines as
 * horizontal rules.
 *
 * Returns null when the line above is occupied (regular label-then-
 * blank-on-same-line pattern), in which case the caller should fall
 * through to forward projection.
 */
/**
 * Whitelist of label phrases that almost always use the label-below-
 * blank pattern. Conservative on purpose — false positives (Pattern B
 * firing where Pattern A is correct) leave inputs hovering above
 * unrelated text, which is worse than just falling back to forward
 * projection. Add labels here as we encounter new signature-block
 * conventions; staff can always fix outliers via Edit Layout drag.
 */
const ABOVE_BLANK_LABELS = new Set([
  "signature",
  "print name",
  "print title",
  "print company name",
  "company name",
  "title",
  "name",
  "buyer signature",
  "seller signature",
  "owner signature",
  "authorized signature",
  "preparer signature",
  "by",
  "its",
]);

function isAboveBlankLabel(labelText: string): boolean {
  const norm = labelText
    .toLowerCase()
    .replace(/[(),:.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return false;
  if (ABOVE_BLANK_LABELS.has(norm)) return true;
  if (/^print\s+\w+/.test(norm)) return true; // "Print Anything"
  return false;
}

function tryDetectAboveBlank(
  pageTokens: OcrToken[],
  labelStartIdx: number,
  labelEndIdx: number,
  labelText: string
): { x: number; y: number; w: number; h: number } | null {
  if (!isAboveBlankLabel(labelText)) return null;

  const startTok = pageTokens[labelStartIdx];
  const endTok = pageTokens[labelEndIdx];
  if (!startTok.bbox || !endTok.bbox) return null;

  const labelY = startTok.bbox.y;
  const labelH = Math.max(startTok.bbox.h, 0.01);
  const labelXStart = startTok.bbox.x;
  const labelXEnd = endTok.bbox.x + endTok.bbox.w;
  const labelW = Math.max(0.04, labelXEnd - labelXStart);

  const aboveYMax = labelY;
  const aboveYMin = labelY - labelH * 1.5;

  for (const tok of pageTokens) {
    if (!tok.bbox) continue;
    if (tok.bbox.y >= aboveYMax) continue;
    if (tok.bbox.y < aboveYMin) continue;
    const tokXEnd = tok.bbox.x + tok.bbox.w;
    if (tokXEnd > labelXStart && tok.bbox.x < labelXEnd) {
      // Something printed above the label in its x-range — not a blank
      // underline span. Whitelist alone isn't enough; also need an
      // empty span above.
      return null;
    }
  }

  // Signature lines tend to extend wider than the label sitting under
  // them. Bias the bbox out to ~150% label width, capped at page width.
  const desiredW = Math.max(labelW * 1.6, 0.20);
  return {
    x: Math.max(0, labelXStart - (desiredW - labelW) * 0.25),
    y: Math.max(0, labelY - labelH * 1.3),
    w: Math.min(0.92, desiredW),
    h: Math.max(labelH * 1.1, 0.018),
  };
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
    const fuzzyWords = significantWords(labelText);

    let placed = false;
    for (const ocrPage of ocrPages) {
      // First try verbatim sequence match — most accurate when Claude's
      // label happens to be the literal OCR text.
      let seq = findLabelSequence(ocrPage.tokens, labelTokens);
      // Fall back to fuzzy keyword matching when Claude paraphrased
      // (e.g. compressing "Our billing year runs from: __ to: __" into
      // "Our billing year runs from / to", or composing a label across
      // line breaks). The fuzzy match returns the span of matched
      // significant words; we project a value bbox from that span's
      // last matched word.
      if (!seq) seq = findFuzzyLabel(ocrPage.tokens, fuzzyWords);
      if (!seq) continue;

      // Try Pattern B (blank-above-label) only for whitelisted
      // signature-block labels — Print Company Name, Signature, Print
      // Name, Print Title, etc. Numbered questions and any other label
      // fall through to forward projection. Tight whitelist avoids the
      // over-firing we saw when "line above empty" was the only check
      // (false positives for every numbered question with paragraph
      // breaks above).
      const valueBbox =
        tryDetectAboveBlank(
          ocrPage.tokens,
          seq.start,
          seq.end,
          labelText
        ) ?? estimateValueBbox(ocrPage.tokens, seq.end);
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
