"use client";

import {
  AlertTriangle,
  Archive,
  Building2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/us-states";

import {
  addCommunity,
  archiveCommunity,
  extractCommunityFromGoverningDoc,
  lookupAddress,
} from "./actions";
import { listOrganizationUsers, type OrgUserOption } from "./[id]/actions";
import type { CcAndRExtractionResult } from "@/lib/cc-and-r-extractor";
import { loadEnabledStates } from "@/lib/enabled-states-action";
import BulkUploadModal from "./bulk-upload-modal";
import CcAndRPreview from "./cc-and-r-preview";
import ConciergeModal from "./concierge-modal";
import { Loader2, Sparkles } from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────

// Required categories for a community to count as document-complete. Must
// stay in sync with REQUIRED_CATEGORIES in /dashboard/communities/[id]/documents
// — Amendments, Articles of Incorporation, Site Plan / Map, FHA/VA, and
// Management Agreement are optional and not counted here.
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "active" | "archived";

type CommunityRow = {
  id: string;
  organization_id: string;
  legal_name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  community_type: string | null;
  manager_name: string | null;
  unit_count: number | null;
  status: "active" | "archived" | string | null;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardCommunitiesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");

  const [orgId, setOrgId] = useState<string | null>(null);
  const [docsByCommunity, setDocsByCommunity] = useState<Record<string, number>>({});
  const [missingAlerts, setMissingAlerts] = useState<Record<string, number>>({});
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isConciergeOpen, setIsConciergeOpen] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressLookupLoading, setAddressLookupLoading] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState<string | null>(null);
  const [ccrFileName, setCcrFileName] = useState<string | null>(null);
  const [ccrLoading, setCcrLoading] = useState(false);
  const [ccrError, setCcrError] = useState<string | null>(null);
  const [ccrExtraction, setCcrExtraction] = useState<CcAndRExtractionResult | null>(null);
  const [enabledStates, setEnabledStates] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState({
    legal_name: "",
    city: "",
    state: "",
    zip: "",
    community_type: "HOA",
    manager_user_id: "" as string,
    manager_name: "",
    unit_count: 0,
  });

  const [orgUsers, setOrgUsers] = useState<OrgUserOption[]>([]);

  const resetForm = () => {
    setForm({
      legal_name: "",
      city: "",
      state: "",
      zip: "",
      community_type: "HOA",
      manager_user_id: "",
      manager_name: "",
      unit_count: 0,
    });
    setAddressQuery("");
    setAddressLookupError(null);
    setAddressLookupLoading(false);
    setCcrFileName(null);
    setCcrLoading(false);
    setCcrError(null);
    setCcrExtraction(null);
  };

  const handleCcrUpload = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setCcrError(`${file.name} is over 20MB. Try a smaller file.`);
      return;
    }
    setCcrError(null);
    setCcrLoading(true);
    setCcrFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const result = await extractCommunityFromGoverningDoc({
        filename: file.name,
        mimeType: file.type || "application/pdf",
        base64,
      });
      if (!result.ok) {
        setCcrError(result.error);
        setCcrFileName(null);
        return;
      }
      const e = result.extraction;
      setCcrExtraction(e);
      // Populate form fields. Take any non-null extraction value (regardless
      // of confidence) — the operator will see + edit before submit. Confidence
      // badges in the UI flag low-confidence pulls so they get verified.
      setForm((f) => ({
        ...f,
        legal_name: e.community_name?.value ?? f.legal_name,
        city: e.city?.value ?? f.city,
        state: e.state?.value ?? f.state,
        zip: e.zip?.value ?? f.zip,
        community_type: e.community_type?.value ?? f.community_type,
      }));
      toast.success("CC&R parsed. Review the highlighted fields below.");
    } catch (err) {
      setCcrError(
        err instanceof Error ? err.message : "Could not read this document."
      );
      setCcrFileName(null);
    } finally {
      setCcrLoading(false);
    }
  };

  const handleAddressLookup = async () => {
    const q = addressQuery.trim();
    if (!q) return;
    setAddressLookupError(null);
    setAddressLookupLoading(true);
    try {
      const result = await lookupAddress(q);
      if (!result.ok) {
        setAddressLookupError(result.error);
        return;
      }
      const a = result.address;
      setForm((f) => ({
        ...f,
        city: a.city ?? f.city,
        state: a.state ?? f.state,
        zip: a.zip ?? f.zip,
        // Suggest a legal name if the field is still empty — operator can edit.
        legal_name:
          f.legal_name.trim().length > 0
            ? f.legal_name
            : a.street
              ? `${a.street} Community`
              : f.legal_name,
      }));
      toast.success("Address autofilled. Review and edit if needed.");
    } catch (err) {
      setAddressLookupError(
        err instanceof Error ? err.message : "Lookup failed."
      );
    } finally {
      setAddressLookupLoading(false);
    }
  };

  const resolveOrgId = useCallback(async (supabase: ReturnType<typeof createClient>) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const metaOrg =
      typeof user.user_metadata?.organization_id === "string"
        ? user.user_metadata.organization_id
        : null;
    if (metaOrg) return metaOrg;

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    return (profile?.organization_id as string | undefined) ?? null;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const oid = await resolveOrgId(supabase);
    setOrgId(oid);

    if (!oid) {
      setCommunities([]);
      setLoading(false);
      return;
    }

    const { data: communityData, error: commErr } = await supabase
      .from("communities")
      .select("*")
      .eq("organization_id", oid)
      .order("legal_name", { ascending: true });

    if (commErr) {
      setCommunities([]);
      setLoading(false);
      return;
    }

    const communityRows = (communityData ?? []) as CommunityRow[];
    const communityIds = communityRows.map((c) => c.id);

    let docMap: Record<string, number> = {};
    let alertMap: Record<string, number> = {};

    if (communityIds.length > 0) {
      const { data: docsData } = await supabase
        .from("community_documents")
        .select("community_id, document_category")
        .in("community_id", communityIds);

      type DocRow = { community_id: string | null; document_category: string | null };
      const categoryMap = new Map<string, Set<string>>();
      for (const row of (docsData ?? []) as DocRow[]) {
        if (row.community_id) {
          if (!categoryMap.has(row.community_id)) categoryMap.set(row.community_id, new Set());
          if (row.document_category) categoryMap.get(row.community_id)!.add(row.document_category);
        }
      }
      docMap = Object.fromEntries(
        communityIds.map((cid) => [cid, categoryMap.get(cid)?.size ?? 0])
      );
      alertMap = Object.fromEntries(
        communityIds.map((cid) => {
          const present = categoryMap.get(cid) ?? new Set<string>();
          return [cid, REQUIRED_CATEGORIES.filter((c) => !present.has(c)).length];
        })
      );
    }

    setDocsByCommunity(docMap);
    setMissingAlerts(alertMap);
    setCommunities(communityRows);
    setLoading(false);
  }, [resolveOrgId]);

  useEffect(() => {
    void loadData();
    void loadEnabledStates().then((s) => setEnabledStates(new Set(s)));
  }, [loadData]);

  // ─── Derived ────────────────────────────────────────────────────────────────

  const activeCount = useMemo(
    () => communities.filter((c) => (c.status ?? "active").toString() === "active").length,
    [communities]
  );
  const archivedCount = useMemo(
    () => communities.filter((c) => (c.status ?? "active").toString() === "archived").length,
    [communities]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return communities.filter((c) => {
      const status = (c.status ?? "active").toString().toLowerCase();
      if (tab === "active" && status !== "active") return false;
      if (tab === "archived" && status !== "archived") return false;
      if (!q) return true;
      return (c.legal_name ?? "").toLowerCase().includes(q);
    });
  }, [communities, search, tab]);

  // Banner priority: documents first (the actually-required step), then
  // addresses (optional — only nudge once docs are handled). Both look at
  // active communities only so archived rows don't trigger nags.
  const needsDocsCount = useMemo(
    () =>
      filtered.filter((c) => {
        const status = (c.status ?? "active").toString();
        if (status !== "active") return false;
        const missing = missingAlerts[c.id] ?? REQUIRED_CATEGORIES.length;
        return missing > 0;
      }).length,
    [filtered, missingAlerts]
  );

  const needsAddressCount = useMemo(
    () =>
      filtered.filter((c) => {
        const status = (c.status ?? "active").toString();
        if (status !== "active") return false;
        return !c.unit_count || c.unit_count === 0;
      }).length,
    [filtered]
  );

  // ─── Actions ────────────────────────────────────────────────────────────────

  const canSubmit =
    form.legal_name.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.state.trim().length > 0 &&
    form.zip.trim().length > 0 &&
    form.community_type.trim().length > 0;

  // Load org users once so the manager picker has options. Cheap query —
  // happens on first mount and stays cached for the modal's lifetime.
  useEffect(() => {
    if (orgUsers.length > 0) return;
    void (async () => {
      try {
        const users = await listOrganizationUsers();
        setOrgUsers(users);
      } catch {
        // Non-fatal — modal still works with manual entry fallback.
      }
    })();
  }, [orgUsers.length]);

  const handleSubmit = () => {
    if (!orgId) { toast.error("Organization not found."); return; }
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await addCommunity(orgId, {
        legal_name: form.legal_name.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        community_type: form.community_type,
        manager_user_id: form.manager_user_id || null,
        manager_name: form.manager_name.trim(),
        unit_count: Number.isFinite(form.unit_count) ? Number(form.unit_count) : 0,
      });
      if (result && "error" in result && result.error) { toast.error(result.error); return; }
      toast.success("Community added.");
      setIsAddOpen(false);
      resetForm();
      await loadData();
    });
  };

  const handleArchiveToggle = async (community: CommunityRow) => {
    const current = (community.status ?? "active").toString().toLowerCase();
    const nextStatus = current === "active" ? "archived" : "active";
    const result = await archiveCommunity(community.id, nextStatus as "active" | "archived");
    if (result && "error" in result && result.error) { toast.error(result.error); return; }
    toast.success(nextStatus === "archived" ? "Community archived." : "Community restored.");
    await loadData();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 -mx-6 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Communities</h1>
            {!loading && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {activeCount} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBulkOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Upload className="h-4 w-4" />
              Bulk Upload
            </button>
            <button
              type="button"
              onClick={() => { resetForm(); setIsAddOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-havn-navy/90"
            >
              <Plus className="h-4 w-4" />
              Add Community
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {/* Filters row */}
        <div className="flex items-center justify-between gap-4">
          {/* Tab group */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "active"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("archived")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "archived"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Archived ({archivedCount})
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search communities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Priority banner: documents first (required for orders), then a
            softer optional nudge for addresses. Only one shows at a time. */}
        {!loading && tab === "active" && needsDocsCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-havn-amber/40 bg-havn-amber/10 px-5 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {needsDocsCount === 1
                  ? "1 community is missing required documents"
                  : `${needsDocsCount} communities are missing required documents`}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Upload governing docs (CC&amp;Rs, bylaws, financials, insurance, reserve study, budget, meeting minutes, rules) so Havn can auto-fill order forms when requests come in.
              </p>
            </div>
          </div>
        )}

        {!loading && tab === "active" && needsDocsCount === 0 && needsAddressCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-havn-cyan/30 bg-havn-cyan/5 px-5 py-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-havn-cyan-deep" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Add property addresses to enhance your portal{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (optional)
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {needsAddressCount === 1
                  ? "1 community"
                  : `${needsAddressCount} communities`}{" "}
                don&apos;t have a property list on file yet. Adding addresses lets Havn auto-route inbound requests to the right manager.
              </p>
            </div>
          </div>
        )}

        {/* "More communities?" hint after first community */}
        {!loading && tab === "active" && activeCount === 1 && !search && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-havn-cyan/30 bg-havn-cyan/10 px-4 py-2.5">
            <p className="text-sm text-foreground">
              <span className="font-medium">Have more communities?</span>{" "}
              <span className="text-muted-foreground">
                Bulk-load them, or have a Havn specialist do it for you.
              </span>
            </p>
            <div className="flex items-center gap-3 text-sm font-medium">
              <button
                type="button"
                onClick={() => setIsBulkOpen(true)}
                className="text-foreground underline-offset-2 hover:underline"
              >
                Bulk import
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => setIsConciergeOpen(true)}
                className="text-havn-cyan-deep underline-offset-2 hover:underline"
              >
                Have us do it
              </button>
            </div>
          </div>
        )}

        {/* Table or rich empty state */}
        <div className={cn(
          "overflow-hidden rounded-xl border border-border bg-card",
          !loading && filtered.length === 0 && activeCount === 0 && tab === "active" && !search && "border-dashed bg-transparent"
        )}>
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            // Rich empty state for fresh orgs (no communities yet, no search active)
            activeCount === 0 && tab === "active" && !search ? (
              <div className="grid gap-4 p-6 md:grid-cols-3 md:p-8">
                {/* Add one community */}
                <button
                  type="button"
                  onClick={() => { resetForm(); setIsAddOpen(true); }}
                  className="group flex h-full flex-col items-start rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-havn-cyan hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-havn-cyan/15 text-havn-cyan-deep">
                    <Plus className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">
                    Add a community
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    You only need one to take your first order. Bulk-load the rest whenever you&rsquo;re ready.
                  </p>
                  <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-havn-cyan-deep underline-offset-2 group-hover:underline">
                    Get started →
                  </span>
                </button>

                {/* Bulk import a portfolio */}
                <button
                  type="button"
                  onClick={() => setIsBulkOpen(true)}
                  className="group flex h-full flex-col items-start rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-havn-cyan hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-havn-cyan/15 text-havn-cyan-deep">
                    <Upload className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">
                    I have a portfolio to load
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Upload a spreadsheet of your communities and we&rsquo;ll bulk-import the whole list at once.
                  </p>
                  <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-havn-cyan-deep underline-offset-2 group-hover:underline">
                    Upload a CSV / Excel →
                  </span>
                </button>

                {/* White glove concierge */}
                <button
                  type="button"
                  onClick={() => setIsConciergeOpen(true)}
                  className="group flex h-full flex-col items-start rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-havn-cyan hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-havn-cyan/15 text-havn-cyan-deep">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">
                    White glove setup
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Tell us a bit about your portfolio and a Havn specialist will reach out, collect what we need, and load everything for you.
                  </p>
                  <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-havn-cyan-deep underline-offset-2 group-hover:underline">
                    Have us do it →
                  </span>
                </button>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                {search ? "No communities match your search." : `No ${tab} communities.`}
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-havn-surface/30">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Community</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Units</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manager</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Docs Uploaded</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Alerts</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((c) => {
                    const status = (c.status ?? "active").toString().toLowerCase();
                    const isActive = status === "active";

                    return (
                      <tr
                        key={c.id}
                        className="cursor-pointer transition-colors hover:bg-muted/20"
                        onClick={() => router.push(`/dashboard/communities/${c.id}`)}
                      >
                        <td className="px-4 py-3.5">
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.legal_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.city ?? "—"}, {c.state ?? "—"} {c.zip ?? ""}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {c.unit_count && c.unit_count > 0 ? (
                            <span className="text-sm text-foreground tabular-nums">{c.unit_count}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/communities/${c.id}`); }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Add Details
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-sm text-foreground">
                          {c.manager_name?.trim() ? c.manager_name : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-sm text-foreground tabular-nums">
                          {docsByCommunity[c.id] ?? 0}
                        </td>

                        <td className="px-4 py-3.5">
                          {(missingAlerts[c.id] ?? 0) > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/communities/${c.id}/documents`); }}
                            >
                              <span className="inline-flex rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20">
                                {missingAlerts[c.id]} missing
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex rounded-full bg-havn-success/10 px-2.5 py-0.5 text-xs font-medium text-havn-success">
                              Complete
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/communities/${c.id}`)}
                              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleArchiveToggle(c)}
                              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title={isActive ? "Archive" : "Restore"}
                            >
                              {isActive ? (
                                <Archive className="h-3.5 w-3.5" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Upload Modal */}
      {isBulkOpen && orgId && (
        <BulkUploadModal
          orgId={orgId}
          onClose={() => setIsBulkOpen(false)}
          onDone={() => {
            setIsBulkOpen(false);
            void loadData();
          }}
        />
      )}

      {/* Concierge Import Modal */}
      <ConciergeModal open={isConciergeOpen} onOpenChange={setIsConciergeOpen} />

      {/* Add Community Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Add Community</h2>
                <p className="mt-1 text-sm text-muted-foreground">Create a new HOA/COA listing.</p>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setIsAddOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
              className="space-y-4 p-5"
            >
              {/* Address autofill — quick path. Manual fields below remain editable. */}
              <div className="rounded-lg border border-havn-cyan/30 bg-havn-cyan/5 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-havn-cyan-deep" />
                  <Label htmlFor="address-autofill" className="text-sm font-semibold text-foreground">
                    Quick add — type the community address
                  </Label>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  We&rsquo;ll fill city, state, and ZIP for you. Review the rest below.
                </p>
                <div className="mt-3 flex gap-2">
                  <Input
                    id="address-autofill"
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddressLookup();
                      }
                    }}
                    placeholder="1234 Maple Ave, Sammamish, WA"
                    className="bg-background"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddressLookup()}
                    disabled={addressLookupLoading || !addressQuery.trim()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-havn-cyan-deep px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addressLookupLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Looking up…
                      </>
                    ) : (
                      "Autofill"
                    )}
                  </button>
                </div>
                {addressLookupError && (
                  <p className="mt-2 text-xs text-destructive">{addressLookupError}</p>
                )}
              </div>

              {/* CC&R upload — drop a governing document, AI fills everything. */}
              <div className="rounded-lg border border-havn-cyan/30 bg-havn-cyan/5 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-havn-cyan-deep" />
                  <Label htmlFor="ccr-upload" className="text-sm font-semibold text-foreground">
                    Or upload your CC&amp;Rs to autofill everything
                  </Label>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drop your governing documents (PDF). We&rsquo;ll extract the legal
                  name, address, type, dues, and board details.
                </p>
                <div className="mt-3">
                  <input
                    id="ccr-upload"
                    type="file"
                    accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleCcrUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Label
                    htmlFor="ccr-upload"
                    className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {ccrLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Reading {ccrFileName ?? "document"}…
                      </>
                    ) : ccrExtraction ? (
                      <>Replace document ({ccrFileName})</>
                    ) : (
                      <>Choose CC&amp;R file</>
                    )}
                  </Label>
                </div>
                {ccrError && (
                  <p className="mt-2 text-xs text-destructive">{ccrError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="legal_name">Legal Name</Label>
                <Input
                  id="legal_name"
                  value={form.legal_name}
                  onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                  placeholder="e.g. Duvall HOA"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Seattle"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <select
                    id="state"
                    value={form.state}
                    onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    required
                  >
                    <option value="">Select…</option>
                    {US_STATES.map((s) => (
                      <option key={s.abbr} value={s.abbr}>{s.abbr}</option>
                    ))}
                  </select>
                  {form.state && !enabledStates.has(form.state) && (
                    <div className="rounded-md border border-havn-amber/40 bg-havn-amber/10 px-3 py-2 text-xs text-foreground">
                      <p className="font-semibold">Havn is not yet live in {form.state}.</p>
                      <p className="mt-0.5 text-muted-foreground">You can add this community, but you won&apos;t be able to accept orders until this state is enabled.</p>
                      <button type="button" onClick={() => {
                        void fetch("/api/feature-request", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ description: `Request to unlock state: ${form.state}`, userName: "Management Company", userEmail: "system" }),
                        });
                        toast.success("Your request has been recorded. We'll notify you when this state is available.");
                      }} className="mt-1.5 text-xs font-medium text-foreground underline underline-offset-2">Request to unlock {form.state}</button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP</Label>
                  <Input
                    id="zip"
                    value={form.zip}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        zip: e.target.value.replace(/[^0-9-]/g, "").slice(0, 10),
                      }))
                    }
                    placeholder="98101"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="community_type">Community Type</Label>
                <select
                  id="community_type"
                  value={form.community_type}
                  onChange={(e) => setForm((f) => ({ ...f, community_type: e.target.value }))}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="HOA">HOA</option>
                  <option value="COA">COA</option>
                  <option value="Condo Association">Condo Association</option>
                  <option value="Planned Development">Planned Development</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manager_user_id">Assigned Manager</Label>
                <select
                  id="manager_user_id"
                  value={form.manager_user_id}
                  onChange={(e) => {
                    const userId = e.target.value;
                    const picked = orgUsers.find((u) => u.id === userId);
                    setForm((f) => ({
                      ...f,
                      manager_user_id: userId,
                      manager_name: picked?.fullName ?? "",
                    }));
                  }}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Pick a team member —</option>
                  {orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} · {u.email}
                    </option>
                  ))}
                </select>
                {orgUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No team members yet. Invite users from Settings to assign one as manager.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground/70">
                  Their profile and your management company&apos;s mailing
                  address will populate the management contact card automatically.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit_count">Unit Count</Label>
                <Input
                  id="unit_count"
                  type="number"
                  min={0}
                  value={form.unit_count}
                  onChange={(e) => setForm((f) => ({ ...f, unit_count: Number(e.target.value) }))}
                />
              </div>

              {/* Bonus details extracted from the CC&R — informational so the
                  operator sees what we found. (Not saved to community_field_cache
                  in this MVP; can be wired in a follow-up once the community is
                  created.) */}
              {ccrExtraction && (
                <CcAndRPreview extraction={ccrExtraction} />
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-havn-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-havn-navy/90 disabled:opacity-40"
                  disabled={!canSubmit || isPending}
                >
                  {isPending ? "Saving…" : "Create Community"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
