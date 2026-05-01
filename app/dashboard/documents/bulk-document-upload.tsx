"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

// Mirrors the per-community page so behavior is consistent. If you tune one,
// tune the other (eventually we should extract to a shared lib).
const CATEGORY_OPTIONS = [
  "CC&Rs / Declaration",
  "Bylaws",
  "Amendments",
  "Articles of Incorporation",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
  "Meeting Minutes",
  "Rules & Regulations",
  "Site Plan / Map",
  "FHA/VA Certification",
  "Management Agreement",
  "Other",
] as const;

type Confidence = "high" | "medium" | "low" | "unknown";

const CATEGORY_PATTERNS: { regex: RegExp; category: string; confidence: Confidence }[] = [
  { regex: /cc&r|ccr|declaration|deed.restrict|covenant|condition.*restriction/i, category: "CC&Rs / Declaration", confidence: "high" },
  { regex: /bylaw|by.law/i, category: "Bylaws", confidence: "high" },
  { regex: /amendment|amend|restated/i, category: "Amendments", confidence: "medium" },
  { regex: /articles.of.inc|articles.inc|incorporation|articles.org/i, category: "Articles of Incorporation", confidence: "high" },
  { regex: /financial.report|annual.report|income.statement|balance.sheet|audit|profit.loss/i, category: "Financial Reports", confidence: "high" },
  { regex: /insurance|coi|acord|certificate.of.insur/i, category: "Insurance Certificate", confidence: "high" },
  { regex: /reserve.study|reserve.analys|reserve.plan/i, category: "Reserve Study", confidence: "high" },
  { regex: /budget|fiscal.year|operating.budget|annual.budget/i, category: "Budget", confidence: "high" },
  { regex: /minutes|board.meeting|annual.meeting|special.meeting/i, category: "Meeting Minutes", confidence: "high" },
  { regex: /rules.reg|rules.&.reg|polic(y|ies)|enforcement/i, category: "Rules & Regulations", confidence: "medium" },
  { regex: /site.plan|plot.plan|plat.map|plat\b|community.map|property.map|floor.plan|\bmap\b/i, category: "Site Plan / Map", confidence: "high" },
  { regex: /fha|va.cert|hud.approv|condo.approv|fha.approv/i, category: "FHA/VA Certification", confidence: "high" },
  { regex: /management.agree|management.contract|mgmt.agree|property.management.agree|service.agree/i, category: "Management Agreement", confidence: "high" },
];

const STOPWORDS = new Set([
  "hoa",
  "coa",
  "condo",
  "condominium",
  "community",
  "association",
  "homeowners",
  "the",
  "of",
  "at",
  "and",
  "&",
  "llc",
  "inc",
  "incorporated",
]);

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function communityTokens(legalName: string): string[] {
  return normalizeForMatch(legalName)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function guessCategory(filename: string): { category: string; confidence: Confidence } {
  const name = filename.toLowerCase().replace(/[_\-.]/g, " ");
  for (const { regex, category, confidence } of CATEGORY_PATTERNS) {
    if (regex.test(name)) return { category, confidence };
  }
  return { category: "Other", confidence: "unknown" };
}

type Community = { id: string; legal_name: string; organization_id: string };

function guessCommunity(
  filename: string,
  communities: Community[],
  pathHint?: string
): { communityId: string | null; confidence: Confidence } {
  // Combined haystack: filename + any folder path hint (e.g. "MapleRidge/CCRs.pdf").
  const haystack = normalizeForMatch(`${pathHint ?? ""} ${filename}`);
  if (!haystack) return { communityId: null, confidence: "unknown" };

  const scored: { id: string; score: number; matched: number }[] = [];
  for (const c of communities) {
    const tokens = communityTokens(c.legal_name);
    if (tokens.length === 0) continue;

    let matched = 0;
    let score = 0;
    for (const tok of tokens) {
      if (haystack.includes(tok)) {
        matched++;
        score += tok.length;
      }
    }
    if (matched > 0) {
      scored.push({ id: c.id, matched, score });
    }
  }

  if (scored.length === 0) return { communityId: null, confidence: "unknown" };
  scored.sort((a, b) => b.score - a.score || b.matched - a.matched);
  const best = scored[0];
  // High confidence: matched at least 2 distinct tokens OR one strong token >= 6 chars
  // and no other community tied/close.
  const second = scored[1];
  const isClear = !second || second.score < best.score * 0.7;
  const strong = best.matched >= 2 || best.score >= 6;
  if (strong && isClear) return { communityId: best.id, confidence: "high" };
  if (isClear) return { communityId: best.id, confidence: "medium" };
  // Multiple communities matched roughly equally — leave to the user.
  return { communityId: null, confidence: "unknown" };
}

type PendingFile = {
  id: string;
  file: File;
  pathHint?: string;
  communityId: string | null;
  communityConfidence: Confidence;
  category: string;
  categoryConfidence: Confidence;
  status:
    | "pending"
    | "uploading"
    | "queued"
    | "processing"
    | "done"
    | "skipped"
    | "error";
  error?: string;
  /** Set when the server has accepted the upload and persisted a row. Used to
   *  match incoming Supabase realtime events back to the UI row. */
  documentId?: string;
  /** Set when this file was skipped because the same hash already exists for
   *  the community. The existing doc's filename (for the operator's UI). */
  duplicateOf?: string;
  /** ID of the existing doc this file duplicates — needed for the
   *  "Replace existing" override flow. */
  existingDocumentId?: string;
};

export default function BulkDocumentUpload({
  open,
  onOpenChange,
  communities,
  organizationId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communities: Community[];
  organizationId: string;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useRef(`bdu-${Date.now()}`);
  const counterRef = useRef(0);

  // Realtime + polling: when a batch is in flight, subscribe to row changes
  // on community_documents filtered to bulk_upload_batch_id and reconcile
  // each row's ocr_status into the matching UI row. Polling fallback every 8s
  // covers the case where the realtime channel drops mid-batch.
  useEffect(() => {
    if (!batchId) return;
    const supabase = createClient();

    const reconcile = (
      row: { id: string; ocr_status: string | null; document_category: string | null }
    ) => {
      setFiles((prev) =>
        prev.map((f) => {
          if (f.documentId !== row.id) return f;
          const status = (row.ocr_status ?? "").toLowerCase();
          if (status === "complete") {
            return {
              ...f,
              status: "done" as const,
              category: row.document_category ?? f.category,
              categoryConfidence:
                row.document_category && row.document_category !== "Other"
                  ? "high"
                  : "unknown",
            };
          }
          if (status === "failed") {
            return { ...f, status: "error" as const, error: "OCR failed." };
          }
          if (status === "processing") {
            return { ...f, status: "processing" as const };
          }
          return f;
        })
      );
    };

    const channel = supabase
      .channel(`bulk-upload-${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "community_documents",
          filter: `bulk_upload_batch_id=eq.${batchId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            ocr_status: string | null;
            document_category: string | null;
          };
          reconcile(row);
        }
      )
      .subscribe();

    const pollId = window.setInterval(async () => {
      const { data } = await supabase
        .from("community_documents")
        .select("id, ocr_status, document_category")
        .eq("bulk_upload_batch_id", batchId);
      for (const row of (data ?? []) as {
        id: string;
        ocr_status: string | null;
        document_category: string | null;
      }[]) {
        reconcile(row);
      }
    }, 8_000);

    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(pollId);
    };
  }, [batchId]);

  // Once every file in the active batch is in a terminal state (done or error),
  // stop showing the in-flight footer copy. Keep batchId set so realtime stays
  // attached if the user reopens the dialog later for the same batch.
  useEffect(() => {
    if (!batchId || !processing) return;
    const allTerminal =
      files.length > 0 &&
      files.every(
        (f) =>
          f.status === "done" ||
          f.status === "skipped" ||
          f.status === "error"
      );
    if (allTerminal) {
      setProcessing(false);
      const succeeded = files.filter((f) => f.status === "done").length;
      const skipped = files.filter((f) => f.status === "skipped").length;
      const failed = files.filter((f) => f.status === "error").length;
      const parts: string[] = [];
      if (succeeded > 0) parts.push(`${succeeded} processed`);
      if (skipped > 0) parts.push(`${skipped} duplicate${skipped > 1 ? "s" : ""} skipped`);
      if (failed > 0) parts.push(`${failed} failed`);
      const summary = parts.join(" · ");
      if (succeeded > 0 || skipped > 0) {
        toast.success(summary);
      } else if (failed > 0) {
        toast.error(`All ${failed} uploads failed.`);
      }
      onDone();
    }
  }, [files, batchId, processing, onDone]);

  const allReady = useMemo(
    () =>
      files.length > 0 &&
      files.every(
        (f) =>
          f.status !== "uploading" &&
          f.status !== "queued" &&
          f.status !== "processing"
      ),
    [files]
  );


  // Files without a confident filename match still go through — the server
  // will OCR + AI-match them. We just inform the user that some will be
  // auto-routed so the count of files needing review is more nuanced.
  const autoDetectCount = useMemo(
    () => files.filter((f) => f.communityId === null && f.status === "pending").length,
    [files]
  );

  const reset = () => {
    setFiles([]);
    setIsDragging(false);
    setProcessing(false);
    setBatchId(null);
  };

  const ingestFiles = (incoming: { file: File; pathHint?: string }[]) => {
    const next: PendingFile[] = incoming.map(({ file, pathHint }) => {
      const cat = guessCategory(file.name);
      const com = guessCommunity(file.name, communities, pathHint);
      counterRef.current += 1;
      return {
        id: `${idPrefix.current}-${counterRef.current}`,
        file,
        pathHint,
        communityId: com.communityId,
        communityConfidence: com.confidence,
        category: cat.category,
        categoryConfidence: cat.confidence,
        status: "pending" as const,
      };
    });
    setFiles((prev) => [...prev, ...next]);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const incoming = e.target.files
      ? Array.from(e.target.files).map((file) => ({
          file,
          // webkitRelativePath is set when a folder is chosen via the picker.
          pathHint:
            (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined,
        }))
      : [];
    if (incoming.length > 0) ingestFiles(incoming);
    e.target.value = "";
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) {
      // Fallback: just files
      if (e.dataTransfer.files.length > 0) {
        ingestFiles(Array.from(e.dataTransfer.files).map((file) => ({ file })));
      }
      return;
    }
    // Walk the dropped folder structure (Chrome/Safari) so folder names become
    // pathHints — useful for cases like "MapleRidge/CCRs.pdf".
    const collected: { file: File; pathHint?: string }[] = [];
    const walkers: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntry | null;
      };
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        walkers.push(walkEntry(entry, "", collected));
      } else {
        const file = item.getAsFile();
        if (file) collected.push({ file });
      }
    }
    await Promise.all(walkers);
    if (collected.length > 0) ingestFiles(collected);
  };

  const updateFile = (id: string, patch: Partial<PendingFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const processAll = async () => {
    if (!allReady) return;
    setProcessing(true);
    // Each click of Process generates a new batch ID. The server stamps every
    // row it inserts with this ID; the client subscribes to realtime updates
    // filtered to this batch so we only react to events for our own work.
    const newBatchId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setBatchId(newBatchId);

    const queue = files.filter((f) => f.status === "pending");
    // Cap concurrency to avoid the browser opening hundreds of fetches at once;
    // server returns fast (~1s for known-community files, ~5s for auto-detect).
    const CONCURRENCY = 8;
    let cursor = 0;

    const startOne = async (pf: PendingFile) => {
      updateFile(pf.id, { status: "uploading" });
      const formData = new FormData();
      formData.append("file", pf.file);
      if (pf.communityId) formData.append("communityId", pf.communityId);
      formData.append("organizationId", organizationId);
      formData.append("category", pf.category);
      formData.append("batchId", newBatchId);

      try {
        const response = await fetch("/api/documents/process", {
          method: "POST",
          body: formData,
        });
        const result = (await response.json()) as {
          success: boolean;
          error?: string;
          needsCommunity?: boolean;
          duplicate?: boolean;
          existingDocumentId?: string;
          existingFilename?: string | null;
          existingCategory?: string | null;
          autoMatchedCommunityId?: string | null;
          communityMatchConfidence?: Confidence | null;
          documentId?: string;
        };

        if (!result.success && result.needsCommunity) {
          updateFile(pf.id, {
            status: "pending",
            communityId: null,
            communityConfidence: "unknown",
            error: result.error ?? "Pick a community.",
          });
          return;
        }

        if (!result.success && result.duplicate) {
          updateFile(pf.id, {
            status: "skipped",
            duplicateOf: result.existingFilename ?? result.existingDocumentId,
            existingDocumentId: result.existingDocumentId,
          });
          return;
        }

        if (!response.ok || !result.success || !result.documentId) {
          throw new Error(result.error ?? "Processing failed.");
        }

        // Server has accepted the upload and queued OCR. The actual category +
        // final state will arrive via the realtime subscription (or polling
        // fallback). Track the documentId so reconcile() can find this row.
        updateFile(pf.id, {
          status: "processing",
          documentId: result.documentId,
          communityId: result.autoMatchedCommunityId ?? pf.communityId ?? null,
          communityConfidence:
            result.communityMatchConfidence ?? pf.communityConfidence,
        });
      } catch (err) {
        updateFile(pf.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    };

    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor++;
        if (idx >= queue.length) return;
        await startOne(queue[idx]);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
    );

    // Don't toast here — final completion toast fires from the all-terminal
    // effect when realtime confirms every doc is done or failed.
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col p-0">
        {/* Header — fixed at top */}
        <div className="shrink-0 space-y-1 border-b border-border px-6 py-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-havn-cyan-deep" />
            <DialogTitle>Bulk upload documents</DialogTitle>
          </div>
          <DialogDescription>
            Drop any documents (or whole folders). We&rsquo;ll auto-match each to the right
            community and document type. The community is optional; leave it on{" "}
            <span className="font-medium text-havn-cyan-deep">Auto-detect</span> and
            we&rsquo;ll figure it out from the doc.
          </DialogDescription>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
              isDragging ? "border-havn-cyan bg-havn-cyan/5" : "border-border bg-havn-surface/30"
            }`}
          >
            <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Drop files or folders here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                choose files
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Folder names like &ldquo;MapleRidge/CCRs.pdf&rdquo; help us auto-match.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={handleFileInput}
            />
          </div>

          {files.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-havn-surface/60">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">File</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Community</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="w-8 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {files.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      communities={communities}
                      onChangeCommunity={(id) =>
                        updateFile(f.id, {
                          communityId: id || null,
                          communityConfidence: id ? "high" : "unknown",
                          error: undefined,
                        })
                      }
                      onChangeCategory={(c) =>
                        updateFile(
                          f.id,
                          c === ""
                            ? {
                                // User picked "Auto-detect" — fall back to the
                                // server's Claude-based inference and mark the
                                // confidence as unknown.
                                category: "Other",
                                categoryConfidence: "unknown",
                              }
                            : {
                                category: c,
                                categoryConfidence: "high",
                              }
                        )
                      }
                      onRemove={() => removeFile(f.id)}
                      disabled={processing && f.status !== "skipped"}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer — fixed at bottom */}
        <div className="shrink-0 space-y-3 border-t border-border bg-card px-6 py-4">
          {autoDetectCount > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-havn-cyan/30 bg-havn-cyan/10 px-3 py-2 text-xs text-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-havn-cyan-deep" />
              <p>
                {autoDetectCount} file{autoDetectCount > 1 ? "s" : ""} set to{" "}
                <span className="font-medium">Auto-detect</span>. We&rsquo;ll figure out
                the right community from the document text. If we can&rsquo;t match
                confidently, we&rsquo;ll flag the file so you can pick.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={() => void processAll()}
              disabled={!allReady || processing || files.length === 0}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Process {files.length} document{files.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileRow({
  file,
  communities,
  onChangeCommunity,
  onChangeCategory,
  onRemove,
  disabled,
}: {
  file: PendingFile;
  communities: Community[];
  onChangeCommunity: (id: string) => void;
  onChangeCategory: (c: string) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const isAutoDetect = file.communityId === null;
  // The type column says "Auto-detect" whenever we couldn't confidently infer
  // the category from the filename. The server's existing Claude-based
  // category inference takes over in that case (we still send "Other" as the
  // fallback string so the API validation passes).
  const isAutoDetectType =
    file.category === "Other" && file.categoryConfidence === "unknown";
  return (
    <tr>
      <td className="max-w-[200px] px-3 py-2 align-middle">
        <p className="truncate font-medium text-foreground" title={file.file.name}>
          {file.file.name}
        </p>
        {file.pathHint && (
          <p className="truncate text-xs text-muted-foreground" title={file.pathHint}>
            {file.pathHint}
          </p>
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1.5">
          <select
            value={file.communityId ?? ""}
            onChange={(e) => onChangeCommunity(e.target.value)}
            disabled={disabled || file.status === "done"}
            className={`h-8 w-[180px] truncate rounded-md border border-border bg-background px-2 text-xs ${
              isAutoDetect ? "text-havn-cyan-deep" : "text-foreground"
            }`}
          >
            <option value="">✨ Auto-detect</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name}
              </option>
            ))}
          </select>
          {!isAutoDetect && <ConfidenceDot confidence={file.communityConfidence} />}
        </div>
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1.5">
          <select
            value={isAutoDetectType ? "" : file.category}
            onChange={(e) => onChangeCategory(e.target.value)}
            disabled={disabled || file.status === "done"}
            className={`h-8 w-[170px] truncate rounded-md border border-border bg-background px-2 text-xs ${
              isAutoDetectType ? "text-havn-cyan-deep" : "text-foreground"
            }`}
          >
            <option value="">✨ Auto-detect</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {!isAutoDetectType && <ConfidenceDot confidence={file.categoryConfidence} />}
        </div>
      </td>
      <td className="px-3 py-2 align-middle">
        <StatusBadge file={file} />
      </td>
      <td className="w-auto px-2 py-2 align-middle text-right">
        {file.status !== "done" && file.status !== "uploading" ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Remove file"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function ConfidenceDot({ confidence }: { confidence: Confidence }) {
  const map: Record<Confidence, { color: string; title: string }> = {
    high: { color: "bg-havn-success", title: "High confidence" },
    medium: { color: "bg-havn-amber", title: "Medium confidence — verify" },
    low: { color: "bg-havn-amber", title: "Low confidence — please verify" },
    unknown: { color: "bg-destructive", title: "Could not infer — please pick" },
  };
  const cfg = map[confidence];
  return <span title={cfg.title} className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.color}`} />;
}

function StatusBadge({ file }: { file: PendingFile }) {
  if (file.status === "uploading") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Uploading
      </span>
    );
  }
  if (file.status === "queued") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Queued
      </span>
    );
  }
  if (file.status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-havn-cyan-deep">
        <Sparkles className="h-3 w-3" />
        Processing
      </span>
    );
  }
  if (file.status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-havn-success">
        <CheckCircle2 className="h-3 w-3" />
        Done
      </span>
    );
  }
  if (file.status === "skipped") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title={file.duplicateOf ? `Existing: ${file.duplicateOf}` : undefined}
      >
        <Check className="h-3 w-3" />
        Already on file. No action needed.
      </span>
    );
  }
  if (file.status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive" title={file.error}>
        <AlertTriangle className="h-3 w-3" />
        Error
      </span>
    );
  }
  // The pending state for files where the server couldn't auto-route — surface
  // an inline "Pick community" prompt so the operator knows action is needed.
  if (file.error) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-havn-amber" title={file.error}>
        <AlertTriangle className="h-3 w-3" />
        Pick community
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="h-3 w-3" />
      Ready
    </span>
  );
}

// Recursive folder walker: flattens dropped directories into files with
// pathHints like "MapleRidge/CCRs.pdf" so guessCommunity can use the folder
// name as a strong signal.
async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: { file: File; pathHint?: string }[]
): Promise<void> {
  if (entry.isFile) {
    return new Promise<void>((resolve) => {
      (entry as FileSystemFileEntry).file((file) => {
        out.push({
          file,
          pathHint: prefix ? `${prefix}/${file.name}` : undefined,
        });
        resolve();
      });
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries: FileSystemEntry[] = await new Promise((resolve) => {
      reader.readEntries((es) => resolve(es as FileSystemEntry[]));
    });
    const next = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const e of entries) {
      await walkEntry(e, next, out);
    }
  }
}
