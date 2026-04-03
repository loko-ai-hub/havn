"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { formatCurrency } from "../_lib/format";
import { cn } from "@/lib/utils";

type Period = "12m" | "24m" | "all";

function startIsoForPeriod(period: Period): string | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "12m") {
    d.setFullYear(d.getFullYear() - 1);
  } else {
    d.setFullYear(d.getFullYear() - 2);
  }
  return d.toISOString();
}

async function resolveOrgId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let orgId: string | null =
    typeof user.user_metadata?.organization_id === "string" ? user.user_metadata.organization_id : null;
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

type OrderMin = {
  total_fee: number | null;
  order_status: string | null;
};

export default function DashboardPerformancePage() {
  const [period, setPeriod] = useState<Period>("12m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderMin[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const orgId = await resolveOrgId(supabase);
    if (!orgId) {
      setError("No organization linked to this account.");
      setOrders([]);
      setLoading(false);
      return;
    }

    const start = startIsoForPeriod(period);
    let query = supabase
      .from("document_orders")
      .select("total_fee, order_status")
      .eq("organization_id", orgId);
    if (start) {
      query = query.gte("created_at", start);
    }
    const { data, error: queryError } = await query;

    if (queryError) {
      setError(queryError.message);
      setOrders([]);
    } else {
      setOrders((data ?? []) as OrderMin[]);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const totalOrders = orders.length;
    const totalRevenue = orders
      .filter((o) => o.order_status === "paid" || o.order_status === "fulfilled")
      .reduce((sum, o) => sum + (Number(o.total_fee) || 0), 0);
    const fulfilled = orders.filter((o) => o.order_status === "fulfilled").length;
    const pending = orders.filter((o) => o.order_status === "pending_payment").length;
    return { totalOrders, totalRevenue, fulfilled, pending };
  }, [orders]);

  const periodTabs: { id: Period; label: string }[] = [
    { id: "12m", label: "Last 12 months" },
    { id: "24m", label: "Last 24 months" },
    { id: "all", label: "All time" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Performance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Orders and revenue for your organization.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {periodTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPeriod(t.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                period === t.id
                  ? "border-havn-navy bg-havn-navy text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Orders" value={loading ? "—" : String(kpis.totalOrders)} />
        <KpiCard label="Total Revenue" value={loading ? "—" : formatCurrency(kpis.totalRevenue)} />
        <KpiCard label="Fulfilled Orders" value={loading ? "—" : String(kpis.fulfilled)} />
        <KpiCard label="Pending Orders" value={loading ? "—" : String(kpis.pending)} />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Revenue over time</h2>
        </div>
        <div className="flex min-h-[280px] items-center justify-center bg-muted/20 px-6 py-12">
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Charting and trends are coming soon. You&apos;ll be able to see daily and monthly revenue here.
          </p>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
