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
  /**
   * For radio-group checkboxes (multiple checkboxes sharing one
   * registry key — e.g. "Fees are due: Monthly / Quarterly / Annually"
   * all bound to assessment_frequency). The literal string this
   * checkbox represents. The checkbox renders checked when
   * values[registryKey] === selectionValue. Click toggles between
   * setting the value to selectionValue and clearing it. Standalone
   * checkboxes (yes/no) leave this null and use boolean semantics.
   */
  selectionValue?: string | null;
  valueBbox: { x: number; y: number; w: number; h: number } | null;
  labelBbox: { x: number; y: number; w: number; h: number } | null;
  currentValue: string;
};

export type OverlayPage = {
  page: number;
  width: number;
  height: number;
};

type BboxOverride = { x: number; y: number; w: number; h: number };

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
  /** When true, inputs become draggable; clicks no longer focus. */
  editingLayout?: boolean;
  /** Live overrides keyed by effective-key. Applied to render position. */
  layoutOverrides?: Record<string, BboxOverride>;
  /** Called when staff drags a field. Parent accumulates overrides. */
  onLayoutOverride?: (key: string, bbox: BboxOverride) => void;
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
  editingLayout,
  layoutOverrides,
  onLayoutOverride,
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
                editingLayout={editingLayout}
                layoutOverrides={layoutOverrides}
                onLayoutOverride={onLayoutOverride}
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
  editingLayout?: boolean;
  layoutOverrides?: Record<string, BboxOverride>;
  onLayoutOverride?: (key: string, bbox: BboxOverride) => void;
};

function PageWithOverlay({
  pageNumber,
  width,
  fields,
  values,
  onChange,
  highlightKeys,
  editingLayout,
  layoutOverrides,
  onLayoutOverride,
}: PageProps) {
  const [renderedSize, setRenderedSize] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState<{
    key: string;
    /** "move" reposition x,y; "resize-e" widens; "resize-se" widens + tallens. */
    mode: "move" | "resize-e" | "resize-se";
    bbox: BboxOverride;
    startMouseX: number;
    startMouseY: number;
    startBboxX: number;
    startBboxY: number;
    startBboxW: number;
    startBboxH: number;
  } | null>(null);

  // Global mouse listeners while dragging — needed because the input
  // moves with the cursor and may briefly leave the original element's
  // hit area between frames.
  useEffect(() => {
    if (!dragging || !renderedSize) return;
    function clamp01(n: number): number {
      if (!Number.isFinite(n)) return 0;
      if (n < 0) return 0;
      if (n > 1) return 1;
      return n;
    }
    function onMove(e: MouseEvent) {
      if (!dragging || !renderedSize) return;
      const dx = (e.clientX - dragging.startMouseX) / renderedSize.w;
      const dy = (e.clientY - dragging.startMouseY) / renderedSize.h;
      let next: BboxOverride;
      if (dragging.mode === "move") {
        next = {
          x: clamp01(dragging.startBboxX + dx),
          y: clamp01(dragging.startBboxY + dy),
          w: dragging.bbox.w,
          h: dragging.bbox.h,
        };
      } else if (dragging.mode === "resize-e") {
        const newW = Math.max(0.01, Math.min(1 - dragging.startBboxX, dragging.startBboxW + dx));
        next = {
          x: dragging.startBboxX,
          y: dragging.startBboxY,
          w: newW,
          h: dragging.startBboxH,
        };
      } else {
        // resize-se (corner)
        const newW = Math.max(0.01, Math.min(1 - dragging.startBboxX, dragging.startBboxW + dx));
        const newH = Math.max(0.01, Math.min(1 - dragging.startBboxY, dragging.startBboxH + dy));
        next = {
          x: dragging.startBboxX,
          y: dragging.startBboxY,
          w: newW,
          h: newH,
        };
      }
      onLayoutOverride?.(dragging.key, next);
    }
    function onUp() {
      setDragging(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, renderedSize, onLayoutOverride]);

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
            const effectiveKey = field.registryKey ?? unmappedKeyFor(field, idx);
            // Apply staff override if any — that's the live position
            // shown both during drag and after Save.
            const bbox = layoutOverrides?.[effectiveKey] ?? field.valueBbox;
            const left = bbox.x * renderedSize.w;
            const top = bbox.y * renderedSize.h;
            const w = bbox.w * renderedSize.w;
            const rawH = bbox.h * renderedSize.h;
            const isCheckbox = field.kind === "checkbox";
            const h = isCheckbox ? Math.max(rawH, 14) : Math.max(rawH, MIN_INPUT_HEIGHT);
            const value = values[effectiveKey] ?? "";
            const highlighted = !!(
              field.registryKey && highlightKeys?.has(field.registryKey)
            );
            const isUnmapped = !field.registryKey;
            const reactKey = `${effectiveKey}-${idx}`;
            const beingDragged = dragging?.key === effectiveKey;

            // In layout-edit mode, fields become draggable ghosts.
            // Checkboxes render compactly (16x16; only position matters
            // — they're inherently fixed-size). Text fields render at
            // their actual width with a right-edge handle for width
            // tweaks and a corner handle for both width + height.
            if (editingLayout) {
              if (isCheckbox) {
                return (
                  <div
                    key={reactKey}
                    role="button"
                    tabIndex={0}
                    title={`${field.label} — drag to reposition`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDragging({
                        key: effectiveKey,
                        mode: "move",
                        bbox,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        startBboxX: bbox.x,
                        startBboxY: bbox.y,
                        startBboxW: bbox.w,
                        startBboxH: bbox.h,
                      });
                    }}
                    className={cn(
                      "pointer-events-auto absolute rounded-sm border-2 shadow-md transition-colors",
                      beingDragged
                        ? "cursor-grabbing border-havn-success bg-havn-success/20"
                        : "cursor-grab border-havn-success/60 bg-havn-success/10 hover:bg-havn-success/20"
                    )}
                    style={{
                      left,
                      top,
                      width: Math.max(Math.max(w, 14), 14),
                      height: Math.max(h, 14),
                    }}
                  >
                    <span className="pointer-events-none absolute -top-4 left-0 max-w-[200px] truncate rounded bg-havn-success px-1.5 py-0.5 text-[10px] font-medium text-white">
                      ☐ {field.label}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={reactKey}
                  role="button"
                  tabIndex={0}
                  title={`${field.label} — drag to move, edges to resize`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDragging({
                      key: effectiveKey,
                      mode: "move",
                      bbox,
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startBboxX: bbox.x,
                      startBboxY: bbox.y,
                      startBboxW: bbox.w,
                      startBboxH: bbox.h,
                    });
                  }}
                  className={cn(
                    "pointer-events-auto absolute rounded-sm border-2 shadow-md transition-colors",
                    beingDragged
                      ? "cursor-grabbing border-havn-navy bg-havn-navy/15"
                      : "cursor-grab border-havn-navy/60 bg-havn-navy/5 hover:bg-havn-navy/10"
                  )}
                  style={{
                    left,
                    top,
                    width: Math.max(w, 40),
                    height: h,
                  }}
                >
                  <span className="pointer-events-none absolute -top-4 left-0 max-w-full truncate rounded bg-havn-navy px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {field.label}
                  </span>
                  {/* Right-edge resize: width-only, runs full height. */}
                  <div
                    role="button"
                    tabIndex={-1}
                    title="Drag to resize width"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragging({
                        key: effectiveKey,
                        mode: "resize-e",
                        bbox,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        startBboxX: bbox.x,
                        startBboxY: bbox.y,
                        startBboxW: bbox.w,
                        startBboxH: bbox.h,
                      });
                    }}
                    className="pointer-events-auto absolute -right-1 top-0 h-full w-2 cursor-ew-resize rounded-sm bg-havn-navy/0 hover:bg-havn-navy/30"
                  />
                  {/* Bottom-right corner: width + height. */}
                  <div
                    role="button"
                    tabIndex={-1}
                    title="Drag to resize"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragging({
                        key: effectiveKey,
                        mode: "resize-se",
                        bbox,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        startBboxX: bbox.x,
                        startBboxY: bbox.y,
                        startBboxW: bbox.w,
                        startBboxH: bbox.h,
                      });
                    }}
                    className="pointer-events-auto absolute -right-1 -bottom-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-havn-navy bg-white"
                  />
                </div>
              );
            }

            if (isCheckbox) {
              // Two behaviors:
              //   - Radio-group checkbox (selectionValue set): checked
              //     when the registry value === selectionValue. Click
              //     sets registry value to selectionValue (or clears
              //     if already selected). Sibling checkboxes sharing
              //     the same registryKey auto-update because they all
              //     read the same `values[effectiveKey]`.
              //   - Standalone yes/no (no selectionValue): toggle
              //     between "true" and "false".
              const selVal = field.selectionValue ?? null;
              const liveChecked = selVal
                ? value === selVal
                : value === "true" || value === "1"
                  ? true
                  : value === "false" || value === "0"
                    ? false
                    : field.currentValue === "true";
              return (
                <input
                  key={reactKey}
                  type="checkbox"
                  checked={liveChecked}
                  onChange={(e) => {
                    if (selVal) {
                      onChange(effectiveKey, e.target.checked ? selVal : "");
                    } else {
                      onChange(
                        effectiveKey,
                        e.target.checked ? "true" : "false"
                      );
                    }
                  }}
                  title={
                    selVal
                      ? `${field.label} (selects "${selVal}")`
                      : field.label
                  }
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
