"use client";

import { addMonths, parseISO, subMonths } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "t12" | "t24" | "all";
type ChartView = "sales" | "orders" | "status";

type OrderRow = {
  id: string;
  created_at: string | null;
  master_type_key: string | null;
  total_fee: number | null;
  order_status: string | null;
  closing_date: string | null;
};

type CommunityDoc = {
  document_category: string | null;
  ocr_status: string | null;
};

type CommunityOption = { id: string; legal_name: string };
type MonthPoint = Record<string, number | string> & { label: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DOC_TYPES = [
  { key: "resale_certificate",   label: "Resale Certificate",   color: "hsl(160, 40%, 58%)" },
  { key: "lender_questionnaire", label: "Lender Questionnaire", color: "hsl(44, 60%, 68%)"  },
  { key: "certificate_update",   label: "Certificate Update",   color: "hsl(200, 50%, 60%)" },
  { key: "demand_letter",        label: "Demand Letter",        color: "hsl(0, 55%, 68%)"   },
  { key: "estoppel_letter",      label: "Estoppel Letter",      color: "hsl(280, 40%, 65%)" },
  { key: "governing_documents",  label: "Governing Documents",  color: "hsl(30, 60%, 60%)"  },
] as const;

type DocTypeKey = (typeof DOC_TYPES)[number]["key"];

const STATUS_TYPES = [
  { key: "fulfilled",   label: "Fulfilled",   color: "hsl(160, 40%, 65%)" },
  { key: "in_progress", label: "In Progress", color: "hsl(0, 0%, 65%)"    },
  { key: "paid",        label: "Open",        color: "hsl(44, 60%, 76%)"  },
  { key: "cancelled",   label: "Cancelled",   color: "hsl(0, 55%, 75%)"   },
  { key: "refunded",    label: "Refunded",    color: "hsl(30, 40%, 70%)"  },
] as const;

type StatusKey = (typeof STATUS_TYPES)[number]["key"];

const DOC_CATEGORIES_AUTO = [
  "CC&Rs / Declaration",
  "Bylaws",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
  "Meeting Minutes",
  "Rules & Regulations",
];

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "t12", label: "Trailing 12 months" },
  { key: "t24", label: "Trailing 24 months" },
  { key: "all", label: "All time" },
];

const VIEW_OPTIONS: { key: ChartView; label: string }[] = [
  { key: "sales",  label: "Sales"  },
  { key: "orders", label: "Orders" },
  { key: "status", label: "Status" },
];

// ─── Data helpers ──────────────────────────────────────────────────────────────

async function resolveOrgId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const metaOrg = user.user_metadata?.organization_id;
  if (typeof metaOrg === "string") return metaOrg;
  const { data: profile } = await supabase
    .from("profiles").select("organization_id").eq("id", user.id).single();
  return profile?.organization_id ?? null;
}

function isOverdue(order: OrderRow): boolean {
  if (!order.closing_date) return false;
  if (order.order_status !== "paid" && order.order_status !== "in_progress") return false;
  return new Date(order.closing_date) < new Date();
}

function buildBuckets(orders: OrderRow[], period: Period): MonthPoint[] {
  let start: Date;
  const end = new Date();

  if (period === "all") {
    const dates = orders
      .filter((o) => o.created_at)
      .map((o) => parseISO(o.created_at!));
    if (dates.length === 0) {
      start = subMonths(new Date(end.getFullYear(), end.getMonth(), 1), 11);
    } else {
      const earliest = dates.reduce((a, b) => (a < b ? a : b));
      start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    }
  } else {
    const months = period === "t12" ? 12 : 24;
    start = subMonths(new Date(end.getFullYear(), end.getMonth(), 1), months - 1);
  }

  const buckets: MonthPoint[] = [];
  let cur = new Date(start);
  while (cur <= end) {
    const label = `${MONTH_ABBR[cur.getMonth()]} '${String(cur.getFullYear()).slice(2)}`;
    buckets.push({ label });
    cur = addMonths(cur, 1);
  }
  return buckets;
}

function buildSalesData(orders: OrderRow[], period: Period): MonthPoint[] {
  const buckets = buildBuckets(orders, period);
  for (const b of buckets) for (const dt of DOC_TYPES) b[dt.key] = 0;

  const cutoff =
    period === "all" ? null
    : subMonths(new Date(), period === "t12" ? 12 : 24);

  for (const o of orders) {
    if (!o.created_at) continue;
    const d = parseISO(o.created_at);
    if (cutoff && d < cutoff) continue;
    const lbl = `${MONTH_ABBR[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
    const b = buckets.find((x) => x.label === lbl);
    if (!b || !o.master_type_key) continue;
    if (o.master_type_key in b) (b[o.master_type_key] as number) += Number(o.total_fee) || 0;
  }
  return buckets;
}

function buildOrdersData(orders: OrderRow[], period: Period): MonthPoint[] {
  const buckets = buildBuckets(orders, period);
  for (const b of buckets) for (const dt of DOC_TYPES) b[dt.key] = 0;

  const cutoff =
    period === "all" ? null
    : subMonths(new Date(), period === "t12" ? 12 : 24);

  for (const o of orders) {
    if (!o.created_at) continue;
    const d = parseISO(o.created_at);
    if (cutoff && d < cutoff) continue;
    const lbl = `${MONTH_ABBR[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
    const b = buckets.find((x) => x.label === lbl);
    if (!b || !o.master_type_key) continue;
    if (o.master_type_key in b) (b[o.master_type_key] as number) += 1;
  }
  return buckets;
}

function buildStatusData(orders: OrderRow[], period: Period): MonthPoint[] {
  const buckets = buildBuckets(orders, period);
  for (const b of buckets) for (const st of STATUS_TYPES) b[st.key] = 0;

  const cutoff =
    period === "all" ? null
    : subMonths(new Date(), period === "t12" ? 12 : 24);

  for (const o of orders) {
    if (!o.created_at || !o.order_status) continue;
    const d = parseISO(o.created_at);
    if (cutoff && d < cutoff) continue;
    const lbl = `${MONTH_ABBR[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
    const b = buckets.find((x) => x.label === lbl);
    if (!b) continue;
    if (o.order_status in b) (b[o.order_status] as number) += 1;
  }
  return buckets;
}

function buildAutoData(docs: CommunityDoc[]) {
  return DOC_CATEGORIES_AUTO.map((cat) => {
    const inCat = docs.filter((d) => d.document_category === cat);
    const complete = inCat.filter((d) => d.ocr_status === "complete").length;
    return { docType: cat, rate: inCat.length > 0 ? Math.round((complete / inCat.length) * 100) : 0, total: inCat.length };
  }).filter((d) => d.total > 0);
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function getRateColor(rate: number) {
  if (rate >= 85) return "text-havn-success";
  if (rate >= 75) return "text-havn-amber";
  if (rate >= 40) return "text-foreground";
  return "text-destructive";
}

function getBarBg(rate: number) {
  if (rate >= 85) return "bg-havn-success";
  if (rate >= 75) return "bg-havn-amber";
  if (rate >= 40) return "bg-muted-foreground/50";
  return "bg-destructive/60";
}

// ─── Recharts custom tooltip ───────────────────────────────────────────────────

function SingleSegmentTooltip({
  active, payload, label, isCurrency, categories, hoveredKey,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  isCurrency?: boolean;
  categories: readonly { key: string; label: string; color: string }[];
  hoveredKey: string | null;
}) {
  if (!active || !payload?.length || !hoveredKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = payload.find((p: any) => p.dataKey === hoveredKey);
  if (!item || item.value === 0) return null;
  const cat = categories.find((c) => c.key === hoveredKey);
  const displayValue = isCurrency ? fmtCurrency(item.value as number) : String(item.value);

  return (
    <div style={{
      fontSize: 13, borderRadius: 12,
      border: "1px solid hsl(36, 25%, 85%)",
      backgroundColor: "hsl(30, 12%, 12%)",
      color: "hsl(36, 78%, 88%)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      padding: "10px 14px", minWidth: 120,
    }}>
      <div style={{ fontWeight: 700, color: "hsl(36, 78%, 92%)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: cat?.color ?? item.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{cat?.label ?? hoveredKey}</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>{displayValue}</span>
      </div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, subtext, icon: Icon, accent, iconBg, loading, delay,
}: {
  label: string; value: string; subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; iconBg: string; loading: boolean; delay: number;
}) {
  return (
    <div
      className="group relative rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-sm"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      {loading ? (
        <>
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="mt-3 h-8 w-20 rounded" />
          <Skeleton className="mt-2 h-3 w-24 rounded" />
          <Skeleton className="mt-1.5 h-2.5 w-16 rounded" />
        </>
      ) : (
        <>
          <div className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110", iconBg)}>
            <Icon className={cn("h-4 w-4", accent)} />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs font-medium text-foreground/80">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtext}</p>
        </>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPerformancePage() {
  const [period, setPeriod] = useState<Period>("t12");
  const [chartView, setChartView] = useState<ChartView>("sales");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [communities, setCommunities] = useState<CommunityOption[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState("");
  const [communityDocs, setCommunityDocs] = useState<CommunityDoc[]>([]);
  const [activeDocTypes, setActiveDocTypes] = useState<Set<DocTypeKey>>(
    new Set(DOC_TYPES.map((d) => d.key))
  );
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusKey>>(
    new Set(STATUS_TYPES.map((s) => s.key))
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const orgId = await resolveOrgId(supabase);
    if (!orgId) {
      setError("No organization linked to this account.");
      setLoading(false);
      return;
    }

    const [ordersRes, commRes] = await Promise.all([
      supabase
        .from("document_orders")
        .select("id, created_at, master_type_key, total_fee, order_status, closing_date")
        .eq("organization_id", orgId)
        .neq("order_status", "pending_payment")
        .order("created_at", { ascending: false }),
      supabase
        .from("communities")
        .select("id, legal_name")
        .eq("organization_id", orgId)
        .order("legal_name"),
    ]);

    if (ordersRes.error) {
      setError(ordersRes.error.message);
      setLoading(false);
      return;
    }

    const communityRows = (commRes.data ?? []) as CommunityOption[];
    setCommunities(communityRows);
    setAllOrders((ordersRes.data ?? []) as OrderRow[]);

    const communityIds = communityRows.map((c) => c.id);
    if (communityIds.length > 0) {
      const { data: docs } = await supabase
        .from("community_documents")
        .select("document_category, ocr_status")
        .in("community_id", communityIds);
      setCommunityDocs((docs ?? []) as CommunityDoc[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Derived orders (community filter omitted — document_orders has no community_id)
  const orders = useMemo(() => allOrders, [allOrders]);
  const _ = selectedCommunity; // retained for future use when column is added

  // ─ KPI values ─
  const periodSubtext = period === "t12" ? "Last 12 months" : period === "t24" ? "Last 24 months" : "All time";
  const periodOrders = useMemo(() => {
    if (period === "all") return orders;
    const cutoff = subMonths(new Date(), period === "t12" ? 12 : 24);
    return orders.filter((o) => o.created_at && parseISO(o.created_at) >= cutoff);
  }, [orders, period]);

  const total = periodOrders.length;
  const fulfilled = periodOrders.filter((o) => o.order_status === "fulfilled").length;
  const cancelled = periodOrders.filter((o) => o.order_status === "cancelled" || o.order_status === "refunded").length;
  const overdueCount = periodOrders.filter(isOverdue).length;
  const onTimeRate = (fulfilled + cancelled) > 0 ? Math.round((fulfilled / (fulfilled + cancelled)) * 100) : 0;

  const autoCompletionData = useMemo(() => buildAutoData(communityDocs), [communityDocs]);
  const overallAutoRate = autoCompletionData.length > 0
    ? Math.round(autoCompletionData.reduce((s, d) => s + d.rate, 0) / autoCompletionData.length)
    : 0;

  const rateColor = onTimeRate >= 90 ? "text-havn-success" : onTimeRate >= 70 ? "text-havn-amber" : "text-destructive";
  const autoColor = overallAutoRate >= 85 ? "text-havn-success" : overallAutoRate >= 70 ? "text-havn-amber" : "text-destructive";

  const kpis = [
    { label: "On-time rate", value: `${onTimeRate}%`, subtext: periodSubtext, icon: CheckCircle2, accent: rateColor, iconBg: onTimeRate >= 90 ? "bg-havn-success/10" : onTimeRate >= 70 ? "bg-havn-amber/10" : "bg-destructive/10" },
    { label: "Total orders", value: String(total), subtext: periodSubtext, icon: TrendingUp, accent: "text-primary", iconBg: "bg-primary/10" },
    { label: "Completed", value: String(fulfilled), subtext: periodSubtext, icon: CheckCircle2, accent: "text-havn-success", iconBg: "bg-havn-success/10" },
    { label: "Overdue", value: String(overdueCount), subtext: periodSubtext, icon: AlertTriangle, accent: overdueCount > 0 ? "text-destructive" : "text-muted-foreground", iconBg: overdueCount > 0 ? "bg-destructive/10" : "bg-muted/40" },
    { label: "Auto-completed", value: `${overallAutoRate}%`, subtext: periodSubtext, icon: Zap, accent: autoColor, iconBg: overallAutoRate >= 85 ? "bg-havn-success/10" : overallAutoRate >= 70 ? "bg-havn-amber/10" : "bg-destructive/10" },
  ];

  // ─ Chart data ─
  const salesData = useMemo(() => buildSalesData(orders, period), [orders, period]);
  const ordersData = useMemo(() => buildOrdersData(orders, period), [orders, period]);
  const statusData = useMemo(() => buildStatusData(orders, period), [orders, period]);

  const chartData = chartView === "sales" ? salesData : chartView === "orders" ? ordersData : statusData;
  const xInterval = period === "t24" ? 1 : 0;

  const viewTitle = chartView === "sales" ? "Sales by Month" : chartView === "orders" ? "Items Ordered by Month" : "Status by Month";

  const toggleDocType = (key: DocTypeKey) => {
    setActiveDocTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  const toggleStatus = (key: StatusKey) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  return (
    <div className="space-y-10">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-foreground">Performance</h1>
          <div className="flex items-center gap-3">
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
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((kpi, i) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} delay={i * 60} />
        ))}
      </div>

      {/* ── Main chart section ── */}
      <div className="space-y-5">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-foreground">{viewTitle}</h2>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setChartView(opt.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    chartView === opt.key
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  period === opt.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category / status toggles */}
        {(chartView === "sales" || chartView === "orders") && (
          <div className="flex flex-wrap gap-2">
            {DOC_TYPES.map((cat) => {
              const isActive = activeDocTypes.has(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleDocType(cat.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "border-border bg-card text-foreground shadow-sm"
                      : "border-transparent bg-muted/50 text-muted-foreground"
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color, opacity: isActive ? 1 : 0.3 }}
                  />
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}

        {chartView === "status" && (
          <div className="flex flex-wrap gap-2">
            {STATUS_TYPES.map((cat) => {
              const isActive = activeStatuses.has(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleStatus(cat.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "border-border bg-card text-foreground shadow-sm"
                      : "border-transparent bg-muted/50 text-muted-foreground"
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color, opacity: isActive ? 1 : 0.3 }}
                  />
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Chart */}
        <div className="h-[400px] rounded-xl border border-border bg-card p-4">
          {loading ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(36, 25%, 88%)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(27, 10%, 50%)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={xInterval}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(27, 10%, 50%)" }}
                  axisLine={false}
                  tickLine={false}
                  width={chartView === "sales" ? 55 : 40}
                  tickFormatter={chartView === "sales" ? (v: number) => `$${(v / 1000).toFixed(0)}k` : undefined}
                />
                {chartView !== "status"
                  ? (
                    <Tooltip
                      content={
                        <SingleSegmentTooltip
                          isCurrency={chartView === "sales"}
                          categories={DOC_TYPES}
                          hoveredKey={hoveredKey}
                        />
                      }
                      cursor={{ fill: "rgba(0,0,0,0.05)" }}
                    />
                  ) : (
                    <Tooltip
                      content={
                        <SingleSegmentTooltip
                          categories={STATUS_TYPES}
                          hoveredKey={hoveredKey}
                        />
                      }
                      cursor={{ fill: "rgba(0,0,0,0.05)" }}
                    />
                  )
                }
                {chartView !== "status"
                  ? DOC_TYPES.map((cat) => (
                    <Bar
                      key={cat.key}
                      dataKey={cat.key}
                      stackId="main"
                      fill={activeDocTypes.has(cat.key) ? cat.color : "transparent"}
                      hide={!activeDocTypes.has(cat.key)}
                      onMouseEnter={() => setHoveredKey(cat.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                    />
                  ))
                  : STATUS_TYPES.map((cat) => (
                    <Bar
                      key={cat.key}
                      dataKey={cat.key}
                      stackId="main"
                      fill={activeStatuses.has(cat.key) ? cat.color : "transparent"}
                      hide={!activeStatuses.has(cat.key)}
                      onMouseEnter={() => setHoveredKey(cat.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                    />
                  ))
                }
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Auto-Completion chart ── */}
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Auto-Completion Rate by Document Type
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Based on OCR-processed community documents
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-4 w-10 rounded" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            ))
          ) : autoCompletionData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents uploaded yet.{" "}
              <a href="/dashboard/communities" className="underline hover:text-foreground">
                Upload documents
              </a>{" "}
              to see auto-completion rates.
            </p>
          ) : (
            <>
              {autoCompletionData.map((dt) => (
                <div key={dt.docType} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{dt.docType}</span>
                    <span className={cn("text-sm font-semibold tabular-nums", getRateColor(dt.rate))}>
                      {dt.rate}%
                    </span>
                  </div>
                  <div className="relative h-2.5 w-full rounded-full bg-muted">
                    <div
                      className={cn("absolute inset-y-0 left-0 rounded-full transition-all", getBarBg(dt.rate))}
                      style={{ width: `${dt.rate}%` }}
                    />
                    <div className="absolute inset-y-0 left-[40%] w-px bg-border" title="40%" />
                    <div className="absolute inset-y-0 left-[75%] w-px bg-border" title="75%" />
                    <div className="absolute inset-y-0 left-[85%] w-px bg-border" title="85%" />
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <span className="text-xs text-muted-foreground">&lt; 40%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground">40–74%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-havn-amber" />
                  <span className="text-xs text-muted-foreground">75–84%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-havn-success" />
                  <span className="text-xs text-muted-foreground">85%+</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
