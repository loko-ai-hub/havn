// Claude vision-based field positioner. The workhorse positioning layer
// for forms that don't have an AcroForm fast path AND aren't in the
// vendor template cache.
//
// Sends the PDF directly to Claude as a `document` content block —
// Anthropic's API natively accepts PDFs, so no server-side rasterization
// is needed. Claude vision can resolve underline blanks, signature lines,
// and checkbox shapes in a way that heuristic OCR-token synthesis can't.
// Trade is latency (5-15s per call) and tokens, both bounded by the
// upstream template cache that only invokes vision for novel forms.

import Anthropic from "@anthropic-ai/sdk";

import type { ParsedFormField, ParsedPage } from "@/lib/pdf-form-layout";

const VISION_MODEL = "claude-opus-4-7";
const VISION_TIMEOUT_MS = 180_000;
const MAX_LABEL_TOKENS_PER_CALL = 80; // safety cap for huge forms

type DetectedLabel = {
  externalLabel: string;
  registryKey: string | null;
  fieldKind?: string | null;
};

type VisionFieldResponse = {
  idx?: number;
  label?: string;
  page: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  kind: "text" | "checkbox" | null;
  notes?: string | null;
};

/**
 * Send the PDF to Claude vision with the detected_fields list and ask
 * for per-label bounding boxes. Returns ParsedFormField entries with
 * normalized bboxes back in 0..1 coords (top-left origin). Returns null
 * on hard failure so the caller can fall through to heuristic synthesis.
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
  if (params.pdfBuffer.length === 0) return null;

  const labelList = params.detectedFields
    .slice(0, MAX_LABEL_TOKENS_PER_CALL)
    .map((f, idx) => ({
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
    "I'll give you the PDF and a list of question labels. For each",
    "label, return the bounding box of the BLANK where the answer goes.",
    "",
    "Coordinate system: [0..1] origin top-left of the page. x and y",
    "are the top-left corner of the bbox; w and h are width and height.",
    "All four values are normalized to the page's full dimensions.",
    "",
    "Label semantics:",
    "  • 'text' kind  → bbox covers the underline / blank space where",
    "    the answer is written. Long signature lines get a wide bbox;",
    "    currency $___ blanks just the underline portion.",
    "  • 'checkbox' kind → bbox covers the checkbox itself (the small",
    "    square or circle next to its option label).",
    "",
    "Patterns to handle:",
    "  • Label-then-blank-on-same-line ('Amount: $_____') — bbox starts",
    "    after the colon/$, ends where the underline ends.",
    "  • Blank-above-label ('Print Company Name' under a long underline)",
    "    — bbox is the line ABOVE the label text.",
    "  • Multi-line text answer ('Any additional information:' followed",
    "    by 2-3 blank lines below) — bbox spans those blank lines as a",
    "    tall region.",
    "  • Two blanks on one row ('from: ___ to: ___') — emit one bbox per",
    "    blank if the label maps to both, picking the first.",
    "",
    "Skip labels that aren't visible. For each, set bbox to null with a",
    "short `notes` field explaining why. Don't invent positions or labels.",
    "",
    "Return JSON only — an object `{ fields: [...] }`. Each entry:",
    "  { idx: number, page: number, bbox: {x,y,w,h} | null,",
    "    kind: 'text'|'checkbox'|null, notes?: string }",
  ].join("\n");

  const userPrompt = [
    `Labels (idx — label — expectedKind):`,
    ...labelList.map(
      (l) => `  ${l.idx} — ${l.label} — ${l.expectedKind}`
    ),
    "",
    `Total ${labelList.length} labels. The PDF is attached.`,
  ].join("\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let result: { fields?: VisionFieldResponse[] } | null = null;
  let pageCount = 0;
  try {
    const response = await client.messages.create(
      {
        model: VISION_MODEL,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: params.pdfBuffer.toString("base64"),
                },
              },
              { type: "text", text: userPrompt },
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
    // Anthropic doesn't return the PDF page count separately; we'll
    // derive it from the highest page number across returned fields.
    if (result?.fields) {
      pageCount = result.fields.reduce(
        (max, f) => (f.page > max ? f.page : max),
        0
      );
    }
  } catch (err) {
    console.warn("[vision-positioner] Claude call failed:", err);
    return null;
  }

  if (!result?.fields || result.fields.length === 0) return null;

  const allFields: ParsedFormField[] = [];
  for (const f of result.fields) {
    if (!f.bbox) continue;
    if (f.idx == null && !f.label) continue;
    const detected = labelList.find(
      (l) => l.idx === f.idx || l.label === f.label
    );
    if (!detected) continue;

    allFields.push({
      page: f.page > 0 ? f.page : 1,
      label: detected.label,
      currentValue: detected.expectedKind === "checkbox" ? "false" : "",
      kind: detected.expectedKind === "checkbox" ? "checkbox" : "text",
      labelBbox: null,
      valueBbox: clampBbox(f.bbox),
    });
  }

  if (allFields.length === 0) return null;

  // Page dimensions — we don't know exact PDF point sizes since we
  // didn't render. The overlay uses width/height for aspect-ratio
  // hinting only (the actual rendering uses react-pdf's measured
  // size client-side). Pass standard letter dimensions in points as
  // a placeholder.
  const pages: ParsedPage[] = [];
  for (let i = 1; i <= Math.max(1, pageCount); i++) {
    pages.push({ page: i, width: 612, height: 792 });
  }

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
