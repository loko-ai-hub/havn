// AcroForm fast path for the 3P upload pipeline. When a vendor PDF is a
// fillable PDF (an AcroForm), pdf-lib can read the form fields directly —
// label, type, and visual position — without involving Document AI Form
// Parser, the OCR token synthesis, or Claude vision. Most modern title-
// company and lender forms (post ~2018) ship as AcroForms; older
// flattened scans don't and fall through to the next layer.
//
// Returns null when the PDF has no AcroForm or when the form is empty so
// the pipeline can keep walking the layered fallbacks (template cache,
// Form Parser, vision, synthesis).

import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  type PDFField,
  type PDFForm,
} from "pdf-lib";

import type {
  ParsedFormField,
  ParsedFormLayout,
  ParsedPage,
} from "@/lib/pdf-form-layout";

/**
 * Read an AcroForm PDF and project its fields into the same
 * `ParsedFormLayout` shape Form Parser produces. Returns null when the
 * PDF has no AcroForm fields at all.
 */
export async function extractAcroFormLayout(
  fileBuffer: Buffer
): Promise<ParsedFormLayout | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (err) {
    console.warn("[acroform-extractor] PDF load failed:", err);
    return null;
  }

  let form: PDFForm;
  try {
    form = doc.getForm();
  } catch {
    return null;
  }

  const fields = form.getFields();
  if (!fields || fields.length === 0) return null;

  const pageRefs = doc.getPages();
  const pages: ParsedPage[] = pageRefs.map((p, idx) => ({
    page: idx + 1,
    width: p.getWidth(),
    height: p.getHeight(),
  }));

  const out: ParsedFormField[] = [];

  for (const field of fields) {
    const widgets = safeGetWidgets(field);
    if (widgets.length === 0) continue;

    const kind = inferFieldKind(field);
    if (!kind) continue; // unsupported widget (signatures, buttons, etc.)

    const label = friendlyLabel(field);
    const currentValue = readFieldCurrentValue(field, kind);

    for (const widget of widgets) {
      const placement = locateWidget(widget, pageRefs);
      if (!placement) continue;
      out.push({
        page: placement.pageNumber,
        label,
        currentValue,
        kind,
        labelBbox: null, // AcroForms don't carry separate label bboxes
        valueBbox: placement.bbox,
      });
    }
  }

  if (out.length === 0) return null;
  return { pages, fields: out };
}

/* ── internals ────────────────────────────────────────────────────────── */

function inferFieldKind(field: PDFField): "text" | "checkbox" | null {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "checkbox";
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    // Treat dropdowns/lists as text inputs for now — staff can type the
    // selected option. A future enhancement could surface the option
    // list to the overlay.
    return "text";
  }
  return null;
}

function friendlyLabel(field: PDFField): string {
  // PDF field names are typically machine-style ("CompanyName1",
  // "address_line2"). Convert to a human label by splitting on
  // separators + camelCase and title-casing the result.
  const raw = field.getName();
  if (!raw) return "Field";
  return raw
    .replace(/[_.-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function readFieldCurrentValue(
  field: PDFField,
  kind: "text" | "checkbox"
): string {
  try {
    if (kind === "checkbox" && field instanceof PDFCheckBox) {
      return field.isChecked() ? "true" : "false";
    }
    if (field instanceof PDFTextField) {
      return field.getText() ?? "";
    }
    if (field instanceof PDFRadioGroup) {
      return field.getSelected() ?? "";
    }
    if (field instanceof PDFDropdown) {
      return field.getSelected().join(", ");
    }
    if (field instanceof PDFOptionList) {
      return field.getSelected().join(", ");
    }
  } catch {
    /* fall through */
  }
  return "";
}

type Placement = {
  pageNumber: number;
  bbox: { x: number; y: number; w: number; h: number };
};

function safeGetWidgets(
  field: PDFField
): ReturnType<typeof field.acroField.getWidgets> {
  try {
    return field.acroField.getWidgets();
  } catch {
    return [];
  }
}

/**
 * Convert a widget annotation's PDF-coordinate rect to normalized 0..1
 * coords with origin top-left (the convention the overlay UI uses).
 * PDF native coords have origin bottom-left, so we flip y here.
 */
function locateWidget(
  widget: ReturnType<PDFField["acroField"]["getWidgets"]>[number],
  pages: ReturnType<PDFDocument["getPages"]>
): Placement | null {
  // Widgets carry a P (parent) entry pointing to their page's PDFRef.
  // Compare to each page's ref to find the page index. Falls back to
  // page 1 when P is missing (defensible — every PDF has at least one
  // page and unrooted widgets are rare).
  const widgetPageRef = widget.P();
  let pageIdx = -1;
  if (widgetPageRef) {
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].ref === widgetPageRef) {
        pageIdx = i;
        break;
      }
    }
  }
  if (pageIdx === -1) pageIdx = 0;

  const rect = widget.getRectangle();
  if (!rect) return null;

  const page = pages[pageIdx];
  const pageW = page.getWidth();
  const pageH = page.getHeight();
  if (pageW <= 0 || pageH <= 0) return null;

  // PDF coords: origin bottom-left, y grows up. Flip to top-origin.
  const x = clamp01(rect.x / pageW);
  const yTopFlipped = clamp01((pageH - rect.y - rect.height) / pageH);
  const w = clamp01(rect.width / pageW);
  const h = clamp01(rect.height / pageH);

  if (w === 0 || h === 0) return null;

  return {
    pageNumber: pageIdx + 1,
    bbox: { x, y: yTopFlipped, w, h },
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
