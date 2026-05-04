// Stamps draft-field values onto a copy of the requester's uploaded PDF
// using the bbox layout captured during ingestion. Used when fulfilling
// a 3P upload that has a `field_layout` on its third_party_templates row
// — preserves the original document's visual layout instead of rendering
// a brand-new templated PDF.
//
// Coordinate convention:
//   - Document AI normalizedVertices: 0..1, top-left origin
//   - pdf-lib drawing: points, bottom-left origin
//   We translate top-left normalized → bottom-left points per page below.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type OverlayFieldEntry = {
  registryKey: string | null;
  label: string;
  page: number;
  valueBbox: { x: number; y: number; w: number; h: number } | null;
};

export type StampInput = {
  /** Original PDF the requester uploaded. */
  originalPdfBuffer: Buffer;
  /** Per-detected-field bbox info captured by Form Parser ingestion. */
  fieldLayout: OverlayFieldEntry[];
  /** Final values to draw, keyed by registryKey. */
  values: Record<string, string>;
};

/**
 * Returns a new PDF byte array with values drawn at each field's
 * `valueBbox`. Fields without a `registryKey`, an empty value, or a
 * missing bbox are skipped.
 */
export async function stampValuesOntoPdf(input: StampInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.originalPdfBuffer);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const f of input.fieldLayout) {
    if (!f.registryKey) continue;
    if (!f.valueBbox) continue;
    const value = (input.values[f.registryKey] ?? "").trim();
    if (!value) continue;

    const pageIdx = f.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;

    const page = pages[pageIdx];
    const { width: pw, height: ph } = page.getSize();

    const xPts = f.valueBbox.x * pw;
    const boxHpts = f.valueBbox.h * ph;
    const boxWpts = f.valueBbox.w * pw;
    // Top of the box, measured from bottom of the page.
    const topFromBottom = ph - f.valueBbox.y * ph;
    // Baseline: position roughly 75% down inside the box so descenders
    // don't clip on the underline below.
    const fontSize = clamp(boxHpts * 0.7, 7, 14);
    const baseline = topFromBottom - fontSize - Math.max(0, (boxHpts - fontSize) / 4);

    // Truncate to the box width so we don't bleed into adjacent fields.
    const drawText = fitToWidth(value, font, fontSize, boxWpts);

    page.drawText(drawText, {
      x: xPts + 1,
      y: baseline,
      size: fontSize,
      font,
      color: rgb(0.05, 0.1, 0.25),
    });
  }

  return await pdf.save();
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function fitToWidth(
  value: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number
): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  // Trim from the end one char at a time. For value-shaped fields this
  // is rare (the bbox is sized for the answer), but defensive.
  let trimmed = value;
  while (trimmed.length > 1 && font.widthOfTextAtSize(trimmed + "…", size) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length < value.length ? trimmed + "…" : trimmed;
}
