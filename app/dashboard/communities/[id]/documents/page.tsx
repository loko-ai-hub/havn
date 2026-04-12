"use client";

import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "pending").toLowerCase();
  if (s === "complete") {
    return (
      <span className="inline-flex rounded-full border border-havn-success/40 bg-havn-success/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
        Complete
      </span>
    );
  }
  if (s === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-havn-amber/40 bg-havn-amber/20 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="inline-flex rounded-full border border-destructive/40 bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      Pending
    </span>
  );
}

export default function CommunityDocumentsPage() {
  const params = useParams<{ id: string }>();
  const communityId = Array.isArray(params.id) ? params.id[0] : params.id;

  const supabase = useMemo(() => createClient(), []);

  const [community, setCommunity] = useState<CommunityRow | null>(null);
  const [documents, setDocuments] = useState<CommunityDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [uploadStep, setUploadStep] = useState<"idle" | "uploading" | "ocr" | "extracting">("idle");

  const [modalText, setModalText] = useState<string | null>(null);
  const [modalJson, setModalJson] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

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

  useEffect(() => {
    void load();
  }, [load]);

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
    if (!row.storage_path_txt) {
      toast.info("No OCR text available yet.");
      return;
    }
    const { data, error } = await supabase.storage
      .from("community-documents")
      .download(row.storage_path_txt);
    if (error || !data) {
      toast.error(error?.message ?? "Unable to load text file.");
      return;
    }
    const text = await data.text();
    setModalText(text || "(empty)");
    setModalJson(null);
  };

  const viewFields = async (row: CommunityDocumentRow) => {
    if (!row.storage_path_json) {
      toast.info("No extracted fields available yet.");
      return;
    }
    const { data, error } = await supabase.storage
      .from("community-documents")
      .download(row.storage_path_json);
    if (error || !data) {
      toast.error(error?.message ?? "Unable to load fields file.");
      return;
    }

    try {
      const json = JSON.parse(await data.text()) as Record<string, unknown>;
      setModalJson(json);
      setModalText(null);
    } catch {
      toast.error("Fields file is not valid JSON.");
    }
  };

  const uploading = uploadStep !== "idle";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/dashboard/communities/${communityId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          <span aria-hidden>←</span> Back to community
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground">{community?.legal_name ?? "Community"}</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Upload & Process</h2>

        <div className="mt-4 space-y-4">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center hover:bg-muted/30">
            <input
              type="file"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
              className="hidden"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-sm font-medium text-foreground">Drag and drop PDF or DOCX here</p>
            <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
            {selectedFile ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            ) : null}
          </label>

          <div className="max-w-sm space-y-2">
            <label className="text-sm font-medium text-foreground">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" disabled={!selectedFile || uploading} onClick={() => void handleProcess()}>
              {uploadStep === "uploading"
                ? "Uploading..."
                : uploadStep === "ocr"
                ? "Running OCR..."
                : uploadStep === "extracting"
                ? "Extracting fields..."
                : "Process Document"}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Documents</h2>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : documents.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                  <TableHead>Filename</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>OCR Status</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((row) => (
                  <TableRow key={row.id} className="border-border hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">{row.original_filename ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.document_category ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.ocr_status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.page_count ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(row.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => void viewText(row)}>
                          View Text
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void viewFields(row)}>
                          View Fields
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {(modalText || modalJson) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => { setModalText(null); setModalJson(null); }}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">{modalText ? "Raw OCR Text" : "Extracted Fields"}</h3>
              <Button variant="outline" size="sm" onClick={() => { setModalText(null); setModalJson(null); }}>
                Close
              </Button>
            </div>

            {modalText ? (
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/25 p-3 text-xs text-foreground">{modalText}</pre>
            ) : null}

            {modalJson ? (
              <div className="space-y-2">
                {Object.entries(modalJson).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key}</p>
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
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
