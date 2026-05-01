"use client";

import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import BulkDocumentUpload from "./bulk-document-upload";

// ─── Types ────────────────────────────────────────────────────────────────────

type Community = {
  id: string;
  legal_name: string;
};

type DocRow = {
  community_id: string;
  document_category: string | null;
  ocr_status: string | null;
};

// ─── Config ───────────────────────────────────────────────────────────────────

// Keep in sync with REQUIRED_CATEGORIES in /dashboard/communities/page.tsx
// and /dashboard/communities/[id]/documents/page.tsx. Amendments, Articles of
// Incorporation, Site Plan / Map, FHA/VA, and Management Agreement are
// optional and not counted toward "complete" here.
const REQUIRED_CATEGORIES = [
  "CC&Rs / Declaration",
  "Bylaws",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
  "Meeting Minutes",
  "Rules & Regulations",
];

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
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardDocumentsPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(REQUIRED_CATEGORIES)
  );

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    let orgId =
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
      return;
    }
    setOrgId(orgId);

    const [commRes, docsRes] = await Promise.all([
      supabase
        .from("communities")
        .select("id, legal_name")
        .eq("organization_id", orgId)
        .order("legal_name"),
      supabase
        .from("community_documents")
        .select("community_id, document_category, ocr_status")
        .eq("organization_id", orgId),
    ]);

    setCommunities((commRes.data ?? []) as Community[]);
    setDocs((docsRes.data ?? []) as DocRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // Per-community, per-category: has at least one doc uploaded?
  const coverageMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const d of docs) {
      if (!d.community_id || !d.document_category) continue;
      if (!map.has(d.community_id)) map.set(d.community_id, new Set());
      map.get(d.community_id)!.add(d.document_category);
    }
    return map;
  }, [docs]);

  const summaryStats = useMemo(() => {
    let totalSlots = 0;
    let filledSlots = 0;
    for (const community of communities) {
      const covered = coverageMap.get(community.id) ?? new Set();
      for (const cat of REQUIRED_CATEGORIES) {
        totalSlots++;
        if (covered.has(cat)) filledSlots++;
      }
    }
    return { totalSlots, filledSlots };
  }, [communities, coverageMap]);

  const categoryStats = useMemo(() => {
    return REQUIRED_CATEGORIES.map((cat) => {
      const complete = communities.filter((c) =>
        (coverageMap.get(c.id) ?? new Set()).has(cat)
      ).length;
      const missing = communities.length - complete;
      return { cat, complete, missing };
    });
  }, [communities, coverageMap]);

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 -mx-6 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Documents</h1>
            {!loading && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {communities.length} {communities.length === 1 ? "community" : "communities"}
              </span>
            )}
          </div>
          {communities.length > 0 && (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              disabled={!orgId}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Bulk upload
            </button>
          )}
        </div>
      </div>

      {orgId && (
        <BulkDocumentUpload
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          communities={communities.map((c) => ({
            id: c.id,
            legal_name: c.legal_name,
            organization_id: orgId,
          }))}
          organizationId={orgId}
          onDone={() => {
            void load();
          }}
        />
      )}

      <div className="mt-6 space-y-5">
        {/* Summary bar */}
        {!loading && communities.length > 0 && (
          <div className="flex items-center gap-6 rounded-xl border border-border bg-card px-5 py-4">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {summaryStats.filledSlots}/{summaryStats.totalSlots}
              </p>
              <p className="text-xs text-muted-foreground">
                Document slots filled (all communities)
              </p>
            </div>
            <div className="border-l border-border pl-6">
              <p className="text-sm font-medium text-foreground">
                {communities.length}{" "}
                {communities.length === 1 ? "Community" : "Communities"}
              </p>
              <p className="text-xs text-muted-foreground">Portfolio overview</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading documents…</p>
        ) : communities.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground">No communities yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add communities first, then upload their governing documents.
            </p>
            <Link
              href="/dashboard/communities"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-white hover:bg-havn-navy/90 transition-colors"
            >
              Go to Communities
            </Link>
          </div>
        ) : (
          /* Category accordion */
          <div className="space-y-3">
            {categoryStats.map(({ cat, complete, missing }) => {
              const isExpanded = expandedCategories.has(cat);
              const isComplete = missing === 0 && communities.length > 0;
              const iconColor = CATEGORY_COLORS[cat] ?? "text-muted-foreground";

              return (
                <div key={cat} className="rounded-xl border border-border bg-card overflow-hidden">
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
                    </div>
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-havn-success/10 px-2.5 py-0.5 text-xs font-semibold text-havn-success">
                          <Check className="h-3 w-3" />
                          All complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {missing} missing
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-1">
                        {complete} uploaded
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {communities.map((community) => {
                        const covered = (coverageMap.get(community.id) ?? new Set()).has(cat);
                        return (
                          <Link
                            key={community.id}
                            href={`/dashboard/communities/${community.id}/documents`}
                            className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-sm font-medium text-foreground">
                                {community.legal_name}
                              </span>
                            </div>
                            {covered ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-havn-success/10 px-2 py-0.5 text-xs font-semibold text-havn-success">
                                <Check className="h-3 w-3" />
                                Uploaded
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                                <AlertTriangle className="h-3 w-3" />
                                Missing
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
