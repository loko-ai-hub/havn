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
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return {
      rawText: result.value || "",
      pageCount: 1,
    };
  }

  const client = createDocumentAIClient();
  const chunks = await splitPdfIntoChunks(fileBuffer);
  const textParts: string[] = [];
  let totalPageCount = 0;

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
    totalPageCount += result.document?.pages?.length ?? 0;
  }

  return {
    rawText: textParts.join("\n\n"),
    pageCount: totalPageCount || chunks.length,
  };
}
