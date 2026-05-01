"use client";

import { Database, Sparkles, User, FileText, Search, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  getCommunityMergeTagValues,
  listGodModeCommunities,
  listGodModeOrganizations,
  refreshCommunityMergeTagsAction,
  type GodModeCommunityLite,
  type GodModeOrgLite,
  type MergeTagValueRow,
} from "./templates-actions";

export default function MergeTagDataViewer() {
  const [orgs, setOrgs] = useState<GodModeOrgLite[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [communities, setCommunities] = useState<GodModeCommunityLite[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rows, setRows] = useState<MergeTagValueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyFilled, setOnlyFilled] = useState(false);

  // Load orgs + community list in parallel
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [orgList, communityList] = await Promise.all([
          listGodModeOrganizations(),
          listGodModeCommunities(),
        ]);
        if (cancelled) return;
        setOrgs(orgList);
        setCommunities(communityList);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Load failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When org changes, clear community selection.
  useEffect(() => {
    setSelectedId("");
    setRows([]);
  }, [selectedOrgId]);

  const communitiesForOrg = useMemo(() => {
    if (!selectedOrgId) return [];
    return communities.filter((c) => c.organizationId === selectedOrgId);
  }, [communities, selectedOrgId]);

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === selectedOrgId) ?? null,
    [orgs, selectedOrgId]
  );

  // Load merge-tag values for the selected community
  useEffect(() => {
    if (!selectedId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRowsLoading(true);
    void (async () => {
      try {
        const result = await getCommunityMergeTagValues(selectedId);
        if (cancelled) return;
        if ("error" in result) {
          toast.error(result.error);
          setRows([]);
        } else {
          setRows(result.rows);
        }
      } finally {
        if (!cancelled) setRowsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedCommunity = useMemo(
    () => communities.find((c) => c.id === selectedId) ?? null,
    [communities, selectedId]
  );

  // ── Refresh action ──────────────────────────────────────────────────
  const [confirmCommunityRefresh, setConfirmCommunityRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const doRefreshCommunity = async () => {
    if (!selectedId) return;
    setRefreshing(true);
    const toastId = toast.loading(
      `Re-running merge-tag resolver for ${selectedCommunity?.name ?? "community"}…`
    );
    try {
      const result = await refreshCommunityMergeTagsAction(selectedId);
      // `{ error: string }` failure shape has no communityId.
      if (!("communityId" in result)) {
        toast.error(result.error, { id: toastId });
        return;
      }
      if (result.error) {
        toast.error(result.error, { id: toastId });
      } else {
        toast.success(
          `Refreshed: ${result.cached} cached, ${result.preservedManual} manual preserved, ${result.unmapped} unmapped across ${result.ocrDocsScanned} OCR doc${result.ocrDocsScanned === 1 ? "" : "s"}.`,
          { id: toastId }
        );
      }
      // Reload the table to reflect new values.
      const values = await getCommunityMergeTagValues(selectedId);
      if (!("error" in values)) setRows(values.rows);
    } finally {
      setRefreshing(false);
      setConfirmCommunityRefresh(false);
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyFilled && !r.resolvedValue?.trim()) return false;
      if (!q) return true;
      return (
        r.key.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.mergeTag.toLowerCase().includes(q) ||
        (r.resolvedValue?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, onlyFilled]);

  const filledCount = rows.filter((r) => r.resolvedValue?.trim()).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Merge Tag Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Look up every merge tag&apos;s resolved value for a specific community,
          including its source (OCR, cache, or manual entry).
        </p>
      </div>

      {/* Two-step filter: organization → community */}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <div>
          <Label
            htmlFor="mt-org"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Management Company / Self-Managed Association
          </Label>
          <select
            id="mt-org"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            disabled={loading}
            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="">{loading ? "Loading…" : "Select an organization…"}</option>
            <optgroup label="Management companies">
              {orgs
                .filter((o) => o.accountType === "management_company")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.isActive ? "" : " · (inactive)"}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Self-managed associations">
              {orgs
                .filter((o) => o.accountType === "self_managed")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.isActive ? "" : " · (inactive)"}
                  </option>
                ))}
            </optgroup>
            {orgs.some((o) => o.accountType !== "management_company" && o.accountType !== "self_managed") && (
              <optgroup label="Uncategorized">
                {orgs
                  .filter(
                    (o) =>
                      o.accountType !== "management_company" &&
                      o.accountType !== "self_managed"
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <Label
            htmlFor="mt-community"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Community
          </Label>
          <select
            id="mt-community"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loading || !selectedOrgId}
            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="">
              {!selectedOrgId
                ? "Pick an organization first…"
                : communitiesForOrg.length === 0
                  ? "No active communities in this organization"
                  : "Select a community…"}
            </option>
            {communitiesForOrg.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.state ? ` · ${c.state}` : ""}
              </option>
            ))}
          </select>
          {selectedOrg && communitiesForOrg.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {communitiesForOrg.length} communit{communitiesForOrg.length === 1 ? "y" : "ies"} in{" "}
              {selectedOrg.name}
            </p>
          )}
        </div>
      </div>

      {selectedCommunity && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-foreground">
                {selectedCommunity.name}
              </span>
              {selectedCommunity.state && (
                <span className="rounded-md border border-havn-navy/30 bg-havn-navy/5 px-1.5 py-0.5 text-xs font-bold text-havn-navy">
                  {selectedCommunity.state}
                </span>
              )}
              <span className="text-muted-foreground">
                {filledCount} of {rows.length} tags populated
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={() => setConfirmCommunityRefresh(true)}
              >
                <RefreshCw
                  className={cn("mr-2 h-3.5 w-3.5", refreshing && "animate-spin")}
                />
                Refresh this community
              </Button>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tags, values…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 pl-8"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyFilled}
                  onChange={(e) => setOnlyFilled(e.target.checked)}
                  className="h-4 w-4 accent-havn-navy"
                />
                Filled only
              </label>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Field</th>
                  <th className="px-3 py-2 text-left font-medium">Merge tag</th>
                  <th className="px-3 py-2 text-left font-medium">Value</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No results.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.key} className="border-t border-border/60">
                      <td className="px-3 py-1.5">
                        <p className="font-medium text-foreground">{r.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.type}
                          {r.communityLevel ? "" : " · order-specific"}
                        </p>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                        {r.mergeTag}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.resolvedValue?.trim() ? (
                          <span className="text-foreground">{r.resolvedValue}</span>
                        ) : (
                          <span className="text-muted-foreground italic">empty</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <SourceBadge source={r.resolvedSource} />
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {r.updatedAt
                          ? new Date(r.updatedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmCommunityRefresh && selectedCommunity && (
        <ConfirmRefreshModal
          title={`Refresh merge tags for ${selectedCommunity.name}?`}
          body={
            <>
              This re-runs the AI merge-tag resolver across every OCR&apos;d
              document for this community. Any values you&apos;ve set
              manually will be <span className="font-semibold">preserved</span>
              &nbsp;— only OCR-sourced entries get updated. Expect 15–30
              seconds.
            </>
          }
          confirmLabel="Refresh community"
          onCancel={() => setConfirmCommunityRefresh(false)}
          onConfirm={() => void doRefreshCommunity()}
          confirming={refreshing}
        />
      )}

    </div>
  );
}

function ConfirmRefreshModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  confirming,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !confirming && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={confirming}>
            <RefreshCw
              className={cn("mr-2 h-4 w-4", confirming && "animate-spin")}
            />
            {confirming ? "Running…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: MergeTagValueRow["resolvedSource"] }) {
  if (!source) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const cfg = {
    ocr: {
      label: "OCR",
      icon: FileText,
      className: "border-primary/30 bg-primary/10 text-primary",
    },
    cache: {
      label: "Cached",
      icon: Database,
      className: "border-havn-success/30 bg-havn-success/10 text-havn-success",
    },
    manual: {
      label: "Manual",
      icon: User,
      className: "border-havn-amber/30 bg-havn-amber/10 text-havn-amber",
    },
  } as const;
  const entry = cfg[source];
  const Icon = entry?.icon ?? Sparkles;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        entry?.className
      )}
    >
      <Icon className="h-3 w-3" />
      {entry?.label ?? source}
    </span>
  );
}
