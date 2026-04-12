"use client";

import { addMonths, format, parseISO, subMonths } from "date-fns";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  MoreHorizontal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
};

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

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function KpiCardWrapper({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  const className = cn(
    "block rounded-xl border border-border bg-card p-5 text-left transition-all duration-200",
    "hover:-translate-y-0.5 hover:shadow-md",
    href && "cursor-pointer"
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}

export default function DashboardPerformancePage() {
  const [period, setPeriod] = useState<Period>("12m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);

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
    const { data, error: queryError } = await supabase
      .from("document_orders")
      .select(
        "id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status"
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (queryError) {
      setError(queryError.message);
      setAllOrders([]);
    } else {
      setAllOrders((data ?? []) as OrderRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orders = useMemo(
    () => allOrders.filter((o) => isInPeriod(o.created_at, period)),
    [allOrders, period]
  );

  const openRequests = orders.filter((o) => o.order_status === "paid").length;
  const completed = orders.filter((o) => o.order_status === "fulfilled").length;
  const total = orders.length;
  const totalRevenue = orders
    .filter((o) => o.order_status === "paid" || o.order_status === "fulfilled")
    .reduce((sum, o) => sum + (Number(o.total_fee) || 0), 0);
  const avgOrderValue = total > 0 ? totalRevenue / total : 0;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  const completionTone =
    completionRate >= 70
      ? "text-havn-success bg-havn-success/20"
      : completionRate >= 40
      ? "text-havn-amber bg-havn-amber/25"
      : "text-destructive bg-destructive/20";

  const recent = orders.slice(0, 10);

  const revenueByMonth = useMemo(() => {
    const months = period === "all" ? 6 : period === "24m" ? 12 : 6;
    const end = new Date();
    const start = subMonths(new Date(end.getFullYear(), end.getMonth(), 1), months - 1);
    const buckets = Array.from({ length: months }).map((_, idx) => {
      const d = addMonths(start, idx);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: format(d, "MMM"),
        amount: 0,
      };
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

  const pendingCount = orders.filter((o) => o.order_status === "pending_payment").length;
  const paidCount = orders.filter((o) => o.order_status === "paid").length;
  const fulfilledCount = orders.filter((o) => o.order_status === "fulfilled").length;
  const statusTotal = Math.max(1, pendingCount + paidCount + fulfilledCount);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Performance
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Community
            </label>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option>All communities</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Manager
            </label>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option>All managers</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Time period
            </label>
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
                    "rounded px-2.5 py-1 text-xs font-medium",
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCardWrapper href="/dashboard/requests?filter=paid">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-havn-amber/25 text-havn-amber">
            <Clock className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : openRequests}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Open Requests</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Paid, in review queue</p>
        </KpiCardWrapper>
        <KpiCardWrapper>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-havn-success/25 text-havn-success">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : completed}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Completed</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Fulfilled orders</p>
        </KpiCardWrapper>
        <KpiCardWrapper>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-havn-success/25 text-havn-success">
            <DollarSign className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : formatCurrency(totalRevenue)}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Total Revenue</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Paid + fulfilled</p>
        </KpiCardWrapper>
        <KpiCardWrapper>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-blue-700 dark:text-blue-300">
            <FileText className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : formatCurrency(avgOrderValue)}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Avg Order Value</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Revenue divided by total orders</p>
        </KpiCardWrapper>
        <KpiCardWrapper>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", completionTone)}>
            <Zap className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : `${completionRate.toFixed(0)}%`}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Completion Rate</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Fulfilled / total orders</p>
        </KpiCardWrapper>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Revenue by Month</h2>
          <div className="mt-6 flex h-48 items-end justify-between gap-2">
            {revenueByMonth.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {m.amount > 0 ? formatCurrency(m.amount) : "—"}
                </p>
                <div
                  className="w-full max-w-[44px] rounded-t-md"
                  style={{
                    height: `${Math.max(6, (m.amount / maxRevenue) * 100)}%`,
                    background: "hsl(var(--havn-navy, 24 11% 9%))",
                  }}
                />
                <p className="text-[10px] font-medium text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Orders by Status</h2>
          <div className="mt-6 h-4 w-full overflow-hidden rounded-full bg-muted">
            <div className="flex h-full w-full">
              <div
                className="bg-havn-amber"
                style={{ width: `${(pendingCount / statusTotal) * 100}%` }}
              />
              <div
                className="bg-blue-500"
                style={{ width: `${(paidCount / statusTotal) * 100}%` }}
              />
              <div
                className="bg-havn-success"
                style={{ width: `${(fulfilledCount / statusTotal) * 100}%` }}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            <p className="text-muted-foreground">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-havn-amber" />
              Pending Payment ({pendingCount})
            </p>
            <p className="text-muted-foreground">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
              Paid ({paidCount})
            </p>
            <p className="text-muted-foreground">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-havn-success" />
              Fulfilled ({fulfilledCount})
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Orders</h2>
          <Link href="/dashboard/requests" className="text-sm font-medium text-foreground hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((order) => {
                const detailHref = `/dashboard/requests/${order.id}`;
                return (
                  <TableRow key={order.id} className="cursor-pointer border-border hover:bg-muted/30">
                    <TableCell>{formatOrderDate(order.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{order.requester_name || "—"}</span>
                      <span className="block text-xs text-muted-foreground">{order.requester_email || "—"}</span>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {order.property_address || "—"}
                    </TableCell>
                    <TableCell>{formatMasterTypeKey(order.master_type_key)}</TableCell>
                    <TableCell>{formatDeliverySpeed(order.delivery_speed)}</TableCell>
                    <TableCell>{formatCurrency(order.total_fee)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.order_status} />
                    </TableCell>
                    <TableCell>
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
      </section>
    </div>
  );
}
