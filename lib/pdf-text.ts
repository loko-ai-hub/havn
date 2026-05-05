import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";

import { createDocumentAIClient, PROCESSOR_NAME } from "@/lib/google-document-ai";
import { withTimeout } from "@/lib/timeout";

// Document AI per-chunk timeout. A single 14-page chunk should comfortably
// finish in <30s; allowing 90s leaves headroom for cold-start latency without
// letting one bad chunk eat the entire 300s function lifetime.
const DOCUMENT_AI_TIMEOUT_MS = 90_000;

/**
 * Shared PDF/DOCX text extraction used by both the OCR pipeline
 * (`lib/ocr-pipeline.ts`) and the 3P template ingestion pipeline
 * (`lib/3p-template-pipeline.ts`).
 */

const CHUNK_SIZE = 14; // stay safely under Document AI's 15-page non-imageless limit

/**
 * Split a PDF into chunks of ≤14 pages so we can send each chunk through
 * Google Document AI. Handles encrypted / malformed PDFs by falling back
 * to the original buffer (Document AI tolerates owner-locked PDFs better
 * than a re-encoded chunk would).
 */
export async function splitPdfIntoChunks(pdfBuffer: Buffer): Promise<Buffer[]> {
  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer);
  } catch (err) {
    const reason =
      err instanceof Error && err.message.toLowerCase().includes("encrypt")
        ? "encrypted"
        : "malformed";
    console.warn(`[pdf-text] PDF is ${reason} — sending original buffer directly to Document AI`);
    return [pdfBuffer];
  }

  const totalPages = srcDoc.getPageCount();
  const chunks: Buffer[] = [];

  for (let start = 0; start < totalPages; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, totalPages);
    const chunkDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) chunkDoc.addPage(page);
    const bytes = await chunkDoc.save();
    chunks.push(Buffer.from(bytes));
  }

  return chunks;
}

export type ExtractedText = {
  rawText: string;
  pageCount: number;
};

/**
 * OCR token + position data per page. Used by the 3P pipeline to
 * synthesize bounding boxes for detected_fields entries that Form
 * Parser missed (underline-style blanks where the label and the
 * blank are on the same line but Form Parser doesn't recognize the
 * underline as a value cell).
 */
export type OcrToken = {
  text: string;
  /** Normalized 0..1 coords. */
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** Whether the OCR considers this token to be the last of a line.
   * Useful when synthesizing a value bbox that extends to line end. */
  endOfLine: boolean;
};

export type OcrPage = {
  page: number;
  /** Page width in points (page.dimension). */
  width: number;
  /** Page height in points (page.dimension). */
  height: number;
  tokens: OcrToken[];
};

export type ExtractedTextWithLayout = ExtractedText & {
  pages: OcrPage[];
};

/**
 * Extract raw text from an uploaded artifact. DOCX files use mammoth;
 * PDFs are chunked and sent through Google Document AI. Returns empty
 * string when Document AI comes back with nothing (typical for fully
 * user-password-protected PDFs or pure-image PDFs with no detectable
 * text layer).
 */
export async function extractTextFromBuffer(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ExtractedText> {
  const full = await extractTextWithLayout(fileBuffer, mimeType);
  return { rawText: full.rawText, pageCount: full.pageCount };
}

/**
 * Like `extractTextFromBuffer`, but also returns per-page token data
 * with bounding boxes. Use this when downstream code needs to position
 * synthetic UI elements (e.g. PDF overlay inputs over underline-style
 * blanks Form Parser didn't tag).
 */
export async function extractTextWithLayout(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ExtractedTextWithLayout> {
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return {
      rawText: result.value || "",
      pageCount: 1,
      pages: [],
    };
  }

  const client = createDocumentAIClient();
  const chunks = await splitPdfIntoChunks(fileBuffer);
  const textParts: string[] = [];
  const pages: OcrPage[] = [];
  let totalPageCount = 0;
  let pageOffset = 0;

  for (const chunk of chunks) {
    const [result] = await withTimeout(
      client.processDocument({
        name: PROCESSOR_NAME,
        rawDocument: {
          content: chunk.toString("base64"),
          mimeType,
        },
      }),
      DOCUMENT_AI_TIMEOUT_MS,
      "Document AI processDocument"
    );
    const chunkText = result.document?.text ?? "";
    if (chunkText.trim()) textParts.push(chunkText);
    const docPages = result.document?.pages ?? [];

    for (let i = 0; i < docPages.length; i++) {
      const p = docPages[i];
      const dim = p.dimension as { width?: number | null; height?: number | null } | null | undefined;
      const tokens: OcrToken[] = [];
      for (const t of p.tokens ?? []) {
        const text = readTextAnchor(chunkText, (t.layout as { textAnchor?: unknown } | null | undefined)?.textAnchor);
        if (!text) continue;
        const bbox = extractNormalizedBbox(
          (t.layout as { boundingPoly?: unknown } | null | undefined)?.boundingPoly
        );
        const endOfLine = Boolean(
          (t.detectedBreak as { type?: string | null } | null | undefined)?.type === "LINE_BREAK"
        );
        tokens.push({ text, bbox, endOfLine });
      }
      pages.push({
        page: pageOffset + i + 1,
        width: (dim?.width as number | null | undefined) ?? 0,
        height: (dim?.height as number | null | undefined) ?? 0,
        tokens,
      });
    }

    totalPageCount += docPages.length;
    pageOffset += docPages.length;
  }

  return {
    rawText: textParts.join("\n\n"),
    pageCount: totalPageCount || chunks.length,
    pages,
  };
}

/* ── token/bbox helpers ─────────────────────────────────────────────── */

function readTextAnchor(fullText: string, anchor: unknown): string {
  const a = anchor as
    | {
        textSegments?:
          | Array<{ startIndex?: string | number | null; endIndex?: string | number | null }>
          | null;
      }
    | null
    | undefined;
  const segments = a?.textSegments;
  if (!segments || segments.length === 0) return "";
  const parts: string[] = [];
  for (const seg of segments) {
    const start = Number(seg.startIndex ?? 0);
    const end = Number(seg.endIndex ?? 0);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      parts.push(fullText.slice(start, end));
    }
  }
  return parts.join("").trim();
}

function extractNormalizedBbox(
  boundingPoly: unknown
): { x: number; y: number; w: number; h: number } | null {
  const bp = boundingPoly as
    | { normalizedVertices?: Array<{ x?: number | null; y?: number | null }> | null }
    | null
    | undefined;
  const verts = bp?.normalizedVertices ?? null;
  if (!verts || verts.length === 0) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
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
