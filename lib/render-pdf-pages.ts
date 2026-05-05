// Server-side PDF→image rendering. Used by the Claude vision positioner
// (lib/vision-field-positioner.ts) when neither the AcroForm fast path
// nor the vendor form template cache has a hit and we need vision to
// SEE where the blanks are. pdfjs-dist + @napi-rs/canvas — both work in
// Vercel's Node.js runtime without native poppler/cairo dependencies.

import { createCanvas } from "@napi-rs/canvas";

export type RenderedPage = {
  page: number;
  /** Rendered width in pixels at the chosen DPI. */
  widthPx: number;
  /** Rendered height in pixels at the chosen DPI. */
  heightPx: number;
  /** Original page width in PDF points (used for back-mapping bboxes). */
  widthPt: number;
  /** Original page height in PDF points (used for back-mapping bboxes). */
  heightPt: number;
  /** PNG bytes for this page. */
  pngBytes: Buffer;
};

const DEFAULT_DPI = 144; // 2x web display density — clear enough for vision

/**
 * Render every page of a PDF buffer to a PNG. Returns a list of rendered
 * pages with their pixel + point dimensions so the caller can normalize
 * any vision-returned coordinates back to 0..1 space.
 *
 * Fails gracefully — encrypted / malformed PDFs throw; caller should
 * catch and fall through to the next positioning layer.
 */
export async function renderPdfPagesToPng(
  pdfBuffer: Buffer,
  dpi: number = DEFAULT_DPI
): Promise<RenderedPage[]> {
  // Use the legacy build — the modern ESM build has top-level await that
  // doesn't play well with Next.js server bundling.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    // Suppress the verbose font-warning log that pdfjs spews when fonts
    // are missing — common with vendor forms and not actionable.
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const out: RenderedPage[] = [];

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const widthPx = Math.ceil(viewport.width);
      const heightPx = Math.ceil(viewport.height);
      const canvas = createCanvas(widthPx, heightPx);
      const ctx = canvas.getContext("2d");

      // pdfjs's render() expects a CanvasRenderingContext2D-shaped target.
      // @napi-rs/canvas's context is API-compatible.
      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      }).promise;

      const pointViewport = page.getViewport({ scale: 1 });

      out.push({
        page: i,
        widthPx,
        heightPx,
        widthPt: pointViewport.width,
        heightPt: pointViewport.height,
        pngBytes: canvas.toBuffer("image/png"),
      });

      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return out;
}
