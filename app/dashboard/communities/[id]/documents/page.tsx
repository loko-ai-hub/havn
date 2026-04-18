"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Archive,
  FolderInput,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn, toTitleCase } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommunityRow = {
  id: string;
  legal_name: string;
  organization_id: string;
};

type CommunityDocumentRow = {
  id: string;
  community_id: string;
  organization_id: string;
  original_filename: string | null;
  document_category: string | null;
  ocr_status: "pending" | "processing" | "complete" | "failed" | string | null;
  page_count: number | null;
  created_at: string | null;
  storage_path_txt: string | null;
  storage_path_json: string | null;
  storage_path_pdf: string | null;
  archived: boolean | null;
};

// ─── Config ───────────────────────────────────────────────────────────────────

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
  "Unknown",
];

const REQUIRED_CATEGORIES = new Set([
  "CC&Rs / Declaration",
  "Bylaws",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
]);

// Nice-to-have categories — shown but not counted as missing or required.
const OPTIONAL_CATEGORIES = new Set(["FHA/VA Certification", "Management Agreement"]);

// These categories don't count toward completion metrics and are excluded from
// the "Missing" filter. "Other" is a quiet fallback bucket; "Unknown" is an
// error state that needs resolution but isn't something you "upload to".
const NON_METRIC_CATEGORIES = new Set(["Other", "Unknown", ...OPTIONAL_CATEGORIES]);
const TRACKABLE_CATEGORIES = CATEGORY_OPTIONS.filter((c) => !NON_METRIC_CATEGORIES.has(c));

const CATEGORY_COLORS: Record<string, string> = {
  "CC&Rs / Declaration": "text-[hsl(30,50%,40%)]",
  "Bylaws": "text-[hsl(220,50%,45%)]",
  "Amendments": "text-[hsl(270,40%,50%)]",
  "Financial Reports": "text-[hsl(45,60%,38%)]",
  "Insurance Certificate": "text-[hsl(160,50%,38%)]",
  "Reserve Study": "text-[hsl(180,40%,38%)]",
  "Budget": "text-[hsl(140,40%,38%)]",
  "Meeting Minutes": "text-[hsl(250,35%,50%)]",
  "Rules & Regulations": "text-[hsl(340,40%,50%)]",
  "Site Plan / Map": "text-[hsl(200,50%,42%)]",
  "FHA/VA Certification": "text-[hsl(15,55%,45%)]",
  "Management Agreement": "text-[hsl(240,35%,50%)]",
  "Other": "text-muted-foreground",
};

type StatusFilter = "all" | "complete" | "missing";

const SUGGESTED_QUESTIONS = [
  "What is the monthly HOA fee?",
  "Are pets allowed?",
  "What are the rental restrictions?",
  "What is the reserve fund balance?",
];

// ─── Multi-file upload types ──────────────────────────────────────────────────

type FileConfidence = "high" | "medium" | "unknown";
type FileUploadStatus = "pending" | "uploading" | "done" | "error" | "mismatch";

type PendingFile = {
  id: string;
  file: File;
  category: string;
  confidence: FileConfidence;
  status: FileUploadStatus;
  error?: string;
  ocrCategory?: string;
};

// ─── Category heuristics ─────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Array<{
  regex: RegExp;
  category: string;
  confidence: FileConfidence;
}> = [
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

function guessCategory(filename: string): { category: string; confidence: FileConfidence } {
  const name = filename.toLowerCase().replace(/[_\-.]/g, " ");
  for (const { regex, category, confidence } of CATEGORY_PATTERNS) {
    if (regex.test(name)) return { category, confidence };
  }
  return { category: "Other", confidence: "unknown" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function OcrBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "pending").toLowerCase();
  if (s === "complete") return null;
  if (s === "processing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-havn-amber/15 px-2 py-0.5 text-xs font-semibold text-havn-amber">
        <Loader2 className="h-3 w-3 animate-spin" /> Processing
      </span>
    );
  if (s === "failed")
    return (
      <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        Failed
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-muted/40 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      Pending
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommunityDocumentsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const communityId = Array.isArray(params.id) ? params.id[0] : params.id;

  const supabase = useMemo(() => createClient(), []);

  const [community, setCommunity] = useState<CommunityRow | null>(null);
  const [documents, setDocuments] = useState<CommunityDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const fileIdPrefix = useId();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORY_OPTIONS)
  );
  const [uploadOpen, setUploadOpen] = useState(() => searchParams.get("upload") === "true");

  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const [modalJson, setModalJson] = useState<Record<string, unknown> | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiAsking, setAiAsking] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const preselectCategoryRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) { setLoading(false); return; }

    let orgId: string | null =
      typeof user.user_metadata?.organization_id === "string"
        ? user.user_metadata.organization_id
        : null;

    if (!orgId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      orgId = (profile?.organization_id as string | undefined) ?? null;
    }

    if (!orgId) {
      setLoading(false);
      toast.error("No organization found for this account.");
      return;
    }

    const [communityRes, docsRes] = await Promise.all([
      supabase
        .from("communities")
        .select("id, legal_name, organization_id")
        .eq("id", communityId)
        .single(),
      supabase
        .from("community_documents")
        .select(
          "id, community_id, organization_id, original_filename, document_category, ocr_status, page_count, created_at, storage_path_txt, storage_path_json, storage_path_pdf, archived"
        )
        .eq("community_id", communityId)
        .order("created_at", { ascending: false }),
    ]);

    if (communityRes.error || !communityRes.data) {
      toast.error(communityRes.error?.message ?? "Community not found.");
      setLoading(false);
      return;
    }

    setCommunity(communityRes.data as CommunityRow);

    if (docsRes.error) {
      toast.error(docsRes.error.message);
      setDocuments([]);
    } else {
      setDocuments((docsRes.data ?? []) as CommunityDocumentRow[]);
    }

    setLoading(false);
  }, [communityId, supabase]);

  useEffect(() => { void load(); }, [load]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const forced = preselectCategoryRef.current;
    preselectCategoryRef.current = null;
    const newEntries: PendingFile[] = Array.from(files).map((file, i) => {
      if (forced) {
        return {
          id: `${fileIdPrefix}-${Date.now()}-${i}`,
          file,
          category: forced,
          confidence: "high" as FileConfidence,
          status: "pending" as FileUploadStatus,
        };
      }
      const { category, confidence } = guessCategory(file.name);
      return {
        id: `${fileIdPrefix}-${Date.now()}-${i}`,
        file,
        category,
        confidence,
        status: "pending" as FileUploadStatus,
      };
    });
    setPendingFiles((prev) => [...prev, ...newEntries]);
  };

  const updatePendingFile = (id: string, patch: Partial<PendingFile>) => {
    setPendingFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const handleProcessAll = async () => {
    if (!community) return;
    setIsProcessingAll(true);

    const toProcess = pendingFiles.filter((f) => f.status === "pending");

    for (const pf of toProcess) {
      updatePendingFile(pf.id, { status: "uploading" });

      const formData = new FormData();
      formData.append("file", pf.file);
      formData.append("communityId", community.id);
      formData.append("organizationId", community.organization_id);
      formData.append("category", pf.category);

      try {
        const response = await fetch("/api/documents/process", {
          method: "POST",
          body: formData,
        });
        const result = (await response.json()) as {
          success: boolean;
          error?: string;
          inferredCategory?: string | null;
          finalCategory?: string;
          wasUnknown?: boolean;
        };

        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Processing failed.");
        }

        const isUnknown = result.wasUnknown ?? true;
        const finalCategory = result.finalCategory ?? "Other";

        updatePendingFile(pf.id, {
          status: isUnknown ? "mismatch" : "done",
          category: finalCategory,
          ocrCategory: result.inferredCategory ?? undefined,
        });
      } catch (error) {
        updatePendingFile(pf.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed.",
        });
      }
    }

    setIsProcessingAll(false);
    await load();
  };

  const openDocument = (row: CommunityDocumentRow) => {
    if (!row.storage_path_pdf) { toast.info("Original file not available."); return; }
    window.open(`/api/documents/view?docId=${row.id}&type=pdf`, "_blank");
  };

  const handleArchiveDocument = async (doc: CommunityDocumentRow) => {
    if (!window.confirm(`Archive "${doc.original_filename ?? "this document"}"? It will be hidden but not deleted.`)) return;
    setDeletingDocId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      if (!res.ok) throw new Error();
      setDocuments((prev) => prev.map((d) => d.id === doc.id ? { ...d, archived: true } : d));
      toast.success("Document archived");
    } catch {
      toast.error("Failed to archive document");
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleMoveDocument = async (doc: CommunityDocumentRow, newCategory: string) => {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move", category: newCategory }),
    });
    if (!res.ok) { toast.error("Failed to move document"); return; }
    setDocuments((prev) =>
      prev.map((d) => d.id === doc.id ? { ...d, document_category: newCategory } : d)
    );
    setMovingDocId(null);
    toast.success(`Moved to ${newCategory}`);
  };

  // Category summary stats
  const categoryMap = useMemo(() => {
    const map = new Map<string, CommunityDocumentRow[]>();
    for (const cat of CATEGORY_OPTIONS) map.set(cat, []);
    for (const doc of documents) {
      if (doc.ocr_status === "failed" || doc.archived) continue;
      const cat = doc.document_category ?? "Other";
      const key = CATEGORY_OPTIONS.includes(cat) ? cat : "Other";
      map.get(key)!.push(doc);
    }
    return map;
  }, [documents]);

  const completeCategories = useMemo(
    () =>
      TRACKABLE_CATEGORIES.filter((cat) => (categoryMap.get(cat) ?? []).length > 0).length,
    [categoryMap]
  );

  const visibleCategories = useMemo(() => {
    return CATEGORY_OPTIONS.filter((cat) => {
      const docs = categoryMap.get(cat) ?? [];
      // Always hide Unknown when empty — it's only meaningful when it has docs
      if (cat === "Unknown" && docs.length === 0) return false;
      if (statusFilter === "complete") return docs.length > 0;
      // "Missing" filter only applies to trackable categories
      if (statusFilter === "missing") return docs.length === 0 && !NON_METRIC_CATEGORIES.has(cat);
      return true;
    });
  }, [categoryMap, statusFilter]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) { next.delete(cat); } else { next.add(cat); }
      return next;
    });
  };

  const openUploadForCategory = (cat: string) => {
    setUploadOpen(true);
    // After files are selected, we'll pre-set the category for that file.
    // For now, just open the panel — a note label on the drop zone could guide them.
    // We store the "preselect" as a ref so the onChange handler can pick it up.
    preselectCategoryRef.current = cat;
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
  };

  const handleAsk = async () => {
    const q = aiQuestion.trim();
    if (!q || aiAsking) return;
    setAiAsking(true);
    setAiAnswer("");
    try {
      const res = await fetch(`/api/communities/${communityId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("text/event-stream")) {
        const err = await res.json() as { error?: string };
        if (err.error === "no_docs") {
          setAiAnswer("No processed documents found for this community yet. Upload and OCR some documents first.");
        } else {
          setAiAnswer("Something went wrong. Please try again.");
        }
        return;
      }
      // Parse SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && parsed.delta.text) {
              answer += parsed.delta.text;
              setAiAnswer(answer);
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } finally {
      setAiAsking(false);
    }
  };

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 -mx-6 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/communities/${communityId}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-foreground" />
            <h1 className="text-lg font-semibold text-foreground">
              {community?.legal_name ? toTitleCase(community.legal_name) : "Documents"}
            </h1>
          </div>
          {!loading && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {completeCategories}/{TRACKABLE_CATEGORIES.length} categories
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {/* Summary bar */}
        {!loading && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {completeCategories}/{TRACKABLE_CATEGORIES.length}
                </p>
                <p className="text-xs text-muted-foreground">Categories complete</p>
              </div>
              {community && (
                <div className="border-l border-border pl-6">
                  <p className="text-sm font-medium text-foreground">{toTitleCase(community.legal_name)}</p>
                  <p className="text-xs text-muted-foreground">{documents.length} documents uploaded</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setUploadOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-havn-sand transition-colors hover:bg-havn-navy-light"
            >
              <Upload className="h-4 w-4" />
              Upload Documents
            </button>
          </div>
        )}

        {/* AI Q&A */}
        {!loading && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-havn-gold" />
                <span className="text-sm font-semibold text-foreground">Ask Havn</span>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", aiOpen && "rotate-180")} />
            </button>

            {aiOpen && (
              <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                {/* Suggested questions */}
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setAiQuestion(q)}
                      className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-havn-navy hover:text-white hover:border-havn-navy"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAsk(); }}
                    placeholder="Ask Havn anything about this community…"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-havn-navy/20"
                    disabled={aiAsking}
                  />
                  <button
                    type="button"
                    onClick={() => void handleAsk()}
                    disabled={aiAsking || !aiQuestion.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-havn-navy/90 disabled:opacity-50"
                  >
                    {aiAsking ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" /> Ask Havn</>
                    )}
                  </button>
                </div>

                {/* Answer */}
                {aiAnswer && (
                  <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {aiAnswer}
                    {aiAsking && <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status filter chips */}
        {!loading && (
          <div className="flex gap-2">
            {(["all", "complete", "missing"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                  statusFilter === f
                    ? "bg-havn-navy text-white"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {f === "all"
                  ? `All ${TRACKABLE_CATEGORIES.length}`
                  : f === "complete"
                  ? `Complete ${completeCategories}`
                  : `Missing ${TRACKABLE_CATEGORIES.length - completeCategories}`}
              </button>
            ))}
          </div>
        )}

        {/* Upload section (collapsible) */}
        {uploadOpen && (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Upload Documents</h2>
              <button
                type="button"
                onClick={() => { setUploadOpen(false); setPendingFiles([]); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>

            {/* Hidden file input — shared between drop zone and "add more" */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
              className="hidden"
              onChange={(e) => { handleFilesSelected(e.target.files); e.target.value = ""; }}
            />

            {pendingFiles.length === 0 ? (
              /* ── Drop zone ── */
              <label
                className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center hover:bg-muted/30 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFilesSelected(e.dataTransfer.files);
                }}
              >
                <span onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">Drop PDFs or DOCX files here</p>
                  <p className="mt-1 text-xs text-muted-foreground">Multiple files supported · click to browse</p>
                  <p className="mt-2 text-[11px] text-muted-foreground/70">
                    We&apos;ll review each document and auto-assign it to the right category. If we&apos;re not sure, we&apos;ll flag it for you.
                  </p>
                </span>
              </label>
            ) : (
              /* ── Review table ── */
              <div className="space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>File</span>
                  <span className="w-24 text-center">Confidence</span>
                  <span className="w-48">Category</span>
                  <span className="w-6" />
                </div>

                {/* File rows */}
                <div className="space-y-2">
                  {pendingFiles.map((pf) => (
                    <div
                      key={pf.id}
                      className={cn(
                        "grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        pf.status === "done" && "border-havn-success/30 bg-havn-success/5",
                        pf.status === "mismatch" && "border-havn-amber/30 bg-havn-amber/5",
                        pf.status === "error" && "border-destructive/30 bg-destructive/5",
                        pf.status === "uploading" && "border-primary/20 bg-primary/5",
                        pf.status === "pending" && "border-border bg-card",
                      )}
                    >
                      {/* File name + status */}
                      <div className="flex items-center gap-2 min-w-0">
                        {pf.status === "uploading" && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        )}
                        {pf.status === "done" && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-havn-success" />
                        )}
                        {pf.status === "mismatch" && (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-havn-amber" />
                        )}
                        {pf.status === "error" && (
                          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )}
                        {pf.status === "pending" && (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{pf.file.name}</p>
                          {pf.status === "mismatch" ? (
                            <p className="text-[11px] text-havn-amber">
                              Moved to Other — please reassign to the correct category
                            </p>
                          ) : pf.status === "error" ? (
                            <p className="text-[11px] text-destructive">{pf.error}</p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              {(pf.file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Confidence badge */}
                      <div className="w-24 text-center">
                        {pf.status === "done" ? (
                          <span className="inline-flex rounded-full bg-havn-success/10 px-2 py-0.5 text-[10px] font-semibold text-havn-success">
                            Verified
                          </span>
                        ) : pf.status === "mismatch" ? (
                          <span className="inline-flex rounded-full bg-havn-amber/15 px-2 py-0.5 text-[10px] font-semibold text-havn-amber">
                            Mismatch
                          </span>
                        ) : pf.status === "error" ? (
                          <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                            Failed
                          </span>
                        ) : pf.confidence === "high" ? (
                          <span className="inline-flex rounded-full bg-havn-success/10 px-2 py-0.5 text-[10px] font-semibold text-havn-success">
                            Auto
                          </span>
                        ) : pf.confidence === "medium" ? (
                          <span className="inline-flex rounded-full bg-havn-amber/15 px-2 py-0.5 text-[10px] font-semibold text-havn-amber">
                            Likely
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Pending
                          </span>
                        )}
                      </div>

                      {/* Category — read-only before OCR, editable after */}
                      {pf.status === "pending" || pf.status === "uploading" ? (
                        <span className="w-48 truncate rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                          {pf.category}
                        </span>
                      ) : (
                        <select
                          value={pf.category}
                          onChange={(e) => updatePendingFile(pf.id, { category: e.target.value, confidence: "high" })}
                          className="w-48 h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}

                      {/* Remove button */}
                      <button
                        type="button"
                        disabled={pf.status === "uploading"}
                        onClick={() => setPendingFiles((prev) => prev.filter((f) => f.id !== pf.id))}
                        className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Bottom action bar */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingAll}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add more files
                  </button>

                  <div className="flex items-center gap-3">
                    {pendingFiles.every((f) => f.status !== "pending") && (
                      <button
                        type="button"
                        onClick={() => { setUploadOpen(false); setPendingFiles([]); }}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Done
                      </button>
                    )}
                    {pendingFiles.some((f) => f.status === "pending") && (
                      <button
                        type="button"
                        disabled={isProcessingAll}
                        onClick={() => void handleProcessAll()}
                        className="inline-flex items-center gap-2 rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-havn-sand transition-colors hover:bg-havn-navy-light disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessingAll && <Loader2 className="h-4 w-4 animate-spin" />}
                        Upload {pendingFiles.filter((f) => f.status === "pending").length} file{pendingFiles.filter((f) => f.status === "pending").length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Unknown documents — resolution banner */}
        {!loading && (categoryMap.get("Unknown") ?? []).length > 0 && (() => {
          const unknownCount = (categoryMap.get("Unknown") ?? []).length;
          return (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  {unknownCount} document{unknownCount > 1 ? "s" : ""} need{unknownCount === 1 ? "s" : ""} categorization
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These documents couldn&apos;t be automatically classified. Assign each to the correct category — even &quot;Other&quot; — before they can be used in orders.
                </p>
              </div>
            </div>
          );
        })()}

        {/* Category accordion */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading documents…</p>
        ) : (
          <div className="space-y-3">
            {visibleCategories.map((cat) => {
              const catDocs = categoryMap.get(cat) ?? [];
              const isExpanded = expandedCategories.has(cat);
              const isComplete = catDocs.length > 0;
              const isRequired = REQUIRED_CATEGORIES.has(cat);
              const isUnknown = cat === "Unknown";
              const isOther = cat === "Other";
              const isOptional = OPTIONAL_CATEGORIES.has(cat);
              return (
                <div
                  key={cat}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-card",
                    isUnknown ? "border-destructive/40" : "border-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      "flex w-full items-center justify-between px-5 py-3 transition-colors",
                      isUnknown
                        ? "bg-destructive/5 hover:bg-destructive/8"
                        : "bg-havn-navy/5 hover:bg-havn-navy/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className={cn("h-4 w-4", isUnknown ? "text-destructive" : "text-havn-navy")} />
                      ) : (
                        <ChevronRight className={cn("h-4 w-4", isUnknown ? "text-destructive" : "text-havn-navy")} />
                      )}
                      {isUnknown ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-havn-navy" />
                      )}
                      <span className={cn("text-sm font-semibold", isUnknown ? "text-destructive" : "text-havn-navy")}>
                        {cat}
                      </span>
                      {isRequired && !isComplete && (
                        <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isUnknown ? (
                        // Unknown: always destructive when visible (hidden when empty)
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {catDocs.length} unresolved
                        </span>
                      ) : isOther ? (
                        // Other: quiet count when has docs, nothing when empty
                        isComplete ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {catDocs.length} uploaded
                          </span>
                        ) : null
                      ) : isOptional ? (
                        // Optional: green when has docs, amber "Optional" when empty
                        isComplete ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-havn-success/10 px-2.5 py-0.5 text-xs font-semibold text-havn-success">
                            <Check className="h-3 w-3" />
                            {catDocs.length} uploaded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-havn-amber/15 px-2.5 py-0.5 text-xs font-medium text-havn-amber">
                            Optional
                          </span>
                        )
                      ) : isComplete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-havn-success/10 px-2.5 py-0.5 text-xs font-semibold text-havn-success">
                          <Check className="h-3 w-3" />
                          {catDocs.length} uploaded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          Missing
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      {catDocs.length === 0 ? (
                        // Empty state — "Other" gets a quiet neutral look; regular categories get the upload prompt
                        isOther ? (
                          <div className="px-5 py-4 text-sm text-muted-foreground">
                            No documents in this category yet. Any document that doesn&apos;t fit a specific category will land here.
                          </div>
                        ) : isOptional ? (
                          <div className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Upload className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium text-foreground">Not uploaded yet</p>
                                <p className="text-xs text-muted-foreground">Optional — upload if available</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openUploadForCategory(cat)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                              <Upload className="h-3 w-3" />
                              Upload
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-destructive/[0.03] px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Upload className="h-4 w-4 text-destructive" />
                              <div>
                                <p className="text-sm font-medium text-foreground">Not uploaded yet</p>
                                {isRequired && (
                                  <p className="text-xs text-muted-foreground">Required for auto-fill</p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openUploadForCategory(cat)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-havn-navy px-3 py-1.5 text-xs font-medium text-havn-sand transition-colors hover:bg-havn-navy-light"
                            >
                              <Upload className="h-3 w-3" />
                              Upload
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="divide-y divide-border/50">
                          {catDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className={cn(
                                "flex items-center justify-between px-5 py-3 transition-colors",
                                isUnknown ? "bg-destructive/[0.03] hover:bg-destructive/5" : "hover:bg-muted/20"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <FileText className={cn("h-4 w-4 shrink-0", isUnknown ? "text-destructive" : "text-havn-navy")} />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {doc.original_filename ? toTitleCase(doc.original_filename) : "—"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(doc.created_at)}
                                    {doc.page_count ? ` · ${doc.page_count} pages` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2 ml-4">
                                <OcrBadge status={doc.ocr_status} />
                                <button
                                  type="button"
                                  onClick={() => openDocument(doc)}
                                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                >
                                  View
                                </button>
                                {/* Move / Resolve */}
                                {movingDocId === doc.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      defaultValue={doc.document_category ?? ""}
                                      autoFocus
                                      onChange={(e) => void handleMoveDocument(doc, e.target.value)}
                                      className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                      {CATEGORY_OPTIONS.filter((o) => o !== "Unknown").map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => setMovingDocId(null)}
                                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : isUnknown ? (
                                  <button
                                    type="button"
                                    onClick={() => setMovingDocId(doc.id)}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1 text-xs font-semibold text-white hover:bg-destructive/90 transition-colors"
                                  >
                                    <FolderInput className="h-3.5 w-3.5" />
                                    Resolve
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="Move to category"
                                    onClick={() => setMovingDocId(doc.id)}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  >
                                    <FolderInput className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {/* Archive */}
                                <button
                                  type="button"
                                  title="Archive document"
                                  disabled={deletingDocId === doc.id}
                                  onClick={() => void handleArchiveDocument(doc)}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                                >
                                  {deletingDocId === doc.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Archive className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </div>
                          ))}
                          {/* Add more button — not shown for Unknown */}
                          {!isUnknown && (
                            <div className="flex items-center justify-between px-5 py-3 bg-muted/10">
                              <p className="text-xs text-muted-foreground">
                                Add another {cat} document
                              </p>
                              <button
                                type="button"
                                onClick={() => openUploadForCategory(cat)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              >
                                <Upload className="h-3 w-3" />
                                Upload
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal — extracted fields viewer */}
      {modalJson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setModalJson(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Extracted Fields</h3>
              <button
                type="button"
                onClick={() => setModalJson(null)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              {Object.entries(modalJson).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {key}
                  </p>
                  <p className="mt-1 text-foreground">
                    {Array.isArray(value)
                      ? value.length === 0 ? "[]" : value.join(", ")
                      : value === null || value === undefined || value === ""
                      ? "—"
                      : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
