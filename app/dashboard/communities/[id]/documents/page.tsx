"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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
};

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  "CC&Rs / Declaration",
  "Bylaws",
  "Amendments",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
  "Meeting Minutes",
  "Rules & Regulations",
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
  "Other": "text-muted-foreground",
};

type StatusFilter = "all" | "complete" | "missing";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function OcrBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "pending").toLowerCase();
  if (s === "complete")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-havn-success/10 px-2 py-0.5 text-xs font-semibold text-havn-success">
        <Check className="h-3 w-3" /> Complete
      </span>
    );
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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [uploadStep, setUploadStep] = useState<"idle" | "uploading" | "ocr" | "extracting">("idle");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORY_OPTIONS)
  );
  const [uploadOpen, setUploadOpen] = useState(() => searchParams.get("upload") === "true");

  const [modalText, setModalText] = useState<string | null>(null);
  const [modalJson, setModalJson] = useState<Record<string, unknown> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) { setLoading(false); return; }

    const orgId =
      typeof user.user_metadata?.organization_id === "string"
        ? user.user_metadata.organization_id
        : null;

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
          "id, community_id, organization_id, original_filename, document_category, ocr_status, page_count, created_at, storage_path_txt, storage_path_json"
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

  const handleProcess = async () => {
    if (!selectedFile || !community) return;
    setUploadStep("uploading");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("communityId", community.id);
    formData.append("organizationId", community.organization_id);
    formData.append("category", category);

    const stepTimer = window.setTimeout(() => setUploadStep("ocr"), 400);
    const stepTimer2 = window.setTimeout(() => setUploadStep("extracting"), 1200);

    try {
      const response = await fetch("/api/documents/process", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Document processing failed.");
      }

      toast.success("Document processed successfully");
      setSelectedFile(null);
      setUploadStep("idle");
      setUploadOpen(false);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Processing failed.";
      toast.error(message);
      setUploadStep("idle");
    } finally {
      window.clearTimeout(stepTimer);
      window.clearTimeout(stepTimer2);
    }
  };

  const viewText = async (row: CommunityDocumentRow) => {
    if (!row.storage_path_txt) { toast.info("No OCR text available yet."); return; }
    const { data, error } = await supabase.storage
      .from("community-documents")
      .download(row.storage_path_txt);
    if (error || !data) { toast.error(error?.message ?? "Unable to load text file."); return; }
    setModalText((await data.text()) || "(empty)");
    setModalJson(null);
  };

  const viewFields = async (row: CommunityDocumentRow) => {
    if (!row.storage_path_json) { toast.info("No extracted fields available yet."); return; }
    const { data, error } = await supabase.storage
      .from("community-documents")
      .download(row.storage_path_json);
    if (error || !data) { toast.error(error?.message ?? "Unable to load fields file."); return; }
    try {
      setModalJson(JSON.parse(await data.text()) as Record<string, unknown>);
      setModalText(null);
    } catch {
      toast.error("Fields file is not valid JSON.");
    }
  };

  const uploading = uploadStep !== "idle";

  // Category summary stats
  const categoryMap = useMemo(() => {
    const map = new Map<string, CommunityDocumentRow[]>();
    for (const cat of CATEGORY_OPTIONS) map.set(cat, []);
    for (const doc of documents) {
      const cat = doc.document_category ?? "Other";
      const key = CATEGORY_OPTIONS.includes(cat) ? cat : "Other";
      map.get(key)!.push(doc);
    }
    return map;
  }, [documents]);

  const completeCategories = useMemo(
    () =>
      CATEGORY_OPTIONS.filter((cat) => (categoryMap.get(cat) ?? []).length > 0).length,
    [categoryMap]
  );

  const visibleCategories = useMemo(() => {
    return CATEGORY_OPTIONS.filter((cat) => {
      const docs = categoryMap.get(cat) ?? [];
      if (statusFilter === "complete") return docs.length > 0;
      if (statusFilter === "missing") return docs.length === 0;
      return true;
    });
  }, [categoryMap, statusFilter]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const openUploadForCategory = (cat: string) => {
    setCategory(cat);
    setUploadOpen(true);
    // small delay so the section opens before scrolling
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
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
              {community?.legal_name ?? "Documents"}
            </h1>
          </div>
          {!loading && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {completeCategories}/{CATEGORY_OPTIONS.length} categories
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
                  {completeCategories}/{CATEGORY_OPTIONS.length}
                </p>
                <p className="text-xs text-muted-foreground">Categories complete</p>
              </div>
              {community && (
                <div className="border-l border-border pl-6">
                  <p className="text-sm font-medium text-foreground">{community.legal_name}</p>
                  <p className="text-xs text-muted-foreground">{documents.length} documents uploaded</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setUploadOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-havn-navy/90"
            >
              <Upload className="h-4 w-4" />
              Upload Document
            </button>
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
                  ? `All ${CATEGORY_OPTIONS.length}`
                  : f === "complete"
                  ? `Complete ${completeCategories}`
                  : `Missing ${CATEGORY_OPTIONS.length - completeCategories}`}
              </button>
            ))}
          </div>
        )}

        {/* Upload section (collapsible) */}
        {uploadOpen && (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Upload & Process Document</h2>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center hover:bg-muted/30 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-foreground">Drop PDF or DOCX here</p>
                <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
                {selectedFile && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </label>

              <div className="max-w-sm space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={!selectedFile || uploading}
                onClick={() => void handleProcess()}
                className="inline-flex items-center gap-2 rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-havn-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploadStep === "uploading"
                  ? "Uploading…"
                  : uploadStep === "ocr"
                  ? "Running OCR…"
                  : uploadStep === "extracting"
                  ? "Extracting fields…"
                  : "Process Document"}
              </button>
            </div>
          </section>
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
              const iconColor = CATEGORY_COLORS[cat] ?? "text-muted-foreground";

              return (
                <div key={cat} className="overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <FileText className={cn("h-4 w-4 shrink-0", iconColor)} />
                      <span className="text-sm font-semibold text-foreground">{cat}</span>
                      {isRequired && !isComplete && (
                        <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isComplete ? (
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
                            className="inline-flex items-center gap-1.5 rounded-md bg-havn-navy px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-havn-navy/90"
                          >
                            <Upload className="h-3 w-3" />
                            Upload
                          </button>
                        </div>
                      ) : (
                        <div className="divide-y divide-border/50">
                          {catDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <FileText className="h-4 w-4 shrink-0 text-havn-success" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {doc.original_filename ?? "—"}
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
                                  onClick={() => void viewText(doc)}
                                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                >
                                  View Text
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void viewFields(doc)}
                                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                >
                                  View Fields
                                </button>
                              </div>
                            </div>
                          ))}
                          {/* Add more button */}
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

      {/* Modal — text or fields viewer */}
      {(modalText ?? modalJson) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => { setModalText(null); setModalJson(null); }}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                {modalText ? "Raw OCR Text" : "Extracted Fields"}
              </h3>
              <button
                type="button"
                onClick={() => { setModalText(null); setModalJson(null); }}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>

            {modalText && (
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/25 p-3 text-xs text-foreground">
                {modalText}
              </pre>
            )}

            {modalJson && (
              <div className="space-y-2">
                {Object.entries(modalJson).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {key}
                    </p>
                    <p className="mt-1 text-foreground">
                      {Array.isArray(value)
                        ? value.length === 0
                          ? "[]"
                          : value.join(", ")
                        : value === null || value === undefined || value === ""
                        ? "null"
                        : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
