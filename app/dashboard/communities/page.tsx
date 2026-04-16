"use client";

import { Archive, Pencil, Plus, Undo2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/us-states";

import { addCommunity, archiveCommunity } from "./actions";

const REQUIRED_CATEGORIES = [
  "CC&Rs / Declaration",
  "Bylaws",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
];

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

export default function DashboardCommunitiesPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");

  const [orgId, setOrgId] = useState<string | null>(null);
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [docsByCommunity, setDocsByCommunity] = useState<Record<string, number>>({});
  const [missingAlerts, setMissingAlerts] = useState<Record<string, number>>({});
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState({
    legal_name: "",
    city: "",
    state: "",
    zip: "",
    community_type: "HOA",
    manager_name: "",
    unit_count: 0,
  });

  const resetForm = () =>
    setForm({
      legal_name: "",
      city: "",
      state: "",
      zip: "",
      community_type: "HOA",
      manager_name: "",
      unit_count: 0,
    });

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
    setLoadError(null);
    const supabase = createClient();

    const oid = await resolveOrgId(supabase);
    setOrgId(oid);

    if (!oid) {
      setLoadError("No organization linked to this account.");
      setCommunities([]);
      setOpenRequestsCount(0);
      setLoading(false);
      return;
    }

    const [paidCountRes, communitiesRes] = await Promise.all([
      supabase
        .from("document_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", oid)
        .eq("order_status", "paid"),
      supabase
        .from("communities")
        .select("*")
        .eq("organization_id", oid)
        .order("legal_name", { ascending: true }),
    ]);

    if (paidCountRes.error) {
      setLoadError(paidCountRes.error.message);
      setCommunities([]);
      setOpenRequestsCount(0);
      setLoading(false);
      return;
    }

    if (communitiesRes.error) {
      setLoadError(communitiesRes.error.message);
      setCommunities([]);
      setOpenRequestsCount(0);
      setLoading(false);
      return;
    }

    const communityRows = (communitiesRes.data ?? []) as CommunityRow[];
    const communityIds = communityRows.map((c) => c.id);
    let docMap: Record<string, number> = {};
    let alertMap: Record<string, number> = {};
    if (communityIds.length > 0) {
      const { data: docsData, error: docsError } = await supabase
        .from("community_documents")
        .select("community_id, document_category")
        .in("community_id", communityIds);
      if (docsError) {
        setLoadError(docsError.message);
      } else {
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
    }

    setOpenRequestsCount(paidCountRes.count ?? 0);
    setDocsByCommunity(docMap);
    setMissingAlerts(alertMap);
    setCommunities(communityRows);
    setLoading(false);
  }, [resolveOrgId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const canSubmit =
    form.legal_name.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.state.trim().length > 0 &&
    form.zip.trim().length > 0 &&
    form.community_type.trim().length > 0;

  const handleSubmit = () => {
    if (!orgId) {
      toast.error("Organization not found.");
      return;
    }
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await addCommunity(orgId, {
        legal_name: form.legal_name.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        community_type: form.community_type,
        manager_name: form.manager_name.trim(),
        unit_count: Number.isFinite(form.unit_count) ? Number(form.unit_count) : 0,
      });

      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }

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
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(nextStatus === "archived" ? "Community archived." : "Community restored.");
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Communities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage communities and monitor open requests.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              resetForm();
              setIsAddOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Community
          </Button>
          <Button type="button" variant="outline" onClick={() => toast.info("Coming soon")}>
            Bulk Upload
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("active")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "active"
                ? "border-havn-navy bg-havn-navy text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setTab("archived")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "archived"
                ? "border-havn-navy bg-havn-navy text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            Archived
          </button>
        </div>

        <Input
          type="search"
          placeholder="Search communities…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm bg-background"
        />
      </div>

      {isAddOpen ? (
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
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="space-y-4 p-5"
            >
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
                <div className="sm:col-span-2 space-y-2">
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
                      <option key={s.abbr} value={s.abbr}>
                        {s.abbr}
                      </option>
                    ))}
                  </select>
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, community_type: e.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="HOA">HOA</option>
                  <option value="COA">COA</option>
                  <option value="Condo Association">Condo Association</option>
                  <option value="Planned Development">Planned Development</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manager_name">Manager Name</Label>
                <Input
                  id="manager_name"
                  value={form.manager_name}
                  onChange={(e) => setForm((f) => ({ ...f, manager_name: e.target.value }))}
                  placeholder="e.g. Jane Smith"
                />
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

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  disabled={!canSubmit || isPending}
                >
                  {isPending ? "Saving..." : "Create Community"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loadError ? (
          <div className="px-5 py-6">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No communities match this filter.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-0 bg-havn-surface/30 hover:bg-havn-surface/30">
                <TableHead className="text-muted-foreground">Community</TableHead>
                <TableHead className="text-muted-foreground">Units</TableHead>
                <TableHead className="text-muted-foreground">Open Requests</TableHead>
                <TableHead className="text-muted-foreground">Manager</TableHead>
                <TableHead className="text-muted-foreground">Docs Uploaded</TableHead>
                <TableHead className="text-muted-foreground">Document Alerts</TableHead>
                <TableHead className="w-[120px] text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const status = (c.status ?? "active").toString().toLowerCase() as "active" | "archived";
                const isActive = status === "active";

                return (
                  <TableRow key={c.id} className="cursor-default border-border hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{c.legal_name}</p>
                        <p className="text-xs text-muted-foreground">{c.city ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{c.state ?? "—"}</p>
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {c.unit_count && c.unit_count > 0 ? (
                        <span className="text-foreground">{c.unit_count}</span>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => toast.info("Coming soon")}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload Addresses
                        </Button>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex items-center rounded-full border border-havn-amber/40 bg-havn-amber/20 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                        {openRequestsCount}
                      </span>
                    </TableCell>

                    <TableCell className="text-foreground">
                      {c.manager_name?.trim() ? c.manager_name : "Unassigned"}
                    </TableCell>

                    <TableCell className="text-foreground tabular-nums">
                      {docsByCommunity[c.id] ?? 0}
                    </TableCell>

                    <TableCell>
                      {(missingAlerts[c.id] ?? 0) > 0 ? (
                        <span className="inline-flex rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                          {missingAlerts[c.id]} missing
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-havn-success/40 bg-havn-success/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                          Complete
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 px-0"
                          onClick={() => toast.info("Coming soon")}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn("h-9 w-9 px-0", isActive ? "" : "")}
                          onClick={() => void handleArchiveToggle(c)}
                          aria-label={isActive ? "Archive" : "Restore"}
                        >
                          {isActive ? <Archive className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
