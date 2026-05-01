import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

import type {
  DocumentTemplate,
  FieldDef,
  SectionConfig,
} from "@/lib/document-templates";
import { getFieldLabel } from "@/lib/document-templates";
import { US_STATES } from "@/lib/us-states";

/* ── Colors ───────────────────────────────────────────────────────────── */

const NAVY = rgb(15 / 255, 23 / 255, 42 / 255); // havn-navy
const GRAY = rgb(100 / 255, 100 / 255, 100 / 255);
const LIGHT_GRAY = rgb(200 / 255, 200 / 255, 200 / 255);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const NAVY_MUTED = rgb(0.8, 0.8, 0.8);
// Soft blue-gray tint used as the background band behind body section titles.
const NAVY_TINT = rgb(239 / 255, 242 / 255, 248 / 255);

/* ── Layout constants ─────────────────────────────────────────────────── */

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_RESERVE = 60;

/* ── Types ────────────────────────────────────────────────────────────── */

export type PdfMeta = {
  orgName: string;
  generatedAt: Date;
  orderId: string;
  /** Two-letter state code used for per-state label overrides. */
  state?: string | null;
  /** Management company logo bytes (PNG or JPEG). Falls back to plain text header when absent. */
  logoBytes?: Uint8Array | null;
  logoMimeType?: "image/png" | "image/jpeg" | null;
  /** Management company contact details, used in the cover letter header. */
  contactEmail?: string | null;
  contactPhone?: string | null;
  mailingAddress?: string | null;
  /** "management_company" uses the mgmt co brand; "self_managed" uses the Havn brand. */
  accountType?: "management_company" | "self_managed" | null;
};

export type SignatureInfo = {
  signerName: string;
  signerTitle?: string | null;
  signedAt: Date;
  /**
   * Either a raw base64 signature image (PNG/JPEG), or a click-to-sign
   * marker such as `"click-to-sign"`. When a marker is provided, the PDF
   * renders a signed-by line with no image.
   */
  signatureData?: string | null;
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatCurrency(raw: string): string {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return raw;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

function formatBoolean(raw: string): "Yes" | "No" | string {
  const v = raw.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return "Yes";
  if (["false", "no", "n", "0"].includes(v)) return "No";
  return raw;
}

function formatValueForDisplay(field: FieldDef, raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  switch (field.type) {
    case "currency":
      return formatCurrency(trimmed);
    case "boolean":
      return formatBoolean(trimmed);
    default:
      return trimmed;
  }
}

function renderMergeTags(
  text: string,
  values: Record<string, string>
): string {
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    return values[key] ?? "";
  });
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    let currentLine = "";
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Like wrapText, but the first line wraps at `firstLineMaxWidth` and every
 * subsequent continuation line wraps at `continuationMaxWidth`. Used to
 * render bold-label paragraphs where the first line must leave room for
 * the bold label and continuation lines flow to the left margin.
 */
function wrapTextWithDifferentFirstLine(
  text: string,
  font: PDFFont,
  size: number,
  firstLineMaxWidth: number,
  continuationMaxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";
  let currentMaxWidth = firstLineMaxWidth;
  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > currentMaxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentMaxWidth = continuationMaxWidth;
      }
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function sectionIsVisible(
  config: SectionConfig | undefined,
  fields: Record<string, string>
): boolean {
  const condition = config?.condition ?? "always";
  if (condition === "always") return true;
  const fieldValue = (fields[condition.field] ?? "").trim().toLowerCase();
  const expected = String(condition.equals).toLowerCase();
  return fieldValue === expected;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Render a document PDF using the supplied template + resolved field values.
 *
 * Layout (when the template opts in):
 *   page 1     — cover letter
 *   page 2..N  — document body, section by section
 *   page N+1   — certification, signature, disclaimer
 *
 * Legacy templates (no coverLetter / legalLanguage / expirationDays) render
 * body-only, preserving the pre-Phase-2 behavior for existing generic templates.
 */
export async function generateDocumentPdf(
  template: DocumentTemplate,
  fields: Record<string, string | null>,
  meta: PdfMeta,
  signature?: SignatureInfo
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);

  // Normalize values so merge-tag expansion always hits strings.
  const textValues: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    textValues[key] = (fields[key] ?? "").toString().trim();
  }
  // Template-derived tags available inside cover letter / legal language.
  if (template.statute) textValues.statute = template.statute.replace(/^Per\s+/i, "");
  if (template.expirationDays != null) textValues.expiration_days = String(template.expirationDays);
  if (!textValues.management_company) textValues.management_company = meta.orgName;
  if (!textValues.management_contact_email && meta.contactEmail)
    textValues.management_contact_email = meta.contactEmail;
  if (!textValues.management_contact_phone && meta.contactPhone)
    textValues.management_contact_phone = meta.contactPhone;

  // Signature-derived tags — populated when the template references a
  // preparer/issue-date/title tag that would otherwise come up empty.
  const issueDate = (signature?.signedAt ?? meta.generatedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (!textValues.certificate_issue_date) textValues.certificate_issue_date = issueDate;
  if (signature && !textValues.certificate_preparer_name) {
    textValues.certificate_preparer_name = signature.signerName;
  }
  if (signature?.signerTitle && !textValues.signer_title) {
    textValues.signer_title = signature.signerTitle;
  }

  // Buyer defaults to the requester when not explicitly filled.
  if (!textValues.buyer_name && textValues.requester_name) {
    textValues.buyer_name = textValues.requester_name;
  }

  const expiresAt =
    template.expirationDays != null
      ? new Date(meta.generatedAt.getTime() + template.expirationDays * 86400000)
      : null;

  // Embed logo once for reuse across pages.
  let logoImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (meta.logoBytes && meta.logoBytes.length > 0) {
    try {
      logoImage =
        meta.logoMimeType === "image/jpeg"
          ? await pdf.embedJpg(meta.logoBytes)
          : await pdf.embedPng(meta.logoBytes);
    } catch (err) {
      console.warn("[pdf-generator] Logo embed failed:", err);
    }
  }

  // Footers are drawn in a single post-pass once `pages.length` is final.
  // While rendering we leave the footer area blank so nothing gets overwritten.
  const pages: PDFPage[] = [];

  function newPage(): PDFPage {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    return page;
  }

  /* ── Page 1: Cover letter (optional) ────────────────────────────── */

  let page: PDFPage;
  let y: number;

  if (template.coverLetter?.enabled) {
    page = newPage();
    y = PAGE_HEIGHT - MARGIN;

    // Logo-only letterhead — the letter body is responsible for every
    // textual element (date, To:, RE:, signature block, management
    // company name, etc.) so each template controls its own format.
    if (logoImage) {
      const targetHeight = 48;
      const scale = targetHeight / logoImage.height;
      const width = logoImage.width * scale;
      page.drawImage(logoImage, {
        x: MARGIN,
        y: y - targetHeight,
        width,
        height: targetHeight,
      });
      y -= targetHeight + 14;
    } else {
      // No logo: start close to the top so the letter fits on one page.
      y -= 6;
    }

    // Body — labels and structure come from the template's cover-letter
    // string. Legal memos run long; use tight body settings so the full
    // letter fits on one page.
    //
    // Rich rendering rules:
    //   - Lines starting with "RE:" / "Re:" → bold navy heading.
    //   - Lines starting with "- " or "• " → bullet with indent + wrap.
    //   - Paragraphs matching "<Label>: <rest>" → bold label, regular rest.
    const COVER_BODY_SIZE = 10;
    const COVER_LINE_HEIGHT = 13;
    const COVER_BLANK_HEIGHT = 5;
    const COVER_RE_SIZE = 11;
    const COVER_RE_LINE_HEIGHT = 15;
    const BULLET_INDENT = 14;

    const body = renderMergeTags(template.coverLetter.template, textValues);
    const paragraphs = body.split(/\n/);
    const RE_LINE_RE = /^\s*RE:/i;
    const LABEL_LINE_RE = /^([A-Z][A-Za-z0-9 &/()\-']{1,60}):\s*(.*)$/;

    for (const paragraph of paragraphs) {
      if (y < FOOTER_RESERVE + 20) {
        page = newPage();
        y = PAGE_HEIGHT - MARGIN;
      }
      if (paragraph.trim() === "") {
        y -= COVER_BLANK_HEIGHT;
        continue;
      }

      // RE: heading
      if (RE_LINE_RE.test(paragraph)) {
        page.drawText(paragraph, {
          x: MARGIN,
          y,
          size: COVER_RE_SIZE,
          font: fontBold,
          color: NAVY,
        });
        y -= COVER_RE_LINE_HEIGHT;
        continue;
      }

      // Bullet line (supports "- " and "• ")
      if (/^\s*(?:-|•)\s+/.test(paragraph)) {
        const content = paragraph.replace(/^\s*(?:-|•)\s+/, "");
        const wrapped = wrapText(
          content,
          fontRegular,
          COVER_BODY_SIZE,
          CONTENT_WIDTH - BULLET_INDENT
        );
        for (let i = 0; i < wrapped.length; i++) {
          if (y < FOOTER_RESERVE + 20) {
            page = newPage();
            y = PAGE_HEIGHT - MARGIN;
          }
          if (i === 0) {
            page.drawText("•", {
              x: MARGIN + 4,
              y,
              size: COVER_BODY_SIZE,
              font: fontBold,
              color: NAVY,
            });
          }
          page.drawText(wrapped[i], {
            x: MARGIN + BULLET_INDENT,
            y,
            size: COVER_BODY_SIZE,
            font: fontRegular,
            color: BLACK,
          });
          y -= COVER_LINE_HEIGHT;
        }
        continue;
      }

      // Labeled paragraph: bold label, regular rest wrapped beside it then
      // flowing back to the left margin on continuation lines.
      const labelMatch = paragraph.match(LABEL_LINE_RE);
      if (labelMatch && labelMatch[2]?.trim()) {
        const label = labelMatch[1] + ":";
        const rest = labelMatch[2];
        const labelWithSpace = label + " ";
        const labelWidth = fontBold.widthOfTextAtSize(labelWithSpace, COVER_BODY_SIZE);
        const restLines = wrapTextWithDifferentFirstLine(
          rest,
          fontRegular,
          COVER_BODY_SIZE,
          CONTENT_WIDTH - labelWidth,
          CONTENT_WIDTH
        );
        // Line 1: label bold + first wrapped line regular, side by side.
        page.drawText(label, {
          x: MARGIN,
          y,
          size: COVER_BODY_SIZE,
          font: fontBold,
          color: BLACK,
        });
        if (restLines.length > 0) {
          page.drawText(restLines[0], {
            x: MARGIN + labelWidth,
            y,
            size: COVER_BODY_SIZE,
            font: fontRegular,
            color: BLACK,
          });
        }
        y -= COVER_LINE_HEIGHT;
        // Continuation lines start back at MARGIN.
        for (let i = 1; i < restLines.length; i++) {
          if (y < FOOTER_RESERVE + 20) {
            page = newPage();
            y = PAGE_HEIGHT - MARGIN;
          }
          page.drawText(restLines[i], {
            x: MARGIN,
            y,
            size: COVER_BODY_SIZE,
            font: fontRegular,
            color: BLACK,
          });
          y -= COVER_LINE_HEIGHT;
        }
        continue;
      }

      // Plain paragraph — wrap normally.
      const wrapped = wrapText(paragraph, fontRegular, COVER_BODY_SIZE, CONTENT_WIDTH);
      for (const line of wrapped) {
        if (y < FOOTER_RESERVE + 20) {
          page = newPage();
          y = PAGE_HEIGHT - MARGIN;
        }
        page.drawText(line, {
          x: MARGIN,
          y,
          size: COVER_BODY_SIZE,
          font: fontRegular,
          color: BLACK,
        });
        y -= COVER_LINE_HEIGHT;
      }
    }
  }

  /* ── Page 2+: Document body ─────────────────────────────────────── */

  page = newPage();

  // ── State header band ─────────────────────────────────────────────
  // For state templates, the title may already reference the state
  // (e.g. "Washington Resale Certificate"). Use the title verbatim rather
  // than prepending "STATE OF X —" which produces "STATE OF WASHINGTON —
  // WASHINGTON RESALE CERTIFICATE".
  const dateStr = meta.generatedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dateWidth = fontRegular.widthOfTextAtSize(dateStr, 10);

  // Figure out how the header should be laid out based on title length
  // + statute length, then size the header band to fit.
  const titleText = template.state
    ? template.title.toUpperCase()
    : template.title;
  const titleSize = template.state ? 14 : 18;
  const titleFont = fontBold;
  const titleMaxWidth = CONTENT_WIDTH - dateWidth - 24;
  const titleLines = wrapText(titleText, titleFont, titleSize, titleMaxWidth);

  let statuteLines: string[] = [];
  if (template.state && template.statute) {
    statuteLines = wrapText(template.statute, fontRegular, 9, CONTENT_WIDTH);
    // Keep the header compact — max 3 lines of statute.
    if (statuteLines.length > 3) statuteLines = statuteLines.slice(0, 3);
  } else if (!template.state) {
    statuteLines = [`Prepared by ${meta.orgName}`];
  }

  const titleLineHeight = titleSize + 4;
  const statuteLineHeight = 12;
  const headerHeight = Math.max(
    60,
    20 + titleLines.length * titleLineHeight + statuteLines.length * statuteLineHeight + 12
  );

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - headerHeight,
    width: PAGE_WIDTH,
    height: headerHeight,
    color: NAVY,
  });

  // Title (may wrap)
  let titleY = PAGE_HEIGHT - 20 - titleSize;
  for (const line of titleLines) {
    page.drawText(line, {
      x: MARGIN,
      y: titleY,
      size: titleSize,
      font: titleFont,
      color: WHITE,
    });
    titleY -= titleLineHeight;
  }

  // Statute (may wrap for state templates)
  let statuteY = titleY;
  for (const line of statuteLines) {
    page.drawText(line, {
      x: MARGIN,
      y: statuteY,
      size: 9,
      font: fontRegular,
      color: NAVY_MUTED,
    });
    statuteY -= statuteLineHeight;
  }

  // Date — anchored to the top-right corner of the header band so it
  // never collides with wrapped title text.
  page.drawText(dateStr, {
    x: PAGE_WIDTH - MARGIN - dateWidth,
    y: PAGE_HEIGHT - 20 - 10,
    size: 10,
    font: fontRegular,
    color: NAVY_MUTED,
  });

  y = PAGE_HEIGHT - headerHeight - 24;

  function ensureSpace(needed: number): void {
    if (y - needed < FOOTER_RESERVE) {
      page = newPage();
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  // Sections
  for (const sectionName of template.sections) {
    const sectionFields = template.fields.filter((f) => f.section === sectionName);
    const sectionHasData = sectionFields.some((f) => {
      const v = textValues[f.key] ?? "";
      return v.trim() !== "";
    });
    const cfg = template.sectionConfig?.[sectionName];
    if (!sectionIsVisible(cfg, textValues)) continue;

    ensureSpace(52);
    // Section header — solid navy-tinted band with bold navy text. Easier
    // to pick out than the old thin underline. A 4pt left accent stripe
    // reinforces the visual weight without adding clutter.
    y -= 18;
    const bandHeight = 22;
    const bandY = y - 6;
    page.drawRectangle({
      x: MARGIN,
      y: bandY,
      width: CONTENT_WIDTH,
      height: bandHeight,
      color: NAVY_TINT,
    });
    page.drawRectangle({
      x: MARGIN,
      y: bandY,
      width: 4,
      height: bandHeight,
      color: NAVY,
    });
    page.drawText(sectionName.toUpperCase(), {
      x: MARGIN + 12,
      y,
      size: 10,
      font: fontBold,
      color: NAVY,
    });
    y -= 22;

    if (!sectionHasData) {
      const emptyText = cfg?.emptyText ?? "None";
      ensureSpace(20);
      page.drawText(emptyText, {
        x: MARGIN + 4,
        y,
        size: 10,
        font: fontRegular,
        color: GRAY,
      });
      y -= 18;
      continue;
    }

    for (const field of sectionFields) {
      const raw = textValues[field.key] ?? "";
      if (raw.trim() === "") continue; // hide empty detail fields
      const label = getFieldLabel(field.key, meta.state ?? template.state ?? null);
      const display = formatValueForDisplay(field, raw);

      if (field.type === "textarea") {
        const lines = wrapText(display, fontRegular, 10, CONTENT_WIDTH - 8);
        ensureSpace(20 + lines.length * 14);
        page.drawText(label, {
          x: MARGIN,
          y,
          size: 9,
          font: fontBold,
          color: GRAY,
        });
        y -= 14;
        for (const line of lines) {
          ensureSpace(14);
          page.drawText(line, {
            x: MARGIN + 4,
            y,
            size: 10,
            font: fontRegular,
            color: BLACK,
          });
          y -= 14;
        }
        y -= 4;
      } else if (field.type === "boolean") {
        ensureSpace(20);
        page.drawText(label, {
          x: MARGIN,
          y,
          size: 9,
          font: fontBold,
          color: GRAY,
        });
        const labelWidth = fontBold.widthOfTextAtSize(label, 9);
        let cursorX = MARGIN + labelWidth + 12;
        const boxSize = 9;
        const boxY = y - 1;

        const drawCheckbox = (checked: boolean, optionLabel: string) => {
          page.drawRectangle({
            x: cursorX,
            y: boxY,
            width: boxSize,
            height: boxSize,
            borderColor: BLACK,
            borderWidth: 1,
            ...(checked ? { color: BLACK } : {}),
          });
          cursorX += boxSize + 4;
          page.drawText(optionLabel, {
            x: cursorX,
            y,
            size: 10,
            font: fontRegular,
            color: BLACK,
          });
          cursorX += fontRegular.widthOfTextAtSize(optionLabel, 10) + 14;
        };

        drawCheckbox(display === "Yes", "Yes");
        drawCheckbox(display === "No", "No");
        y -= 18;
      } else {
        ensureSpace(20);
        page.drawText(label, {
          x: MARGIN,
          y,
          size: 9,
          font: fontBold,
          color: GRAY,
        });
        const labelWidth = fontBold.widthOfTextAtSize(label, 9);
        const valueX = MARGIN + labelWidth + 12;
        const maxValueWidth = PAGE_WIDTH - MARGIN - valueX;

        if (fontRegular.widthOfTextAtSize(display, 10) <= maxValueWidth) {
          // Fits on the same line as the label.
          page.drawText(display, {
            x: valueX,
            y,
            size: 10,
            font: fontRegular,
            color: BLACK,
          });
          y -= 18;
        } else {
          // Wrap long values — render the label on the current line, then
          // drop the value beneath it at a slight indent. This gives long
          // strings (statute references, mailing addresses, etc.) room to
          // breathe rather than getting ellipsized.
          y -= 14;
          const lines = wrapText(display, fontRegular, 10, CONTENT_WIDTH - 8);
          for (const line of lines) {
            ensureSpace(14);
            page.drawText(line, {
              x: MARGIN + 4,
              y,
              size: 10,
              font: fontRegular,
              color: BLACK,
            });
            y -= 14;
          }
          y -= 4;
        }
      }
    }
  }

  /* ── Signature & disclaimer page ────────────────────────────────── */

  const needsSignaturePage =
    template.requiresSignature || !!template.legalLanguage || !!template.disclaimer;

  if (needsSignaturePage) {
    page = newPage();
    y = PAGE_HEIGHT - MARGIN;

    if (template.legalLanguage?.requiredDisclosures?.length) {
      page.drawText("REQUIRED DISCLOSURES", {
        x: MARGIN,
        y,
        size: 10,
        font: fontBold,
        color: NAVY,
      });
      y -= 18;
      for (const disclosure of template.legalLanguage.requiredDisclosures) {
        const rendered = renderMergeTags(disclosure, textValues);
        const lines = wrapText(rendered, fontRegular, 10, CONTENT_WIDTH);
        for (const line of lines) {
          ensureSpace(14);
          page.drawText(line, { x: MARGIN, y, size: 10, font: fontRegular, color: BLACK });
          y -= 14;
        }
        y -= 8;
      }
      y -= 8;
    }

    // Certification block — measure first so we can force a fresh page
    // when the block plus the signature line won't fit together. This
    // prevents the paragraph from orphan-splitting across pages.
    const certText =
      template.legalLanguage?.certificationText ??
      "I hereby certify that the information provided above is true and accurate to the best of my knowledge.";
    const certLines = wrapText(renderMergeTags(certText, textValues), fontRegular, 10, CONTENT_WIDTH);
    const certBlockHeight = certLines.length * 14 + 16 + 60; // text + spacing + signature reserve
    if (y - certBlockHeight < FOOTER_RESERVE) {
      page = newPage();
      y = PAGE_HEIGHT - MARGIN;
    }
    for (const line of certLines) {
      page.drawText(line, { x: MARGIN, y, size: 10, font: fontRegular, color: BLACK });
      y -= 14;
    }
    y -= 16;

    // Signature line / signed stamp
    ensureSpace(60);
    if (signature) {
      const signedDate = signature.signedAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      page.drawText("Authorized Signature:", {
        x: MARGIN,
        y,
        size: 9,
        font: fontBold,
        color: GRAY,
      });
      y -= 16;

      // Signature image if supplied (otherwise click-to-sign line)
      if (signature.signatureData && signature.signatureData !== "click-to-sign") {
        try {
          const bytes = Uint8Array.from(Buffer.from(signature.signatureData, "base64"));
          const sigImg = signature.signatureData.startsWith("/9j/")
            ? await pdf.embedJpg(bytes)
            : await pdf.embedPng(bytes);
          const targetHeight = 36;
          const scale = targetHeight / sigImg.height;
          const sigWidth = sigImg.width * scale;
          page.drawImage(sigImg, { x: MARGIN, y: y - targetHeight, width: sigWidth, height: targetHeight });
          y -= targetHeight + 4;
        } catch {
          page.drawText("(signature on file)", {
            x: MARGIN,
            y,
            size: 10,
            font: fontRegular,
            color: BLACK,
          });
          y -= 18;
        }
      } else {
        page.drawText("Signed electronically", {
          x: MARGIN,
          y,
          size: 10,
          font: fontRegular,
          color: BLACK,
        });
        y -= 18;
      }

      page.drawText(
        `${signature.signerName}${signature.signerTitle ? ", " + signature.signerTitle : ""}  —  ${signedDate}`,
        { x: MARGIN, y, size: 10, font: fontRegular, color: BLACK }
      );
      y -= 20;
    } else if (template.requiresSignature) {
      page.drawText("Authorized by: ______________________________", {
        x: MARGIN,
        y,
        size: 10,
        font: fontRegular,
        color: BLACK,
      });
      y -= 20;
      page.drawText("Date: ______________", {
        x: MARGIN,
        y,
        size: 10,
        font: fontRegular,
        color: BLACK,
      });
      y -= 24;
    }

    // Disclaimer
    const disclaimer =
      template.legalLanguage?.disclaimerText ??
      template.disclaimer ??
      `Information provided by ${meta.orgName}. Havn does not independently verify accuracy.`;
    const disclaimerLines = wrapText(
      renderMergeTags(disclaimer, textValues),
      fontRegular,
      8,
      CONTENT_WIDTH
    );
    ensureSpace(disclaimerLines.length * 10 + 12);
    y -= 8;
    for (const line of disclaimerLines) {
      page.drawText(line, { x: MARGIN, y, size: 8, font: fontRegular, color: GRAY });
      y -= 10;
    }
  }

  /* ── Final footers (single clean pass) ──────────────────────────── */

  const total = pages.length;
  const shortOrder = meta.orderId.slice(0, 8);
  const brand = meta.accountType === "self_managed" ? "Havn" : meta.orgName;
  const poweredBy = "Powered by Havn";
  const validUntil = expiresAt
    ? `Valid until ${expiresAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : null;

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];

    // Left: "Powered by Havn"
    p.drawText(poweredBy, {
      x: MARGIN,
      y: 30,
      size: 8,
      font: fontRegular,
      color: GRAY,
    });

    // Right: [Brand] · Order #xxxxxxxx · Valid until … · Page X of Y
    const rightSegments = [
      brand,
      `Order #${shortOrder}`,
      ...(validUntil ? [validUntil] : []),
      `Page ${i + 1} of ${total}`,
    ];
    const rightText = rightSegments.join("  ·  ");
    const rightWidth = fontRegular.widthOfTextAtSize(rightText, 8);
    p.drawText(rightText, {
      x: PAGE_WIDTH - MARGIN - rightWidth,
      y: 30,
      size: 8,
      font: fontRegular,
      color: GRAY,
    });
  }

  return pdf.save();
}

/* ── State name lookup ─────────────────────────────────────────────── */

function stateDisplayName(abbr: string): string {
  const match = US_STATES.find((s) => s.abbr === abbr.toUpperCase());
  return match?.name ?? abbr.toUpperCase();
}
