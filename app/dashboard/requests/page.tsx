"use client";

import { parseISO } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Inbox,
  Search,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { formatCurrency, formatMasterTypeKey, formatOrderDate } from "../_lib/format";
import { getStatusCfg } from "../_lib/status-badge";
import { fulfillOrder, rejectOrder } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  created_at: string | null;
  requester_name: string | null;
  requester_email: string | null;
  property_address: string | null;
  master_type_key: string | null;
  total_fee: number | null;
  order_status: string | null;
  closing_date: string | null;
  third_party_review_status: string | null;
};

type FilterTab = "all" | "open" | "overdue" | "fulfilled" | "cancelled" | "refunded";
type SortKey =
  | "created_at"
  | "requester_name"
  | "master_type_key"
  | "closing_date"
  | "days_remaining"
  | "total_fee"
  | "order_status";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysRemaining(closingDate: string | null): number | null {
  if (!closingDate) return null;
  try {
    const due = parseISO(closingDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function filterFromSearchParam(param: string | null): FilterTab {
  if (
    param === "open" ||
    param === "overdue" ||
    param === "fulfilled" ||
    param === "cancelled" ||
    param === "refunded" ||
    param === "all"
  ) {
    return param;
  }
  return "open";
}

// ─── Third-party form status badge ────────────────────────────────────────────

function ThirdPartyBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cfg: Record<string, { label: string; cls: string }> = {
    pending: {
      label: "3P awaiting review",
      cls: "border-havn-amber/40 bg-havn-amber/10 text-havn-amber",
    },
    approved: {
      label: "Using requester form",
      cls: "border-havn-success/40 bg-havn-success/10 text-havn-success",
    },
    denied: {
      label: "Default Havn form",
      cls: "border-border bg-muted/50 text-muted-foreground",
    },
    auto_defaulted: {
      label: "Default Havn form",
      cls: "border-border bg-muted/50 text-muted-foreground",
    },
  };
  const entry = cfg[status];
  if (!entry) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        entry.cls
      )}
    >
      {entry.label}
    </span>
  );
}

// ─── Row actions dropdown (uses Popover as menu) ──────────────────────────────

function RowActionsMenu({
  detailHref,
  canApprove,
  canReject,
  onApprove,
  onReject,
}: {
  detailHref: string;
  canApprove: boolean;
  canReject: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
        <span className="sr-only">Actions</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <Link
          href={detailHref}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Link>
        {canApprove && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-havn-success hover:bg-muted"
            onClick={onApprove}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Approve
          </button>
        )}
        {canReject && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-havn-amber hover:bg-muted"
            onClick={onReject}
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DashboardRequestsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("open");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<
    { type: "single"; id: string } | { type: "bulk"; count: number } | null
  >(null);

  useEffect(() => {
    setFilter(filterFromSearchParam(searchParams.get("filter")));
  }, [searchParams]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadError("Not signed in.");
      setLoading(false);
      return;
    }

    let orgId: string | null =
      typeof user.user_metadata?.organization_id === "string"
        ? user.user_metadata.organization_id
        : null;

    if (!orgId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      if (profileError) {
        setLoadError(profileError.message);
        setLoading(false);
        return;
      }
      orgId = profile?.organization_id ?? null;
    }

    if (!orgId) {
      setLoadError("No organization linked to this account.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("document_orders")
      .select(
        "id, created_at, requester_name, requester_email, property_address, master_type_key, total_fee, order_status, closing_date, third_party_review_status"
      )
      .eq("organization_id", orgId)
      .neq("order_status", "pending_payment")
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders((data ?? []) as OrderRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const isOverdue = (row: OrderRow) => {
    const d = getDaysRemaining(row.closing_date);
    return (
      d !== null &&
      d < 0 &&
      (row.order_status === "paid" || row.order_status === "in_progress")
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter((row) => {
      if (filter === "open") {
        if (row.order_status !== "paid" && row.order_status !== "in_progress") return false;
      } else if (filter === "overdue") {
        if (!isOverdue(row)) return false;
      } else if (filter === "fulfilled") {
        if (row.order_status !== "fulfilled") return false;
      } else if (filter === "cancelled") {
        if (row.order_status !== "cancelled") return false;
      } else if (filter === "refunded") {
        if (row.order_status !== "refunded") return false;
      }
      if (!q) return true;
      const name = (row.requester_name ?? "").toLowerCase();
      const email = (row.requester_email ?? "").toLowerCase();
      const prop = (row.property_address ?? "").toLowerCase();
      const type = (row.master_type_key ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || prop.includes(q) || type.includes(q);
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "days_remaining") {
        const da = getDaysRemaining(a.closing_date) ?? 9999;
        const db = getDaysRemaining(b.closing_date) ?? 9999;
        cmp = da - db;
      } else if (sortKey === "closing_date" || sortKey === "created_at") {
        cmp =
          new Date(a[sortKey] ?? 0).getTime() - new Date(b[sortKey] ?? 0).getTime();
      } else if (sortKey === "total_fee") {
        cmp = (a.total_fee ?? 0) - (b.total_fee ?? 0);
      } else {
        cmp = ((a[sortKey as keyof OrderRow] as string) ?? "").localeCompare(
          (b[sortKey as keyof OrderRow] as string) ?? ""
        );
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [orders, filter, search, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(
    () => ({
      all: orders.length,
      open: orders.filter(
        (r) => r.order_status === "paid" || r.order_status === "in_progress"
      ).length,
      overdue: orders.filter((r) => isOverdue(r)).length,
      fulfilled: orders.filter((r) => r.order_status === "fulfilled").length,
      cancelled: orders.filter((r) => r.order_status === "cancelled").length,
      refunded: orders.filter((r) => r.order_status === "refunded").length,
    }),
    [orders] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const openRejectDialog = (
    target: { type: "single"; id: string } | { type: "bulk"; count: number }
  ) => {
    setRejectTarget(target);
    setRejectReason("");
    setRejectOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) return;
    if (rejectTarget?.type === "single") {
      const result = await rejectOrder(rejectTarget.id, rejectReason);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Order rejected.");
    } else if (rejectTarget?.type === "bulk") {
      await Promise.all([...selectedIds].map((id) => rejectOrder(id, rejectReason)));
      toast.success(`${rejectTarget.count} order(s) rejected.`);
      setSelectedIds(new Set());
    }
    setRejectOpen(false);
    setRejectReason("");
    setRejectTarget(null);
    await loadOrders();
    router.refresh();
  };

  const handleApprove = async (orderId: string) => {
    const result = await fulfillOrder(orderId);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Order approved.");
    await loadOrders();
    router.refresh();
  };

  const handleBulkApprove = async () => {
    await Promise.all([...selectedIds].map((id) => fulfillOrder(id)));
    toast.success(`${selectedIds.size} order(s) approved.`);
    setSelectedIds(new Set());
    await loadOrders();
    router.refresh();
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "overdue", label: "Overdue" },
    { key: "fulfilled", label: "Fulfilled" },
    { key: "cancelled", label: "Cancelled" },
    { key: "refunded", label: "Refunded" },
  ];

  const COLUMNS: { key: SortKey | null; label: string; width?: string }[] = [
    { key: "created_at", label: "Date", width: "w-[100px]" },
    { key: "requester_name", label: "Requester", width: "w-[180px]" },
    { key: null, label: "Property", width: "w-[160px]" },
    { key: "master_type_key", label: "Document", width: "w-[120px]" },
    { key: "days_remaining", label: "Days Rem.", width: "w-[90px]" },
    { key: "total_fee", label: "Amount", width: "w-[90px]" },
    { key: "order_status", label: "Status", width: "w-[90px]" },
  ];

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 -mx-6 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-3">
          <Inbox className="h-5 w-5 text-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Requests</h1>
          {!loading && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {orders.length} total
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        )}

        {/* Filters + search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === t.key
                    ? "bg-havn-navy text-white"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {t.label}
                <span className="ml-1.5 opacity-70">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requests..."
              className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleBulkApprove()}
                className="inline-flex items-center gap-1.5 rounded-md border border-havn-success/30 bg-havn-success/5 px-3 py-1.5 text-xs font-medium text-havn-success transition-colors hover:bg-havn-success/10"
              >
                <ThumbsUp className="h-3 w-3" />
                Approve
              </button>
              <button
                type="button"
                onClick={() =>
                  openRejectDialog({ type: "bulk", count: selectedIds.size })
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-havn-amber/30 bg-havn-amber/5 px-3 py-1.5 text-xs font-medium text-havn-amber transition-colors hover:bg-havn-amber/10"
              >
                <XCircle className="h-3 w-3" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ml-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading requests…</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-border bg-havn-surface/30">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.size === filtered.length && filtered.length > 0
                        }
                        onChange={toggleSelectAll}
                        className="rounded border-border"
                      />
                    </th>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.label}
                        onClick={() => col.key && handleSort(col.key)}
                        className={cn(
                          "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                          col.width,
                          col.key &&
                            "cursor-pointer select-none transition-colors hover:text-foreground"
                        )}
                      >
                        <span className="inline-flex items-center">
                          {col.label}
                          {col.key && <SortIcon col={col.key} />}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 && !loadError ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-16 text-center">
                        <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No requests found</p>
                      </td>
                    </tr>
                  ) : null}
                  {filtered.map((order) => {
                    const detailHref = `/dashboard/requests/${order.id}`;
                    const shortId = order.id.slice(0, 8);
                    const days = getDaysRemaining(order.closing_date);
                    const cfg = getStatusCfg(order.order_status);
                    const StatusIcon = cfg.Icon;
                    const isSelected = selectedIds.has(order.id);
                    const canApprove =
                      order.order_status === "paid" || order.order_status === "in_progress";
                    const canReject =
                      order.order_status !== "fulfilled" &&
                      order.order_status !== "cancelled" &&
                      order.order_status !== "refunded";

                    return (
                      <tr
                        key={order.id}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-havn-surface/20",
                          isSelected && "bg-primary/5"
                        )}
                        onClick={() => router.push(detailHref)}
                      >
                        <td
                          className="px-3 py-3.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(order.id)}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-muted-foreground">
                          {formatOrderDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="block text-sm font-medium text-foreground">
                            {order.requester_name || "—"}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {order.requester_email || ""}
                          </span>
                        </td>
                        <td className="max-w-[180px] px-4 py-3.5">
                          <span className="block truncate text-sm text-muted-foreground">
                            {order.property_address || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-foreground">
                          {formatMasterTypeKey(order.master_type_key)}
                        </td>
                        <td className="px-4 py-3.5">
                          {days !== null ? (
                            <span
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                days < 0
                                  ? "text-destructive"
                                  : days <= 3
                                  ? "text-havn-amber"
                                  : "text-havn-success"
                              )}
                            >
                              {days < 0
                                ? `${Math.abs(days)}d overdue`
                                : `${days}d`}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium tabular-nums text-foreground">
                          {formatCurrency(order.total_fee)}
                        </td>
                        <td
                          className="px-4 py-3.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                cfg.className
                              )}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                            <ThirdPartyBadge status={order.third_party_review_status} />
                          </div>
                        </td>
                        <td
                          className="px-4 py-3.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <RowActionsMenu
                            detailHref={detailHref}
                            canApprove={canApprove}
                            canReject={canReject}
                            onApprove={() => void handleApprove(order.id)}
                            onReject={() =>
                              openRejectDialog({ type: "single", id: order.id })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
            <DialogDescription>
              {rejectTarget?.type === "bulk"
                ? `Provide a reason for rejecting ${rejectTarget.count} order(s). This will be sent to the requester(s).`
                : "Provide a reason for rejecting this order. This will be sent to the requester."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Describe the reason for rejection (e.g., missing information, incorrect details)..."
              className="w-full min-h-[120px] resize-none rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              maxLength={500}
            />
            <p className="text-right text-xs text-muted-foreground">
              {rejectReason.length}/500
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleRejectSubmit()}
              disabled={!rejectReason.trim()}
              className="rounded-lg bg-havn-amber px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-havn-amber/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send Rejection
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DashboardRequestsPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading requests…</p>}
    >
      <DashboardRequestsPageInner />
    </Suspense>
  );
}
