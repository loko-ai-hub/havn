import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Combine the main issued document with a set of community-document
 * attachments into a single delivered PDF.
 *
 * Package layout:
 *   1. Main document (cover letter + body + signature, as produced by
 *      generateDocumentPdf)
 *   2. Table-of-contents divider page listing each attachment in order
 *   3. Each attachment appended in the configured order
 *
 * Non-PDF attachments are skipped with a warning — the caller should only
 * pass in PDFs.
 */

const NAVY = rgb(15 / 255, 23 / 255, 42 / 255);
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(100 / 255, 100 / 255, 100 / 255);
const LIGHT_GRAY = rgb(200 / 255, 200 / 255, 200 / 255);

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export type PackageAttachment = {
  /** Human-facing category name (e.g. "CC&Rs / Declaration"). */
  category: string;
  /** Specific document title (falls back to category when absent). */
  title?: string | null;
  /** PDF bytes to append. */
  bytes: Uint8Array;
};

export type PackageMeta = {
  /** Title shown atop the TOC divider page. */
  mainDocumentTitle: string;
  /** Organization brand used in the TOC divider. */
  orgName: string;
};

export async function packageDocumentBundle(
  mainPdfBytes: Uint8Array,
  attachments: PackageAttachment[],
  meta: PackageMeta
): Promise<Uint8Array> {
  // If there are no attachments, return the main PDF unchanged.
  if (attachments.length === 0) return mainPdfBytes;

  const output = await PDFDocument.create();
  const fontBold = await output.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await output.embedFont(StandardFonts.Helvetica);

  // 1. Copy the main PDF page-by-page.
  const mainDoc = await PDFDocument.load(mainPdfBytes);
  const mainPages = await output.copyPages(mainDoc, mainDoc.getPageIndices());
  const mainPageCount = mainPages.length;
  for (const p of mainPages) output.addPage(p);

  // 2. Precompute attachment page counts for the TOC.
  type LoadedAttachment = PackageAttachment & {
    doc: PDFDocument;
    pageCount: number;
    startPage: number;
  };
  const loaded: LoadedAttachment[] = [];
  const tocStartPage = mainPageCount + 1; // TOC itself is 1 page
  let runningPage = tocStartPage + 1;
  for (const att of attachments) {
    try {
      const doc = await PDFDocument.load(att.bytes);
      const pageCount = doc.getPageCount();
      loaded.push({ ...att, doc, pageCount, startPage: runningPage });
      runningPage += pageCount;
    } catch (err) {
      console.warn(`[pdf-packager] Skipping non-PDF / corrupt attachment "${att.title ?? att.category}":`, err);
    }
  }

  // 3. Draw the TOC page.
  const tocPage = output.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Header band
  tocPage.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 80,
    width: PAGE_WIDTH,
    height: 80,
    color: NAVY,
  });
  tocPage.drawText("DOCUMENT PACKAGE", {
    x: MARGIN,
    y: PAGE_HEIGHT - 42,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  tocPage.drawText(`Prepared by ${meta.orgName}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 60,
    size: 10,
    font: fontRegular,
    color: rgb(0.8, 0.8, 0.8),
  });

  let y = PAGE_HEIGHT - 120;
  tocPage.drawText("TABLE OF CONTENTS", {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: NAVY,
  });
  y -= 6;
  tocPage.drawRectangle({
    x: MARGIN,
    y,
    width: CONTENT_WIDTH,
    height: 1,
    color: LIGHT_GRAY,
  });
  y -= 20;

  // Main document row
  drawTocRow(
    tocPage,
    meta.mainDocumentTitle,
    "Page 1",
    y,
    fontRegular,
    fontBold
  );
  y -= 20;

  for (const att of loaded) {
    const title = att.title?.trim() ? att.title : att.category;
    const label = `${att.category}${att.title && att.title !== att.category ? ` — ${att.title}` : ""}`;
    drawTocRow(
      tocPage,
      label,
      `Page ${att.startPage}`,
      y,
      fontRegular,
      fontBold
    );
    y -= 20;
    if (y < 100) break; // TOC fits on one page; the rest are still in the PDF, just not listed
    // Suppress "title" lint — distinguish from "label" for clarity
    void title;
  }

  // 4. Append each attachment.
  for (const att of loaded) {
    const copied = await output.copyPages(att.doc, att.doc.getPageIndices());
    for (const p of copied) output.addPage(p);
  }

  return output.save();
}

function drawTocRow(
  page: ReturnType<PDFDocument["addPage"]>,
  label: string,
  pageRef: string,
  y: number,
  fontRegular: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>
): void {
  const truncated =
    fontRegular.widthOfTextAtSize(label, 10) > CONTENT_WIDTH - 80
      ? label.slice(0, 70) + "…"
      : label;
  page.drawText(truncated, {
    x: MARGIN,
    y,
    size: 10,
    font: fontRegular,
    color: BLACK,
  });
  const w = fontBold.widthOfTextAtSize(pageRef, 9);
  page.drawText(pageRef, {
    x: PAGE_WIDTH - MARGIN - w,
    y,
    size: 9,
    font: fontBold,
    color: GRAY,
  });
}
