"use client";

import {
  CheckCircle2,
  Download,
  FileText,
  LayoutList,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DocumentTemplate } from "@/lib/document-templates";
import type { MergedField } from "@/lib/document-fields";

import {
  fulfillAndGenerate,
  getVersionDownloadUrl,
  listOrderDocumentVersions,
  saveDraftFields,
  type OrderDocumentVersion,
  type SignaturePayload,
} from "../../actions";
import {
  applyMatch,
  autoPopulateFields,
  rerunIngestion,
  runMatchExtraction,
  saveFieldLayoutPositions,
} from "./actions";
import type { OverlayField, OverlayPage } from "./pdf-overlay";

// pdf.js worker can't run server-side. Lazy-load the overlay component
// so SSR isn't dragged into the pdfjs bundle.
const PdfOverlay = dynamic(() => import("./pdf-overlay"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
      Loading PDF view…
    </div>
  ),
});

export type MatchCard = {
  level: string | null;
  confidence: string | null;
  reasoning: string | null;
  suggestedCommunityId: string | null;
  suggestedCommunityName: string | null;
  suggestedUnitId: string | null;
  suggestedUnitStreet: string | null;
  suggestedUnitOwners: string[] | null;
  appliedAt: string | null;
  matchSource: string | null;
  extractedContext: {
    associationName: string | null;
    propertyAddress: string | null;
    ownerNames: string[];
  } | null;
  mappedCount: number;
  unmappedCount: number;
  appliedUnitId: string | null;
};

type Props = {
  orderId: string;
  template: DocumentTemplate;
  initialFields: Record<string, MergedField>;
  completionPct: number;
  communityId: string | null;
  communities: { id: string; name: string }[];
  isFulfilled: boolean;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  matchCard: MatchCard | null;
  overlay: {
    pdfUrl: string;
    pages: OverlayPage[];
    fields: OverlayField[];
  } | null;
  detectedFields: Array<{
    externalLabel: string;
    registryKey: string | null;
    confidence: number | null;
    fieldKind?: string | null;
  }>;
};

export default function ReviewForm({
  orderId,
  template,
  initialFields,
  completionPct,
  communityId: initialCommunityId,
  communities,
  isFulfilled,
  currentUserName,
  currentUserEmail,
  matchCard,
  overlay,
  detectedFields,
}: Props) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, MergedField>>(initialFields);
  const [selectedCommunity, setSelectedCommunity] = useState(initialCommunityId ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [versions, setVersions] = useState<OrderDocumentVersion[]>([]);
  const [match, setMatch] = useState<MatchCard | null>(matchCard);
  const [matchBusy, setMatchBusy] = useState<
    "none" | "rerun" | "apply" | "fill" | "reprocess"
  >("none");
  const [highlightKeys, setHighlightKeys] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"form" | "pdf">(overlay ? "pdf" : "form");
  // Layout-edit mode lets staff drag inputs in PDF view to fix
  // alignment when synthesis got the position wrong (e.g. labels that
  // sit below their blanks). Overrides accumulate locally; Save writes
  // them onto the third_party_templates row.
  const [editingLayout, setEditingLayout] = useState(false);
  const [layoutOverrides, setLayoutOverrides] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});
  const [savingLayout, setSavingLayout] = useState(false);
  // When checked, the corrected layout gets persisted to
  // vendor_form_templates so future uploads of the same form load it
  // instantly (no Form Parser, no synthesis, no vision call).
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listOrderDocumentVersions(orderId).then((result) => {
      if (cancelled) return;
      if (!("error" in result)) setVersions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    setMatch(matchCard);
  }, [matchCard]);

  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: { value: value || null, source: prev[key]?.source ?? null },
    }));
  };

  const toPlainValues = (): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = v.value;
    }
    return out;
  };

  const filledCount = Object.values(fields).filter((f) => f.value?.trim()).length;
  const requiredCount = template.fields.filter((f) => f.required).length;
  const filledRequired = template.fields.filter(
    (f) => f.required && fields[f.key]?.value?.trim()
  ).length;
  const requiresSignature = !!template.requiresSignature;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const result = await saveDraftFields(orderId, toPlainValues());
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved.");
    } finally {
      setSaving(false);
    }
  };

  const runGeneration = async (signature?: SignaturePayload) => {
    setGenerating(true);
    try {
      const result = await fulfillAndGenerate(
        orderId,
        toPlainValues(),
        selectedCommunity || null,
        signature
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        signature
          ? `Signed as V${result.version} and delivered.`
          : `V${result.version} generated and sent to requester.`
      );
      router.push("/dashboard/requests");
      router.refresh();
    } finally {
      setGenerating(false);
    }
  };

  const handlePrimary = async () => {
    if (filledRequired < requiredCount) {
      toast.error(`Please fill all required fields (${filledRequired}/${requiredCount} complete).`);
      return;
    }
    if (requiresSignature) {
      setSignatureOpen(true);
      return;
    }
    await runGeneration();
  };

  const handleVersionDownload = async (docId: string, label: string) => {
    const result = await getVersionDownloadUrl(docId);
    if ("error" in result) {
      toast.error(`Download failed (${label}): ${result.error}`);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const handleRerunMatch = async () => {
    setMatchBusy("rerun");
    try {
      const result = await runMatchExtraction(orderId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.level && result.level !== "none"
          ? `Match refreshed: ${formatLevel(result.level)} (${result.confidence ?? "—"} confidence).`
          : "Match refreshed — no community matched the document."
      );
      router.refresh();
    } finally {
      setMatchBusy("none");
    }
  };

  const handleApplyMatch = async () => {
    setMatchBusy("apply");
    try {
      const result = await applyMatch(orderId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Match applied to order.");
      if (match?.suggestedCommunityId) {
        setSelectedCommunity(match.suggestedCommunityId);
      }
      router.refresh();
    } finally {
      setMatchBusy("none");
    }
  };

  const handleReprocess = async () => {
    setMatchBusy("reprocess");
    try {
      const result = await rerunIngestion(orderId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const layoutNote = result.capturedLayout
        ? "PDF layout captured."
        : "No PDF layout captured (Form Parser not configured or non-PDF source).";
      toast.success(
        `Re-processed: ${result.mappedCount} mapped / ${result.unmappedCount} unmapped (${result.autoFillCoveragePct}% coverage). ${layoutNote}`
      );
      router.refresh();
    } finally {
      setMatchBusy("none");
    }
  };

  const handleAutoPopulate = async () => {
    setMatchBusy("fill");
    try {
      const result = await autoPopulateFields(orderId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const filled = result.coverage.filled;
      const requested = result.coverage.requested;
      const missing = result.coverage.skippedNoSource.length;
      toast.success(
        missing > 0
          ? `Filled ${filled} of ${requested} fields. ${missing} couldn't be filled — no data on file yet.`
          : `Filled ${filled} of ${requested} fields.`
      );
      if (result.newlyFilledKeys.length > 0) {
        setHighlightKeys(new Set(result.newlyFilledKeys));
        // Optimistically merge into local state so the user sees the values
        // immediately; router.refresh() will re-sync canonical state.
        setFields((prev) => {
          const next = { ...prev };
          // The server-side update already wrote to draft_fields; refresh
          // the page so the merged values come back through the normal load.
          return next;
        });
      }
      router.refresh();
    } finally {
      setMatchBusy("none");
    }
  };

  return (
    <div className="space-y-6">
      {/* Completion bar */}
      {(() => {
        // For 3P uploads, the meaningful denominator is the full list of
        // questions Claude found in the form (detectedFields) — including
        // ones Form Parser couldn't position. Falls back to overlay.fields
        // when detectedFields is empty (older ingestion runs), and to
        // template.fields when there's no 3P upload at all.
        const has3p = detectedFields.length > 0 || (!!overlay && overlay.fields.length > 0);
        const useDetected = detectedFields.length > 0;
        const totalFields = useDetected
          ? detectedFields.length
          : has3p
            ? overlay!.fields.length
            : template.fields.length;
        const populatedFields = useDetected
          ? detectedFields.filter((f, idx) => {
              const key =
                f.registryKey ?? `__detected:${(f.externalLabel || "")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_")
                  .replace(/^_+|_+$/g, "")
                  .slice(0, 40) || `idx${idx}`}`;
              const v = fields[key]?.value ?? "";
              const kind = (f.fieldKind ?? "text").toLowerCase();
              if (kind === "checkbox" || kind === "boolean") {
                return v === "true" || v === "1";
              }
              return v.trim().length > 0;
            }).length
          : has3p
            ? overlay!.fields.filter((f) => {
                const isCheckbox = f.kind === "checkbox";
                const liveVal = f.registryKey
                  ? fields[f.registryKey]?.value ?? ""
                  : "";
                if (isCheckbox) {
                  if (liveVal === "true" || liveVal === "1") return true;
                  if (!liveVal && f.currentValue === "true") return true;
                  return false;
                }
                if (liveVal.trim().length > 0) return true;
                return (
                  typeof f.currentValue === "string" &&
                  f.currentValue.trim().length > 0
                );
              }).length
            : filledCount;
        const livePct = totalFields > 0
          ? Math.min(100, Math.round((populatedFields / totalFields) * 100))
          : 0;

        return (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <Sparkles className="h-5 w-5 shrink-0 text-havn-navy" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {populatedFields} of {totalFields} fields populated
                </p>
                <span
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    livePct >= 85
                      ? "text-havn-success"
                      : livePct >= 50
                        ? "text-havn-amber"
                        : "text-destructive"
                  )}
                >
                  {livePct}%
                </span>
              </div>
              {has3p && totalFields - populatedFields > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {totalFields - populatedFields}{" "}
                  {totalFields - populatedFields === 1 ? "answer requires" : "answers require"} your attention
                </p>
              )}
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    livePct >= 85
                      ? "bg-havn-success"
                      : livePct >= 50
                        ? "bg-havn-amber"
                        : "bg-destructive"
                  )}
                  style={{ width: `${livePct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Version tabs */}
      {versions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Versions
            </Label>
            <p className="text-xs text-muted-foreground">
              {versions.length} {versions.length === 1 ? "version" : "versions"} on file
            </p>
          </div>
          <div className="mt-3 divide-y divide-border">
            {versions.map((v) => {
              const label = `V${v.version}`;
              const genDate = v.generatedAt
                ? new Date(v.generatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : null;
              const expired = v.expiresAt ? new Date(v.expiresAt).getTime() < Date.now() : false;
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex h-6 min-w-[32px] items-center justify-center rounded-md bg-havn-navy px-1.5 text-xs font-bold text-white">
                      {label}
                    </span>
                    <span className="text-foreground">
                      Generated {genDate ?? "—"}
                    </span>
                    {v.hasSignature && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-havn-success/30 bg-havn-success/10 px-1.5 py-0.5 text-xs text-havn-success">
                        <ShieldCheck className="h-3 w-3" />
                        Signed
                        {v.signerName ? ` · ${v.signerName}` : ""}
                      </span>
                    )}
                    {expired && (
                      <span className="rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        Expired
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleVersionDownload(v.id, label)}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Match status card (3P uploads only) */}
      {match && (
        <MatchStatusCard
          match={match}
          busy={matchBusy}
          onApply={() => void handleApplyMatch()}
          onRerun={() => void handleRerunMatch()}
          onReprocess={() => void handleReprocess()}
          onAutoPopulate={() => void handleAutoPopulate()}
        />
      )}

      {/* Community selector — hidden when the match card has a suggestion
          (the Apply match button handles community assignment). Shown
          only when there's no 3P upload + no match suggestion, so staff
          can pick the community for native-template orders. */}
      {communities.length > 0 && !match?.suggestedCommunityId && (
        <div className="rounded-xl border border-border bg-card p-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Community
          </Label>
          <select
            value={selectedCommunity}
            onChange={(e) => setSelectedCommunity(e.target.value)}
            disabled={false}
            className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="">Select community...</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* View toggle (only when overlay is available) */}
      {overlay && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
          <Button
            type="button"
            size="sm"
            variant={view === "pdf" ? "default" : "outline"}
            onClick={() => setView("pdf")}
            className={view === "pdf" ? "bg-havn-navy text-white hover:bg-havn-navy/90" : ""}
          >
            <FileText className="mr-2 h-3.5 w-3.5" />
            PDF view
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "form" ? "default" : "outline"}
            onClick={() => {
              setView("form");
              if (editingLayout) setEditingLayout(false);
            }}
            className={view === "form" ? "bg-havn-navy text-white hover:bg-havn-navy/90" : ""}
          >
            <LayoutList className="mr-2 h-3.5 w-3.5" />
            Form view
          </Button>
          {view === "pdf" && !editingLayout && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditingLayout(true)}
              title="Drag inputs to align them with the lines on the form. Useful when the synthesis put a field in the wrong spot."
            >
              Edit layout
            </Button>
          )}
          {view === "pdf" && editingLayout && (
            <>
              <Button
                type="button"
                size="sm"
                disabled={savingLayout}
                onClick={() => {
                  void (async () => {
                    if (Object.keys(layoutOverrides).length === 0 && !saveAsTemplate) {
                      toast.message("No layout changes to save.");
                      setEditingLayout(false);
                      return;
                    }
                    setSavingLayout(true);
                    try {
                      const result = await saveFieldLayoutPositions(
                        orderId,
                        layoutOverrides,
                        { saveAsTemplate }
                      );
                      if ("error" in result) {
                        toast.error(result.error);
                        return;
                      }
                      const baseMsg = `Saved ${result.updatedCount} field position${
                        result.updatedCount === 1 ? "" : "s"
                      }.`;
                      const tmplMsg = result.templateSaved
                        ? " Template saved — future orders for this form will load it instantly."
                        : "";
                      toast.success(`${baseMsg}${tmplMsg}`);
                      setLayoutOverrides({});
                      setEditingLayout(false);
                      router.refresh();
                    } finally {
                      setSavingLayout(false);
                    }
                  })();
                }}
                className="bg-havn-navy text-white hover:bg-havn-navy/90"
              >
                {savingLayout ? "Saving…" : "Save layout"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={savingLayout}
                onClick={() => {
                  setLayoutOverrides({});
                  setEditingLayout(false);
                }}
              >
                Discard
              </Button>
            </>
          )}
          {editingLayout && (
            <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              Save as template (reuse for future uploads of this form)
            </label>
          )}
          <p className="ml-auto text-xs text-muted-foreground">
            {editingLayout
              ? "Drag fields to align with the form. Editing values is paused until you save."
              : "Edit either way — values stay in sync."}
          </p>
        </div>
      )}

      {/* PDF overlay */}
      {overlay && view === "pdf" && (
        <PdfOverlay
          pdfUrl={overlay.pdfUrl}
          pages={overlay.pages}
          fields={overlay.fields}
          values={Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, v?.value ?? ""])
          )}
          onChange={(key, value) => updateField(key, value)}
          highlightKeys={highlightKeys}
          editingLayout={editingLayout}
          layoutOverrides={layoutOverrides}
          onLayoutOverride={(key, bbox) =>
            setLayoutOverrides((prev) => ({ ...prev, [key]: bbox }))
          }
        />
      )}

      {/* Form view for 3P uploads — every question Claude found in the
          form, including ones Form Parser couldn't position spatially.
          PDF view shows the spatial subset; Form view is the complete
          fillable list. */}
      {overlay && view === "form" && (
        <ThreePartyFormView
          detectedFields={detectedFields}
          values={Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, v?.value ?? ""])
          )}
          onChange={(key, value) => updateField(key, value)}
          highlightKeys={highlightKeys}
        />
      )}

      {/* Native-template sections (resale, lender questionnaire). */}
      {!overlay && template.sections.map((sectionName) => {
        const sectionFields = template.fields.filter((f) => f.section === sectionName);
        if (sectionFields.length === 0) return null;

        return (
          <div key={sectionName} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="bg-havn-navy px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                {sectionName}
              </h2>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {sectionFields.map((fieldDef) => {
                const merged = fields[fieldDef.key];
                const isTextarea = fieldDef.type === "textarea";
                const wasJustFilled = highlightKeys.has(fieldDef.key);

                return (
                  <div
                    key={fieldDef.key}
                    className={cn(
                      "space-y-1.5",
                      isTextarea && "sm:col-span-2"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`field-${fieldDef.key}`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {fieldDef.label}
                        {fieldDef.required && (
                          <span className="ml-0.5 text-destructive">*</span>
                        )}
                      </Label>
                      {wasJustFilled && (
                        <span className="inline-flex items-center rounded-md border border-havn-success/30 bg-havn-success/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-havn-success">
                          Auto-filled
                        </span>
                      )}
                    </div>
                    {isTextarea ? (
                      <Textarea
                        id={`field-${fieldDef.key}`}
                        value={merged?.value ?? ""}
                        onChange={(e) => updateField(fieldDef.key, e.target.value)}
                        disabled={false}
                        rows={3}
                        className={cn(
                          "text-sm disabled:opacity-50",
                          wasJustFilled && "ring-2 ring-havn-success/40"
                        )}
                      />
                    ) : (
                      <Input
                        id={`field-${fieldDef.key}`}
                        type={fieldDef.type === "date" ? "date" : "text"}
                        value={merged?.value ?? ""}
                        onChange={(e) => updateField(fieldDef.key, e.target.value)}
                        disabled={false}
                        className={cn(
                          "h-9 text-sm disabled:opacity-50",
                          fieldDef.required && !merged?.value?.trim() && "border-destructive/40",
                          wasJustFilled && "ring-2 ring-havn-success/40"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        {isFulfilled && (
          <p className="text-xs text-havn-success font-medium">Previously generated and delivered</p>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <Button
            type="button"
            variant="outline"
            disabled={saving || generating}
            onClick={() => void handleSaveDraft()}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            type="button"
            disabled={saving || generating}
            onClick={() => void handlePrimary()}
            className="bg-havn-success text-white hover:bg-havn-success/90"
          >
            {requiresSignature ? (
              <ShieldCheck className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {generating
              ? "Generating..."
              : requiresSignature
                ? isFulfilled
                  ? "Sign & Regenerate"
                  : "Approve & Sign"
                : isFulfilled
                  ? "Regenerate PDF"
                  : "Approve & Generate PDF"}
          </Button>
        </div>
      </div>

      {signatureOpen && (
        <SignatureModal
          template={template}
          defaultSignerName={currentUserName ?? ""}
          defaultSignerEmail={currentUserEmail ?? ""}
          onCancel={() => setSignatureOpen(false)}
          onSign={async (payload) => {
            setSignatureOpen(false);
            await runGeneration(payload);
          }}
          generating={generating}
        />
      )}
    </div>
  );
}

/* ── 3P form view ────────────────────────────────────────────────────── */

/** Synthetic key for fields the registry mapper couldn't match. Mirrors
 * pdf-overlay.tsx so the same field shares state across PDF + Form views. */
function unmappedKeyFor(field: OverlayField, idx: number): string {
  const norm = field.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `__unmapped:${field.page}:${norm || `idx${idx}`}`;
}

/** Synthetic key for detectedFields entries without a registry key.
 * Same shape as unmappedKeyFor but page is implicit (not always known
 * from text-based extraction). */
function detectedUnmappedKey(label: string, idx: number): string {
  const norm = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `__detected:${norm || `idx${idx}`}`;
}

type DetectedField = {
  externalLabel: string;
  registryKey: string | null;
  confidence: number | null;
  fieldKind?: string | null;
};

function ThreePartyFormView({
  detectedFields,
  values,
  onChange,
  highlightKeys,
}: {
  detectedFields: DetectedField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  highlightKeys: Set<string>;
}) {
  if (detectedFields.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        No fields detected yet. Try Re-process upload to re-run extraction.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="bg-havn-navy px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
          Form questions
        </h2>
      </div>
      <div className="grid gap-4 p-5">
        {detectedFields.map((f, idx) => {
          const effectiveKey =
            f.registryKey ?? detectedUnmappedKey(f.externalLabel, idx);
          const liveVal = values[effectiveKey] ?? "";
          const kind = (f.fieldKind ?? "text").toLowerCase();
          const isCheckbox = kind === "checkbox" || kind === "boolean";
          const isTextarea = kind === "textarea";
          const isCurrency = kind === "currency";
          const isDate = kind === "date";
          const wasJustFilled = !!(
            f.registryKey && highlightKeys.has(f.registryKey)
          );

          return (
            <div key={`${effectiveKey}-${idx}`} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  {f.externalLabel}
                </Label>
                {wasJustFilled && (
                  <span className="inline-flex items-center rounded-md border border-havn-success/30 bg-havn-success/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-havn-success">
                    Auto-filled
                  </span>
                )}
              </div>
              {isCheckbox ? (
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={liveVal === "true" || liveVal === "1"}
                    onChange={(e) =>
                      onChange(
                        effectiveKey,
                        e.target.checked ? "true" : "false"
                      )
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-muted-foreground">
                    {liveVal === "true" || liveVal === "1" ? "Yes" : "No"}
                  </span>
                </label>
              ) : isTextarea ? (
                <Textarea
                  value={liveVal}
                  rows={3}
                  onChange={(e) => onChange(effectiveKey, e.target.value)}
                  placeholder={f.externalLabel}
                />
              ) : (
                <Input
                  type={isDate ? "date" : "text"}
                  value={liveVal}
                  onChange={(e) => onChange(effectiveKey, e.target.value)}
                  placeholder={isCurrency ? "$" : f.externalLabel}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Match status card ───────────────────────────────────────────────── */

function formatLevel(level: string | null): string {
  switch (level) {
    case "community_unit_owner":
      return "Community + Unit + Owner";
    case "community_unit":
      return "Community + Unit";
    case "community":
      return "Community only";
    case "none":
      return "No match";
    default:
      return "Pending";
  }
}

function levelTone(level: string | null): string {
  switch (level) {
    case "community_unit_owner":
      return "border-havn-success/30 bg-havn-success/10 text-havn-success";
    case "community_unit":
      return "border-havn-amber/30 bg-havn-amber/10 text-havn-amber";
    case "community":
      return "border-havn-navy/30 bg-havn-navy/5 text-havn-navy";
    default:
      return "border-muted bg-muted/40 text-muted-foreground";
  }
}

function confidenceTone(confidence: string | null): string {
  switch (confidence) {
    case "high":
      return "border-havn-success/30 bg-havn-success/10 text-havn-success";
    case "medium":
      return "border-havn-amber/30 bg-havn-amber/10 text-havn-amber";
    case "low":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-muted bg-muted/40 text-muted-foreground";
  }
}

type MatchStatusCardProps = {
  match: MatchCard;
  busy: "none" | "rerun" | "apply" | "fill" | "reprocess";
  onApply: () => void;
  onRerun: () => void;
  onReprocess: () => void;
  onAutoPopulate: () => void;
};

function MatchStatusCard({
  match,
  busy,
  onApply,
  onRerun,
  onReprocess,
  onAutoPopulate,
}: MatchStatusCardProps) {
  const isApplied =
    !!match.appliedAt &&
    match.appliedUnitId !== null &&
    match.suggestedUnitId === match.appliedUnitId;
  const auditStr = match.appliedAt
    ? new Date(match.appliedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const auditLabel =
    match.matchSource === "havn_auto"
      ? `Matched by Havn — community + unit + owner all confirmed${auditStr ? ` (${auditStr})` : ""}`
      : match.matchSource === "staff_manual"
        ? `Match applied by staff${auditStr ? ` (${auditStr})` : ""}`
        : null;

  const canApply = !!match.suggestedCommunityId && !isApplied;
  const ownerString =
    match.suggestedUnitOwners && match.suggestedUnitOwners.length > 0
      ? match.suggestedUnitOwners.filter(Boolean).join(" & ")
      : null;
  const extracted = match.extractedContext;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                levelTone(match.level)
              )}
            >
              {formatLevel(match.level)}
            </span>
            {match.confidence && (
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                  confidenceTone(match.confidence)
                )}
              >
                {match.confidence} confidence
              </span>
            )}
            {auditLabel && (
              <span className="inline-flex items-center gap-1 rounded-md border border-havn-success/30 bg-havn-success/10 px-2 py-0.5 text-xs font-medium text-havn-success">
                <ShieldCheck className="h-3 w-3" />
                {auditLabel}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            Document → property match
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== "none"}
            onClick={onReprocess}
            title="Re-runs the full ingestion pipeline: OCR, Claude extraction, Form Parser layout, and match resolution."
          >
            <Sparkles
              className={cn(
                "mr-2 h-3.5 w-3.5",
                busy === "reprocess" && "animate-pulse"
              )}
            />
            {busy === "reprocess" ? "Re-processing..." : "Re-process upload"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== "none"}
            onClick={onRerun}
          >
            <RefreshCw
              className={cn(
                "mr-2 h-3.5 w-3.5",
                busy === "rerun" && "animate-spin"
              )}
            />
            {busy === "rerun" ? "Re-running..." : "Re-run match"}
          </Button>
          {canApply && (
            <Button
              type="button"
              size="sm"
              disabled={busy !== "none"}
              onClick={onApply}
              className="bg-havn-navy text-white hover:bg-havn-navy/90"
            >
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              {busy === "apply" ? "Applying..." : "Apply match"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested community
          </p>
          <p className="mt-1 text-foreground">
            {match.suggestedCommunityName ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested unit
          </p>
          <p className="mt-1 text-foreground">
            {match.suggestedUnitStreet ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Owner on file
          </p>
          <p className="mt-1 text-foreground">{ownerString ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Owner on document
          </p>
          <p className="mt-1 text-foreground">
            {extracted?.ownerNames && extracted.ownerNames.length > 0
              ? extracted.ownerNames.join(" & ")
              : "—"}
          </p>
        </div>
      </div>

      {match.reasoning && (
        <p className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {match.reasoning}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Auto-populate fills draft fields from the cache + roster, scoped to
          the match level above. Existing entries are never overwritten.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== "none" || !match.level || match.level === "none"}
          onClick={onAutoPopulate}
        >
          <Wand2
            className={cn(
              "mr-2 h-3.5 w-3.5",
              busy === "fill" && "animate-spin"
            )}
          />
          {busy === "fill" ? "Filling..." : "Auto-populate fields"}
        </Button>
      </div>
    </div>
  );
}

/* ── Signature modal (click-to-sign) ───────────────────────────────── */

type SignatureModalProps = {
  template: DocumentTemplate;
  defaultSignerName: string;
  defaultSignerEmail: string;
  generating: boolean;
  onCancel: () => void;
  onSign: (payload: SignaturePayload) => Promise<void>;
};

function SignatureModal({
  template,
  defaultSignerName,
  defaultSignerEmail,
  generating,
  onCancel,
  onSign,
}: SignatureModalProps) {
  const [name, setName] = useState(defaultSignerName);
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState(defaultSignerEmail);
  const [certified, setCertified] = useState(false);

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && certified;
  const certificationText =
    template.legalLanguage?.certificationText ??
    "I certify that the information provided above is true and accurate to the best of my knowledge.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-havn-success/10 p-2 text-havn-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Sign & Certify</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          This document requires a signature before it can be delivered.
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <Label htmlFor="sig-name" className="text-xs font-medium">
              Your name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sig-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="sig-title" className="text-xs font-medium">
              Title
            </Label>
            <Input
              id="sig-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Community Manager"
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="sig-email" className="text-xs font-medium">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sig-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <label className="mt-2 flex items-start gap-2 rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-foreground">
            <input
              type="checkbox"
              checked={certified}
              onChange={(e) => setCertified(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-havn-success"
            />
            <span>{certificationText}</span>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" disabled={generating} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || generating}
            onClick={() =>
              void onSign({
                signerName: name.trim(),
                signerEmail: email.trim(),
                signerTitle: title.trim() || null,
                signedAt: new Date().toISOString(),
                signatureData: "click-to-sign",
              })
            }
            className="bg-havn-success text-white hover:bg-havn-success/90"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {generating ? "Signing..." : "Sign & Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
