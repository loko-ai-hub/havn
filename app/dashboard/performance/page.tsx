"use client";

import { addMonths, format, parseISO, subMonths } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  MoreHorizontal,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

import {
  formatCurrency,
  formatDeliverySpeed,
  formatMasterTypeKey,
} from "../_lib/format";
import { OrderStatusBadge } from "../_lib/status-badge";

type Period = "12m" | "24m" | "all";

type OrderRow = {
  id: string;
  created_at: string | null;
  requester_name: string | null;
  requester_email: string | null;
  property_address: string | null;
  master_type_key: string | null;
  delivery_speed: string | null;
  total_fee: number | null;
  order_status: string | null;
  closing_date: string | null;
};

type CommunityOption = { id: string; legal_name: string };
type ProfileOption = { id: string; display: string };

async function resolveOrgId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
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
    orgId = profile?.organization_id ?? null;
  }
  return orgId;
}

function isInPeriod(createdAt: string | null, period: Period): boolean {
  if (period === "all") return true;
  if (!createdAt) return false;
  const date = parseISO(createdAt);
  const edge = subMonths(new Date(), period === "12m" ? 12 : 24);
  return date >= edge;
}

function isOverdue(order: OrderRow): boolean {
  if (!order.closing_date) return false;
  if (order.order_status !== "paid" && order.order_status !== "in_progress") return false;
  return new Date(order.closing_date) < new Date();
}

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function KpiCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent,
  iconBg,
  loading,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconBg: string;
  loading: boolean;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {loading ? (
        <>
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
          <Skeleton className="mt-1.5 h-2.5 w-32" />
        </>
      ) : (
        <>
          <div
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
              iconBg
            )}
          >
            <Icon className={cn("h-4 w-4", accent)} />
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtext}</p>
        </>
      )}
    </div>
  );
}

export default function DashboardPerformancePage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("12m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [communities, setCommunities] = useState<CommunityOption[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState("");
  // docs for auto-completion %
  const [docsComplete, setDocsComplete] = useState(0);
  const [docsTotal, setDocsTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const orgId = await resolveOrgId(supabase);
    if (!orgId) {
      setError("No organization linked to this account.");
      setAllOrders([]);
      setLoading(false);
      return;
    }

    const [ordersRes, commRes] = await Promise.all([
      supabase
        .from("document_orders")
        .select(
          "id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status, closing_date"
        )
        .eq("organization_id", orgId)
        .neq("order_status", "pending_payment")
        .order("created_at", { ascending: false }),
      supabase
        .from("companies")
        .select("id, legal_name")
        .eq("organization_id", orgId)
        .order("legal_name"),
    ]);

    if (ordersRes.error) {
      setError(ordersRes.error.message);
      setAllOrders([]);
      setLoading(false);
      return;
    }

    const communityRows = (commRes.data ?? []) as CommunityOption[];
    setCommunities(communityRows);
    setAllOrders((ordersRes.data ?? []) as OrderRow[]);

    // Load doc completion stats
    const communityIds = communityRows.map((c) => c.id);
    if (communityIds.length > 0) {
      const { data: docs } = await supabase
        .from("community_documents")
        .select("id, ocr_status")
        .in("community_id", communityIds);
      const docList = docs ?? [];
      setDocsTotal(docList.length);
      setDocsComplete(docList.filter((d) => (d as { ocr_status: string | null }).ocr_status === "complete").length);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orders = useMemo(() => {
    return allOrders.filter((o) => isInPeriod(o.created_at, period));
  }, [allOrders, period]);

  // KPIs
  const total = orders.length;
  const fulfilled = orders.filter((o) => o.order_status === "fulfilled").length;
  const cancelled = orders.filter((o) => o.order_status === "cancelled" || o.order_status === "refunded").length;
  const overdueCount = orders.filter(isOverdue).length;
  const onTimeRate = (fulfilled + cancelled) > 0 ? Math.round((fulfilled / (fulfilled + cancelled)) * 100) : (total > 0 ? 0 : 0);
  const autoCompletePct = docsTotal > 0 ? Math.round((docsComplete / docsTotal) * 100) : 0;

  const onTimeColor = onTimeRate >= 90 ? "text-havn-success" : onTimeRate >= 70 ? "text-havn-amber" : "text-destructive";
  const onTimeIconBg = onTimeRate >= 90 ? "bg-havn-success/10" : onTimeRate >= 70 ? "bg-havn-amber/10" : "bg-destructive/10";
  const autoColor = autoCompletePct >= 70 ? "text-havn-success" : autoCompletePct >= 40 ? "text-havn-amber" : "text-destructive";
  const autoIconBg = autoCompletePct >= 70 ? "bg-havn-success/10" : autoCompletePct >= 40 ? "bg-havn-amber/10" : "bg-destructive/10";

  const periodSubtext = period === "12m" ? "Last 12 months" : period === "24m" ? "Last 24 months" : "All time";

  const kpis = [
    { label: "On-time rate", value: loading ? "—" : `${onTimeRate}%`, subtext: periodSubtext, icon: CheckCircle2, accent: onTimeColor, iconBg: onTimeIconBg },
    { label: "Total orders", value: loading ? "—" : String(total), subtext: periodSubtext, icon: TrendingUp, accent: "text-primary", iconBg: "bg-primary/10" },
    { label: "Completed", value: loading ? "—" : String(fulfilled), subtext: periodSubtext, icon: CheckCircle2, accent: "text-havn-success", iconBg: "bg-havn-success/10" },
    { label: "Overdue", value: loading ? "—" : String(overdueCount), subtext: "Past closing date", icon: AlertTriangle, accent: overdueCount > 0 ? "text-destructive" : "text-muted-foreground", iconBg: overdueCount > 0 ? "bg-destructive/10" : "bg-muted/40" },
    { label: "Auto-completed", value: loading ? "—" : `${autoCompletePct}%`, subtext: "Of uploaded docs", icon: Zap, accent: autoColor, iconBg: autoIconBg },
  ];

  const recent = orders.slice(0, 10);

  // Revenue by month chart
  const revenueByMonth = useMemo(() => {
    const months = period === "all" ? 6 : period === "24m" ? 12 : 6;
    const end = new Date();
    const start = subMonths(new Date(end.getFullYear(), end.getMonth(), 1), months - 1);
    const buckets = Array.from({ length: months }).map((_, idx) => {
      const d = addMonths(start, idx);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: format(d, "MMM"), amount: 0 };
    });
    for (const o of orders) {
      if (!o.created_at) continue;
      const d = parseISO(o.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const hit = buckets.find((b) => b.key === key);
      if (!hit) continue;
      if (o.order_status === "paid" || o.order_status === "fulfilled") {
        hit.amount += Number(o.total_fee) || 0;
      }
    }
    return buckets;
  }, [orders, period]);

  const maxRevenue = Math.max(1, ...revenueByMonth.map((m) => m.amount));

  // Orders by status breakdown
  const openCount = orders.filter((o) => o.order_status === "paid").length;
  const inProgressCount = orders.filter((o) => o.order_status === "in_progress").length;
  const statusTotal = Math.max(1, openCount + inProgressCount + fulfilled);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold text-foreground">Performance</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* Community filter */}
            <select
              value={selectedCommunity}
              onChange={(e) => setSelectedCommunity(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Communities</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>{c.legal_name}</option>
              ))}
            </select>
            {/* Period selector */}
            <div className="flex rounded-md border border-border p-0.5">
              {(
                [
                  ["12m", "Last 12 Months"],
                  ["24m", "Last 24 Months"],
                  ["all", "All Time"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeriod(id)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    id === period
                      ? "bg-havn-navy text-white"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Revenue by Month</h2>
          {loading ? (
            <Skeleton className="mt-6 h-48 w-full rounded-lg" />
          ) : (
            <div className="mt-6 flex h-48 items-end justify-between gap-2">
              {revenueByMonth.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {m.amount > 0 ? formatCurrency(m.amount) : "—"}
                  </p>
                  <div
                    className="w-full max-w-[44px] rounded-t-md bg-havn-navy"
                    style={{ height: `${Math.max(6, (m.amount / maxRevenue) * 100)}%` }}
                  />
                  <p className="text-[10px] font-medium text-muted-foreground">{m.label}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Orders by Status</h2>
          {loading ? (
            <Skeleton className="mt-6 h-4 w-full rounded-full" />
          ) : (
            <>
              <div className="mt-6 h-4 w-full overflow-hidden rounded-full bg-muted">
                <div className="flex h-full w-full">
                  <div className="bg-havn-amber" style={{ width: `${(openCount / statusTotal) * 100}%` }} />
                  <div className="bg-blue-500" style={{ width: `${(inProgressCount / statusTotal) * 100}%` }} />
                  <div className="bg-havn-success" style={{ width: `${(fulfilled / statusTotal) * 100}%` }} />
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                <p className="text-muted-foreground">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-havn-amber" />
                  Open ({openCount})
                </p>
                <p className="text-muted-foreground">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
                  In Progress ({inProgressCount})
                </p>
                <p className="text-muted-foreground">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-havn-success" />
                  Fulfilled ({fulfilled})
                </p>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Recent Orders */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Orders</h2>
          <Link href="/dashboard/requests" className="text-sm font-medium text-foreground hover:underline">
            View all →
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No orders in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Order #</TableHead>
                  <TableHead className="text-muted-foreground">Requester</TableHead>
                  <TableHead className="text-muted-foreground">Property</TableHead>
                  <TableHead className="text-muted-foreground">Document</TableHead>
                  <TableHead className="text-muted-foreground">Delivery</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((order) => {
                  const detailHref = `/dashboard/requests/${order.id}`;
                  return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer border-border hover:bg-muted/30"
                      onClick={() => router.push(detailHref)}
                    >
                      <TableCell className="text-foreground">{formatOrderDate(order.created_at)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{order.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <span className="block font-medium text-foreground">{order.requester_name || "—"}</span>
                        <span className="block text-xs text-muted-foreground">{order.requester_email || "—"}</span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">
                        {order.property_address || "—"}
                      </TableCell>
                      <TableCell className="text-foreground">{formatMasterTypeKey(order.master_type_key)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDeliverySpeed(order.delivery_speed)}</TableCell>
                      <TableCell className="tabular-nums text-foreground">{formatCurrency(order.total_fee)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <OrderStatusBadge status={order.order_status} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Popover>
                          <PopoverTrigger
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-32 p-1">
                            <Link
                              href={detailHref}
                              className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
                            >
                              Open
                            </Link>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
