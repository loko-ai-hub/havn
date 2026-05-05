"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { cn } from "@/lib/utils";

// pdfjs-dist 5+ ships the worker as an ESM module. Point react-pdf at the
// public CDN matching whatever pdfjs-dist version is installed — keeps
// the worker out of our build pipeline. (Next.js can't bundle the worker
// directly without extra config.)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type OverlayField = {
  registryKey: string | null;
  label: string;
  page: number;
  /**
   * Form Parser kind: "text" for write-in blanks, "checkbox" for
   * filled/unfilled checkboxes. Older field_layout rows ingested before
   * this field existed default to "text" — staff can re-process the
   * upload to capture checkbox info.
   */
  kind?: "text" | "checkbox";
  valueBbox: { x: number; y: number; w: number; h: number } | null;
  labelBbox: { x: number; y: number; w: number; h: number } | null;
  currentValue: string;
};

export type OverlayPage = {
  page: number;
  width: number;
  height: number;
};

type Props = {
  pdfUrl: string;
  pages: OverlayPage[];
  fields: OverlayField[];
  /** Map registryKey → current value (from draft_fields). Editable. */
  values: Record<string, string>;
  /** Notify parent of edits so it can persist to draft_fields. */
  onChange: (registryKey: string, value: string) => void;
  /** Highlight keys that were just auto-populated. */
  highlightKeys?: Set<string>;
};

const DEFAULT_RENDER_WIDTH = 880;
const MIN_INPUT_HEIGHT = 22;

/**
 * Stable synthetic key for fields the registry mapper couldn't tie to a
 * canonical merge tag. Lets staff still edit those blanks (and have
 * the values round-trip into draft_fields + onto the delivered PDF).
 * Format: `__unmapped:<page>:<labelhash>` — derived from page + label
 * so the key survives layout re-orderings during re-processing.
 */
function unmappedKeyFor(field: OverlayField, idx: number): string {
  const norm = field.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `__unmapped:${field.page}:${norm || `idx${idx}`}`;
}

export default function PdfOverlay({
  pdfUrl,
  pages,
  fields,
  values,
  onChange,
  highlightKeys,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(DEFAULT_RENDER_WIDTH);
  const [numPages, setNumPages] = useState<number>(pages.length);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Resize observer so the rendered pages match the available width.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, OverlayField[]>();
    for (const f of fields) {
      if (!f.valueBbox) continue;
      const list = map.get(f.page) ?? [];
      list.push(f);
      map.set(f.page, list);
    }
    return map;
  }, [fields]);

  // Stable file source — prevents the Document from re-fetching on every
  // re-render of the parent.
  const fileSrc = useMemo(() => ({ url: pdfUrl }), [pdfUrl]);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div ref={containerRef} className="space-y-4">
        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}
        <Document
          file={fileSrc}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(err) => setLoadError(err.message ?? "Could not load PDF.")}
          loading={
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">
              Loading PDF…
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, idx) => {
            const pageNumber = idx + 1;
            const pageFields = fieldsByPage.get(pageNumber) ?? [];
            return (
              <PageWithOverlay
                key={pageNumber}
                pageNumber={pageNumber}
                width={containerWidth}
                fields={pageFields}
                values={values}
                onChange={onChange}
                highlightKeys={highlightKeys}
              />
            );
          })}
        </Document>
      </div>
    </div>
  );
}

type PageProps = {
  pageNumber: number;
  width: number;
  fields: OverlayField[];
  values: Record<string, string>;
  onChange: (registryKey: string, value: string) => void;
  highlightKeys?: Set<string>;
};

function PageWithOverlay({
  pageNumber,
  width,
  fields,
  values,
  onChange,
  highlightKeys,
}: PageProps) {
  const [renderedSize, setRenderedSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <div className="relative mx-auto bg-white shadow-sm" style={{ width }}>
      <Page
        pageNumber={pageNumber}
        width={width}
        // Disable annotation + text layers — both render absolutely
        // positioned over the page content and capture pointer events,
        // intercepting clicks that should reach our editable overlay
        // inputs. We don't need them for review (no annotations,
        // no text-selection use case).
        renderAnnotationLayer={false}
        renderTextLayer={false}
        onRenderSuccess={(page) => {
          const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
          setRenderedSize({ w: viewport.width, h: viewport.height });
        }}
      />
      {renderedSize && (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ width: renderedSize.w, height: renderedSize.h }}
        >
          {fields.map((field, idx) => {
            if (!field.valueBbox) return null;
            const left = field.valueBbox.x * renderedSize.w;
            const top = field.valueBbox.y * renderedSize.h;
            const w = field.valueBbox.w * renderedSize.w;
            const rawH = field.valueBbox.h * renderedSize.h;
            const isCheckbox = field.kind === "checkbox";
            const h = isCheckbox ? Math.max(rawH, 14) : Math.max(rawH, MIN_INPUT_HEIGHT);
            // Always editable — unmapped fields use a synthetic key so the
            // value still persists into draft_fields (and stamps onto the
            // delivered PDF), it just doesn't pull from the merge-tag cache.
            const effectiveKey = field.registryKey ?? unmappedKeyFor(field, idx);
            const value = values[effectiveKey] ?? "";
            const highlighted = !!(
              field.registryKey && highlightKeys?.has(field.registryKey)
            );
            const isUnmapped = !field.registryKey;
            const reactKey = `${effectiveKey}-${idx}`;

            if (isCheckbox) {
              const liveChecked =
                value === "true" || value === "1"
                  ? true
                  : value === "false" || value === "0"
                    ? false
                    : field.currentValue === "true";
              return (
                <input
                  key={reactKey}
                  type="checkbox"
                  checked={liveChecked}
                  onChange={(e) =>
                    onChange(effectiveKey, e.target.checked ? "true" : "false")
                  }
                  title={field.label}
                  className={cn(
                    "pointer-events-auto absolute cursor-pointer rounded-sm border bg-white/90 shadow-sm outline-none transition focus:ring-2 focus:ring-havn-navy/30",
                    highlighted
                      ? "border-havn-success/50 bg-havn-success/10"
                      : isUnmapped
                        ? "border-dashed border-muted-foreground/60"
                        : "border-havn-navy/30"
                  )}
                  style={{
                    left,
                    top,
                    width: Math.max(w, 14),
                    height: h,
                  }}
                />
              );
            }

            return (
              <input
                key={reactKey}
                type="text"
                value={value}
                placeholder={field.label}
                onChange={(e) => onChange(effectiveKey, e.target.value)}
                title={field.label}
                className={cn(
                  "pointer-events-auto absolute rounded-sm border bg-white/90 px-1 py-0 text-[12px] leading-tight shadow-sm outline-none transition focus:border-havn-navy focus:bg-white focus:ring-2 focus:ring-havn-navy/30",
                  highlighted
                    ? "border-havn-success/50 bg-havn-success/10 text-foreground"
                    : isUnmapped
                      ? "border-dashed border-muted-foreground/60 text-foreground"
                      : "border-havn-navy/30 text-foreground"
                )}
                style={{
                  left,
                  top,
                  width: w,
                  height: h,
                  minHeight: MIN_INPUT_HEIGHT,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
