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
];

const REQUIRED_CATEGORIES = new Set([
  "CC&Rs / Declaration",
  "Bylaws",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
]);

const OPTIONAL_CATEGORIES = new Set(["FHA/VA Certification", "Management Agreement"]);

const NON_METRIC_CATEGORIES = new Set(["Other", ...OPTIONAL_CATEGORIES]);
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
type FileUploadStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "duplicate";

type PendingFile = {
  id: string;
  file: File;
  category: string;
  confidence: FileConfidence;
  status: FileUploadStatus;
  error?: string;
  ocrCategory?: string;
  duplicateOf?: string;
  documentId?: string;
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

  // Realtime + polling: keep `documents` in sync as background OCR finishes.
  // The /api/documents/process endpoint returns immediately and runs OCR in
  // an after() block — without this, fresh uploads sit in "Other / Processing"
  // until the user manually refreshes. Polling fallback every 8s covers the
  // case where the realtime channel drops.
  useEffect(() => {
    if (!communityId) return;

    const mergeRow = (row: Partial<CommunityDocumentRow> & { id: string }) => {
      setDocuments((prev) => {
        const idx = prev.findIndex((d) => d.id === row.id);
        if (idx === -1) {
          // New row inserted by upload — only adopt if it belongs to this community
          if (row.community_id && row.community_id !== communityId) return prev;
          return [{ ...(row as CommunityDocumentRow) }, ...prev];
        }
        const next = prev.slice();
        next[idx] = { ...next[idx], ...row };
        return next;
      });
    };

    const channel = supabase
      .channel(`community-docs-${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_documents",
          filter: `community_id=eq.${communityId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id?: string };
            if (oldRow?.id) {
              setDocuments((prev) => prev.filter((d) => d.id !== oldRow.id));
            }
            return;
          }
          const row = payload.new as Partial<CommunityDocumentRow> & { id: string };
          mergeRow(row);
        }
      )
      .subscribe();

    const pollId = window.setInterval(async () => {
      // Only refetch while at least one row is still in flight — otherwise
      // we're burning queries. Read latest state via a fresh closure.
      setDocuments((current) => {
        const inFlight = current.some(
          (d) => d.ocr_status === "processing" || d.ocr_status === "pending"
        );
        if (inFlight) {
          void supabase
            .from("community_documents")
            .select(
              "id, community_id, organization_id, original_filename, document_category, ocr_status, page_count, created_at, storage_path_txt, storage_path_json, storage_path_pdf, archived"
            )
            .eq("community_id", communityId)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              if (data) setDocuments(data as CommunityDocumentRow[]);
            });
        }
        return current;
      });
    }, 8_000);

    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(pollId);
    };
  }, [communityId, supabase]);

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

    const queue = pendingFiles.filter((f) => f.status === "pending");

    const processOne = async (pf: PendingFile) => {
      // Fetch is the whole pipeline (upload + OCR + classification). Show
      // "processing" for the duration so the user sees an honest signal:
      // "we're reading and categorizing this file."
      updatePendingFile(pf.id, { status: "processing" });

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
          documentId?: string;
          duplicate?: boolean;
          existingFilename?: string | null;
          existingCategory?: string | null;
          inferredCategory?: string | null;
          finalCategory?: string | null;
          finalFilename?: string | null;
          ocrStatus?: "complete" | "failed" | "processing" | "pending";
          ocrError?: string;
        };

        if (result.duplicate) {
          updatePendingFile(pf.id, {
            status: "duplicate",
            duplicateOf: result.existingFilename ?? undefined,
            category: result.existingCategory ?? pf.category,
          });
          return;
        }

        if (!response.ok || !result.success || !result.documentId) {
          throw new Error(result.error ?? "Processing failed.");
        }

        if (result.ocrStatus === "complete") {
          updatePendingFile(pf.id, {
            status: "done",
            documentId: result.documentId,
            category: result.finalCategory ?? pf.category,
            confidence: "high",
            ocrCategory: result.inferredCategory ?? undefined,
          });
        } else if (result.ocrStatus === "failed") {
          updatePendingFile(pf.id, {
            status: "error",
            documentId: result.documentId,
            error: result.ocrError ?? "Document couldn't be read.",
          });
        } else {
          updatePendingFile(pf.id, {
            status: "error",
            documentId: result.documentId,
            error: "OCR didn't finish. Restart your dev server or try uploading again.",
          });
        }

        // Optimistically mirror the response into `documents` state so the
        // docs list updates simultaneously with the modal. Realtime stays as
        // the eventual-consistency backstop.
        if (
          result.documentId &&
          (result.ocrStatus === "complete" || result.ocrStatus === "failed")
        ) {
          const finalRowOcrStatus = result.ocrStatus;
          const finalRowCategory = result.finalCategory ?? null;
          const finalRowFilename = result.finalFilename ?? pf.file.name;
          const documentId = result.documentId;
          setDocuments((prev) => {
            const idx = prev.findIndex((d) => d.id === documentId);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = {
                ...next[idx],
                ocr_status: finalRowOcrStatus,
                document_category: finalRowCategory,
                original_filename: finalRowFilename,
              };
              return next;
            }
            const optimisticRow: CommunityDocumentRow = {
              id: documentId,
              community_id: community.id,
              organization_id: community.organization_id,
              original_filename: finalRowFilename,
              document_category: finalRowCategory,
              ocr_status: finalRowOcrStatus,
              page_count: null,
              created_at: new Date().toISOString(),
              storage_path_txt: null,
              storage_path_json: null,
              storage_path_pdf: null,
              archived: false,
            };
            return [optimisticRow, ...prev];
          });
        }
      } catch (error) {
        updatePendingFile(pf.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed.",
        });
      }
    };

    // Bounded-concurrency worker pool. 3 is the sweet spot: ~3x faster than
    // strictly serial without hammering rate limits or making the visual
    // flow ("which file is being worked on?") unreadable.
    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor++;
        if (idx >= queue.length) return;
        await processOne(queue[idx]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
    );

    setIsProcessingAll(false);
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

  // After 90 seconds in 'processing' or 'pending' a row is treated as stalled
  // — Vercel function instances can die mid-after(), leaving rows wedged in
  // limbo. We surface these in a dedicated "Stalled" section instead of
  // letting them pollute category buckets or sit forever in Processing.
  const STALL_THRESHOLD_MS = 90_000;

  const docState = useCallback(
    (
      d: CommunityDocumentRow
    ):
      | "complete"
      | "failed"
      | "in_flight"
      | "stalled" => {
      const status = (d.ocr_status ?? "").toLowerCase();
      if (status === "complete") return "complete";
      if (status === "failed") return "failed";
      const created = d.created_at ? new Date(d.created_at).getTime() : 0;
      if (created > 0 && Date.now() - created > STALL_THRESHOLD_MS) {
        return "stalled";
      }
      return "in_flight";
    },
    []
  );

  // Active in-flight uploads. Render in the "Processing" section above the
  // accordion — never in a category bucket.
  const processingDocs = useMemo(
    () =>
      documents.filter(
        (d) => !d.archived && docState(d) === "in_flight"
      ),
    [documents, docState]
  );

  // Stalled or failed: user-actionable. Both render in the "needs attention"
  // section with a Discard button so the user can clear and re-upload.
  const stalledDocs = useMemo(
    () =>
      documents.filter(
        (d) =>
          !d.archived &&
          (docState(d) === "stalled" || docState(d) === "failed")
      ),
    [documents, docState]
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, CommunityDocumentRow[]>();
    for (const cat of CATEGORY_OPTIONS) map.set(cat, []);
    for (const doc of documents) {
      if (doc.archived) continue;
      // STRICT: only fully-classified rows land in a category bucket. Failed
      // and stalled rows render in their own sections so users can act on
      // them. Pending/processing rows render in Processing.
      if (docState(doc) !== "complete") continue;
      // Coerce legacy "Unknown" rows defensively — server already maps these
      // to "Other" on insert, but old data may still exist.
      const raw = doc.document_category ?? "Other";
      const cat = raw === "Unknown" ? "Other" : raw;
      const key = CATEGORY_OPTIONS.includes(cat) ? cat : "Other";
      map.get(key)!.push(doc);
    }
    return map;
  }, [documents, docState]);

  const completeCategories = useMemo(
    () =>
      TRACKABLE_CATEGORIES.filter((cat) => (categoryMap.get(cat) ?? []).length > 0).length,
    [categoryMap]
  );

  const visibleCategories = useMemo(() => {
    return CATEGORY_OPTIONS.filter((cat) => {
      const docs = categoryMap.get(cat) ?? [];
      if (statusFilter === "complete") return docs.length > 0;
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
                        pf.status === "duplicate" && "border-border bg-muted/30",
                        pf.status === "error" && "border-destructive/30 bg-destructive/5",
                        pf.status === "uploading" && "border-primary/20 bg-primary/5",
                        pf.status === "processing" && "border-havn-cyan/30 bg-havn-cyan/5",
                        pf.status === "pending" && "border-border bg-card",
                      )}
                    >
                      {/* File name + status */}
                      <div className="flex items-center gap-2 min-w-0">
                        {pf.status === "uploading" && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        )}
                        {pf.status === "processing" && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-havn-cyan-deep" />
                        )}
                        {pf.status === "done" && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-havn-success" />
                        )}
                        {pf.status === "duplicate" && (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        {pf.status === "error" && (
                          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )}
                        {pf.status === "pending" && (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{pf.file.name}</p>
                          {pf.status === "duplicate" ? (
                            <p
                              className="text-[11px] text-muted-foreground"
                              title={pf.duplicateOf ? `Existing: ${pf.duplicateOf}` : undefined}
                            >
                              Already on file. No action needed.
                            </p>
                          ) : pf.status === "processing" ? (
                            <p className="text-[11px] text-havn-cyan-deep">
                              Reading and categorizing…
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
                        ) : pf.status === "processing" ? (
                          <span className="inline-flex rounded-full bg-havn-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-havn-cyan-deep">
                            Reading
                          </span>
                        ) : pf.status === "duplicate" ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            On file
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

                      {/* Category — read-only while in flight, editable after */}
                      {pf.status === "pending" ||
                      pf.status === "uploading" ||
                      pf.status === "processing" ? (
                        <span className="w-48 truncate rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                          {pf.status === "processing" ? "Detecting…" : pf.category}
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
                        disabled={pf.status === "uploading" || pf.status === "processing"}
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
                    {pendingFiles.length > 0 &&
                      pendingFiles.every(
                        (f) =>
                          f.status === "done" ||
                          f.status === "error" ||
                          f.status === "duplicate"
                      ) && (
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

        {/* Processing — in-flight uploads, hidden from category buckets until OCR + classification settle */}
        {!loading && processingDocs.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3 bg-havn-navy/5 border-b border-border">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-havn-navy" />
              <span className="text-sm font-semibold text-havn-navy">
                Processing {processingDocs.length} document{processingDocs.length === 1 ? "" : "s"}
              </span>
              <span className="text-xs text-muted-foreground">
                Auto-categorizing. They&apos;ll move to the right bucket once ready.
              </span>
            </div>
            <div className="divide-y divide-border/50">
              {processingDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground truncate">
                      {doc.original_filename ? toTitleCase(doc.original_filename) : "—"}
                    </p>
                  </div>
                  <OcrBadge status={doc.ocr_status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stalled — rows that have been in flight too long. Server-side OCR
            likely failed without recording it (function instance died, etc.).
            User can discard to clear and re-upload. */}
        {!loading && stalledDocs.length > 0 && (
          <div className="rounded-xl border border-havn-amber/40 bg-havn-amber/5 overflow-hidden">
            <div className="flex items-center justify-between gap-2.5 px-5 py-3 bg-havn-amber/10 border-b border-havn-amber/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-havn-amber" />
                <span className="text-sm font-semibold text-havn-amber">
                  {stalledDocs.length} document{stalledDocs.length === 1 ? "" : "s"} stalled
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  Processing took longer than expected. Discard to clear and try again.
                </span>
              </div>
              {stalledDocs.length > 1 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Discard all ${stalledDocs.length} stalled documents?`)) return;
                    for (const doc of stalledDocs) {
                      await fetch(`/api/documents/${doc.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "archive" }),
                      });
                    }
                    setDocuments((prev) =>
                      prev.map((d) =>
                        stalledDocs.some((s) => s.id === d.id) ? { ...d, archived: true } : d
                      )
                    );
                    toast.success(`Discarded ${stalledDocs.length} stalled documents`);
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-havn-amber/40 bg-background px-2.5 py-1 text-xs font-medium text-havn-amber transition-colors hover:bg-havn-amber/10"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Discard all
                </button>
              )}
            </div>
            <div className="divide-y divide-havn-amber/20">
              {stalledDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {doc.original_filename ? toTitleCase(doc.original_filename) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Stuck since {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={deletingDocId === doc.id}
                    onClick={() => void handleArchiveDocument(doc)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-havn-amber/40 bg-background px-2.5 py-1 text-xs font-medium text-havn-amber transition-colors hover:bg-havn-amber/10 disabled:opacity-40"
                  >
                    {deletingDocId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    Discard
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
              const isOther = cat === "Other";
              const isOptional = OPTIONAL_CATEGORIES.has(cat);
              return (
                <div
                  key={cat}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between px-5 py-3 transition-colors bg-havn-navy/5 hover:bg-havn-navy/10"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-havn-navy" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-havn-navy" />
                      )}
                      <FileText className="h-4 w-4 shrink-0 text-havn-navy" />
                      <span className="text-sm font-semibold text-havn-navy">
                        {cat}
                      </span>
                      {isRequired && !isComplete && (
                        <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isOther ? (
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
                              className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/20"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <FileText className="h-4 w-4 shrink-0 text-havn-navy" />
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
                                {movingDocId === doc.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      defaultValue={doc.document_category ?? ""}
                                      autoFocus
                                      onChange={(e) => void handleMoveDocument(doc, e.target.value)}
                                      className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                      {CATEGORY_OPTIONS.map((opt) => (
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
