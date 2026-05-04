// Document AI Form Parser wrapper. Returns per-form-field bounding boxes
// in normalized (0..1) coords + page dimensions so the staff review UI
// can lay HTML inputs over a rendered copy of the PDF, and the delivery
// flow can stamp values onto the original PDF at the same coordinates.
//
// Falls back gracefully when no form processor is configured — the
// pipeline still works, the overlay UI just hides itself.

import {
  FORM_PROCESSOR_NAME,
  createDocumentAIClient,
} from "@/lib/google-document-ai";
import { splitPdfIntoChunks } from "@/lib/pdf-text";
import { withTimeout } from "@/lib/timeout";

const FORM_PARSER_TIMEOUT_MS = 90_000;

export type NormalizedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ParsedFormField = {
  /** Page number, 1-indexed in the *original* PDF. */
  page: number;
  /** Cleaned label text (Form Parser's fieldName.textAnchor). */
  label: string;
  /** Existing pre-filled value, if Document AI detected one. */
  currentValue: string;
  /** Bounding box of the label, in normalized 0..1 coords. */
  labelBbox: NormalizedRect | null;
  /** Bounding box of the blank/value cell, in normalized 0..1 coords. */
  valueBbox: NormalizedRect | null;
};

export type ParsedPage = {
  page: number;
  /** Page width in points. */
  width: number;
  /** Page height in points. */
  height: number;
};

export type ParsedFormLayout = {
  pages: ParsedPage[];
  fields: ParsedFormField[];
};

/**
 * Send the PDF (or DOCX) through the Form Parser processor and return a
 * normalized layout. Returns null when no form processor is configured
 * or when the parser declined the document.
 */
export async function parseFormLayout(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParsedFormLayout | null> {
  if (!FORM_PROCESSOR_NAME) return null;
  if (mimeType !== "application/pdf") return null;

  const client = createDocumentAIClient();
  const chunks = await splitPdfIntoChunks(fileBuffer);

  const allPages: ParsedPage[] = [];
  const allFields: ParsedFormField[] = [];
  let pageOffset = 0;

  for (const chunk of chunks) {
    const [result] = await withTimeout(
      client.processDocument({
        name: FORM_PROCESSOR_NAME,
        rawDocument: {
          content: chunk.toString("base64"),
          mimeType,
        },
      }),
      FORM_PARSER_TIMEOUT_MS,
      "Document AI Form Parser"
    );

    const fullText = result.document?.text ?? "";
    const pages = result.document?.pages ?? [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = pageOffset + i + 1;
      const dim = page.dimension;
      const width = (dim?.width as number | null | undefined) ?? 0;
      const height = (dim?.height as number | null | undefined) ?? 0;
      allPages.push({
        page: pageNumber,
        width,
        height,
      });

      for (const ff of page.formFields ?? []) {
        const labelText = readTextAnchor(fullText, ff.fieldName?.textAnchor)
          ?.replace(/[\r\n]+/g, " ")
          .replace(/\s+/g, " ")
          .replace(/[:_]+\s*$/, "")
          .trim();
        if (!labelText) continue;
        const valueText = readTextAnchor(fullText, ff.fieldValue?.textAnchor)
          ?.replace(/[\r\n]+/g, " ")
          .replace(/\s+/g, " ")
          .trim() ?? "";

        allFields.push({
          page: pageNumber,
          label: labelText,
          currentValue: valueText,
          labelBbox: extractNormalizedBbox(ff.fieldName?.boundingPoly),
          valueBbox: extractNormalizedBbox(ff.fieldValue?.boundingPoly),
        });
      }
    }

    pageOffset += pages.length;
  }

  return { pages: allPages, fields: allFields };
}

/**
 * Cross-reference the Form Parser output with the universal extractor's
 * label→registryKey mapping. Returns one entry per form field; entries
 * without a registry key are still useful for the overlay (staff can
 * type there but it won't auto-fill).
 */
export type RegistryFieldLayout = {
  registryKey: string | null;
  label: string;
  page: number;
  valueBbox: NormalizedRect | null;
  labelBbox: NormalizedRect | null;
  currentValue: string;
};

export function attachRegistryKeys(
  layout: ParsedFormLayout,
  registryMap: Array<{ label: string; registryKey: string | null }>
): RegistryFieldLayout[] {
  // Build a quick label-lookup. Form Parser labels can vary slightly
  // from what the universal extractor emits, so normalize both sides
  // and match case-insensitively.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[:_*]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const indexedRegistry = new Map<string, string | null>();
  for (const entry of registryMap) {
    if (!entry.label) continue;
    indexedRegistry.set(norm(entry.label), entry.registryKey);
  }

  return layout.fields.map((f) => {
    const direct = indexedRegistry.get(norm(f.label)) ?? null;
    let registryKey: string | null = direct;

    // If no direct hit, try the registry's prefix/suffix matching as a
    // forgiveness layer (form parser sometimes carries trailing words).
    if (registryKey == null) {
      const target = norm(f.label);
      for (const [k, v] of indexedRegistry.entries()) {
        if (k === target || target.startsWith(k) || k.startsWith(target)) {
          registryKey = v;
          break;
        }
      }
    }

    return {
      registryKey,
      label: f.label,
      page: f.page,
      valueBbox: f.valueBbox,
      labelBbox: f.labelBbox,
      currentValue: f.currentValue,
    };
  });
}

/* ── internals ───────────────────────────────────────────────────────── */

function readTextAnchor(fullText: string, anchor: unknown): string | null {
  const a = anchor as
    | {
        textSegments?:
          | Array<{ startIndex?: string | number | null; endIndex?: string | number | null }>
          | null;
      }
    | null
    | undefined;
  const segments = a?.textSegments;
  if (!segments || segments.length === 0) return null;
  const parts: string[] = [];
  for (const seg of segments) {
    const start = Number(seg.startIndex ?? 0);
    const end = Number(seg.endIndex ?? 0);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      parts.push(fullText.slice(start, end));
    }
  }
  return parts.join("").trim() || null;
}

function extractNormalizedBbox(boundingPoly: unknown): NormalizedRect | null {
  const bp = boundingPoly as
    | {
        normalizedVertices?: Array<{ x?: number | null; y?: number | null }> | null;
        vertices?: Array<{ x?: number | null; y?: number | null }> | null;
      }
    | null
    | undefined;
  const verts = bp?.normalizedVertices ?? null;
  if (!verts || verts.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const v of verts) {
    const x = clamp01(Number(v.x ?? 0));
    const y = clamp01(Number(v.y ?? 0));
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  if (w === 0 || h === 0) return null;
  return { x: minX, y: minY, w, h };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
