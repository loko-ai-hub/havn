import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { DocumentTemplate } from "@/lib/document-templates";

const NAVY = rgb(15 / 255, 23 / 255, 42 / 255); // havn-navy
const GRAY = rgb(100 / 255, 100 / 255, 100 / 255);
const LIGHT_GRAY = rgb(200 / 255, 200 / 255, 200 / 255);
const BLACK = rgb(0, 0, 0);

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type PdfMeta = {
  orgName: string;
  generatedAt: Date;
  orderId: string;
};

export async function generateDocumentPdf(
  template: DocumentTemplate,
  fields: Record<string, string | null>,
  meta: PdfMeta
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageNum = 1;

  function newPage() {
    addFooter();
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    pageNum++;
  }

  function addFooter() {
    page.drawText(`${meta.orgName}  |  Order ${meta.orderId.slice(0, 8)}  |  Page ${pageNum}`, {
      x: MARGIN,
      y: 30,
      size: 8,
      font: fontRegular,
      color: GRAY,
    });
  }

  function checkSpace(needed: number) {
    if (y - needed < 60) newPage();
  }

  // ── Header ──
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 80,
    width: PAGE_WIDTH,
    height: 80,
    color: NAVY,
  });

  page.drawText(template.title, {
    x: MARGIN,
    y: PAGE_HEIGHT - 45,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`Prepared by ${meta.orgName}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 63,
    size: 10,
    font: fontRegular,
    color: rgb(0.8, 0.8, 0.8),
  });

  const dateStr = meta.generatedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dateWidth = fontRegular.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, {
    x: PAGE_WIDTH - MARGIN - dateWidth,
    y: PAGE_HEIGHT - 45,
    size: 10,
    font: fontRegular,
    color: rgb(0.8, 0.8, 0.8),
  });

  y = PAGE_HEIGHT - 100;

  // ── Sections ──
  for (const sectionName of template.sections) {
    const sectionFields = template.fields.filter((f) => f.section === sectionName);
    if (sectionFields.length === 0) continue;

    checkSpace(40);

    // Section header
    y -= 20;
    page.drawRectangle({
      x: MARGIN,
      y: y - 2,
      width: CONTENT_WIDTH,
      height: 1,
      color: LIGHT_GRAY,
    });
    y -= 6;
    page.drawText(sectionName.toUpperCase(), {
      x: MARGIN,
      y,
      size: 9,
      font: fontBold,
      color: NAVY,
    });
    y -= 18;

    // Fields
    for (const field of sectionFields) {
      const value = fields[field.key]?.trim() || "N/A";

      // For textareas, allow wrapping
      const isLong = field.type === "textarea" && value.length > 80;
      const lineHeight = 14;

      if (isLong) {
        // Wrap long text
        const words = value.split(/\s+/);
        const lines: string[] = [];
        let currentLine = "";
        for (const word of words) {
          const test = currentLine ? `${currentLine} ${word}` : word;
          if (fontRegular.widthOfTextAtSize(test, 10) > CONTENT_WIDTH - 10) {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = test;
          }
        }
        if (currentLine) lines.push(currentLine);

        checkSpace(20 + lines.length * lineHeight);

        // Label
        page.drawText(field.label, {
          x: MARGIN,
          y,
          size: 9,
          font: fontBold,
          color: GRAY,
        });
        y -= lineHeight;

        // Wrapped value
        for (const line of lines) {
          page.drawText(line, {
            x: MARGIN + 4,
            y,
            size: 10,
            font: fontRegular,
            color: BLACK,
          });
          y -= lineHeight;
        }
        y -= 4;
      } else {
        checkSpace(30);

        // Label
        page.drawText(field.label, {
          x: MARGIN,
          y,
          size: 9,
          font: fontBold,
          color: GRAY,
        });

        // Value — right-aligned or next to label
        const labelWidth = fontBold.widthOfTextAtSize(field.label, 9);
        const valueX = MARGIN + labelWidth + 12;
        const maxValueWidth = PAGE_WIDTH - MARGIN - valueX;
        const displayValue =
          fontRegular.widthOfTextAtSize(value, 10) > maxValueWidth
            ? value.slice(0, 60) + "..."
            : value;

        page.drawText(displayValue, {
          x: valueX,
          y,
          size: 10,
          font: fontRegular,
          color: value === "N/A" ? GRAY : BLACK,
        });
        y -= 18;
      }
    }
  }

  // Final footer
  addFooter();

  return pdf.save();
}
