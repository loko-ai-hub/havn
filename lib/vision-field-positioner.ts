// Claude vision-based field positioner. The workhorse for forms that
// don't have an AcroForm fast path AND aren't in the vendor template
// cache. Renders each PDF page to a PNG, sends the image plus the
// labels Claude already extracted (detected_fields), and asks Claude
// to return the bounding box of the blank for each label.
//
// Why this works where heuristic synthesis doesn't: vision actually
// SEES horizontal underlines, checkbox shapes, signature lines,
// multi-line answer regions. We're no longer trying to reconstruct
// layout from text token positions. The trade is latency (5–20s/page)
// and token cost — both bounded by the upstream template cache that
// only invokes vision for novel form variants.

import Anthropic from "@anthropic-ai/sdk";

import type { ParsedFormField, ParsedPage } from "@/lib/pdf-form-layout";
import { renderPdfPagesToPng, type RenderedPage } from "@/lib/render-pdf-pages";

const VISION_MODEL = "claude-opus-4-7";
const VISION_TIMEOUT_MS = 120_000;
const MAX_PAGES = 10; // safety cap; multi-page complex forms are rare

type DetectedLabel = {
  externalLabel: string;
  registryKey: string | null;
  fieldKind?: string | null;
};

type VisionFieldResponse = {
  idx?: number;
  label: string;
  page: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  kind: "text" | "checkbox" | null;
  notes?: string | null;
};

/**
 * Send rendered PDF pages + detected_fields labels to Claude vision.
 * Returns ParsedFormField entries with bounding boxes back in
 * normalized 0..1 coords. Returns null on hard failure so the caller
 * can fall through to the next positioning layer (heuristic synthesis).
 */
export async function visionPositionFields(params: {
  pdfBuffer: Buffer;
  detectedFields: DetectedLabel[];
}): Promise<{
  pages: ParsedPage[];
  fields: ParsedFormField[];
} | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[vision-positioner] ANTHROPIC_API_KEY not set; skipping");
    return null;
  }
  if (params.detectedFields.length === 0) return null;

  let rendered: RenderedPage[];
  try {
    rendered = await renderPdfPagesToPng(params.pdfBuffer);
  } catch (err) {
    console.warn("[vision-positioner] render failed:", err);
    return null;
  }

  if (rendered.length === 0) return null;
  if (rendered.length > MAX_PAGES) {
    console.warn(
      `[vision-positioner] PDF has ${rendered.length} pages, capping at ${MAX_PAGES}`
    );
    rendered.length = MAX_PAGES;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const labelList = params.detectedFields.map((f, idx) => ({
    idx,
    label: f.externalLabel,
    expectedKind:
      ((f.fieldKind ?? "").toLowerCase() === "checkbox" ||
      (f.fieldKind ?? "").toLowerCase() === "boolean")
        ? "checkbox"
        : "text",
  }));

  const systemPrompt = [
    "You're locating answer blanks on an HOA / real-estate form.",
    "I'll give you a rendered page image plus a list of question labels.",
    "For each label, return the bounding box of the BLANK where the answer goes.",
    "",
    "Coordinate system: [0..1] origin top-left. x and y are the top-left",
    "corner of the bbox; w and h are width and height. Both relative to",
    "the page's full image dimensions.",
    "",
    "For 'text' kind: the bbox should cover the underline / blank space",
    "where the answer is written. Long signature lines should get a wide bbox;",
    "currency $___ blanks just the underline portion.",
    "For 'checkbox' kind: the bbox should be the checkbox itself (the small",
    "square or circle next to its option label).",
    "",
    "Skip labels that aren't visible on this page — set bbox to null with",
    "a notes field explaining why. Don't invent positions. Don't fabricate",
    "labels not in my list.",
    "",
    "Return JSON only — an object with a `fields` array. Each entry has:",
    "  { idx: number, label: string, page: number, bbox: {x,y,w,h} | null,",
    "    kind: 'text'|'checkbox'|null, notes?: string }",
  ].join("\n");

  const allFields: ParsedFormField[] = [];

  for (const renderedPage of rendered) {
    const userMessage = [
      `Page ${renderedPage.page} of ${rendered.length}.`,
      "",
      "Labels (idx — label — expectedKind):",
      ...labelList.map(
        (l) => `  ${l.idx} — ${l.label} — ${l.expectedKind}`
      ),
    ].join("\n");

    let result: { fields?: VisionFieldResponse[] } | null = null;
    try {
      const response = await client.messages.create(
        {
          model: VISION_MODEL,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: renderedPage.pngBytes.toString("base64"),
                  },
                },
                { type: "text", text: userMessage },
              ],
            },
          ],
        },
        { timeout: VISION_TIMEOUT_MS }
      );
      const textBlock = response.content.find((b) => b.type === "text");
      const raw =
        textBlock && textBlock.type === "text" ? textBlock.text : "";
      result = parseVisionJson(raw);
    } catch (err) {
      console.warn(
        `[vision-positioner] Claude call failed for page ${renderedPage.page}:`,
        err
      );
      continue;
    }

    if (!result?.fields) continue;

    for (const f of result.fields) {
      if (!f.bbox) continue;
      if (f.idx == null && !f.label) continue;
      const detected = labelList.find(
        (l) => l.idx === f.idx || l.label === f.label
      );
      if (!detected) continue;

      allFields.push({
        page: renderedPage.page,
        label: detected.label,
        currentValue:
          detected.expectedKind === "checkbox" ? "false" : "",
        kind: detected.expectedKind === "checkbox" ? "checkbox" : "text",
        labelBbox: null,
        valueBbox: clampBbox(f.bbox),
      });
    }
  }

  if (allFields.length === 0) return null;

  const pages: ParsedPage[] = rendered.map((r) => ({
    page: r.page,
    width: r.widthPt,
    height: r.heightPt,
  }));

  return { pages, fields: allFields };
}

function parseVisionJson(text: string): { fields?: VisionFieldResponse[] } | null {
  // Strip markdown fences if Claude wrapped the JSON.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Try to find a JSON object inside the response (sometimes Claude
    // adds a sentence before/after).
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function clampBbox(bbox: { x: number; y: number; w: number; h: number }): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const c = (n: number) => {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  };
  const x = c(bbox.x);
  const y = c(bbox.y);
  const w = Math.max(0.01, Math.min(1 - x, c(bbox.w)));
  const h = Math.max(0.01, Math.min(1 - y, c(bbox.h)));
  return { x, y, w, h };
}
