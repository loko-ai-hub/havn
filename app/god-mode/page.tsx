"use client";

import { format, parseISO } from "date-fns";
import { Building2, CheckCircle2, LayoutDashboard, MoreHorizontal, Settings, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey } from "../dashboard/_lib/format";
import { OrderStatusBadge } from "../dashboard/_lib/status-badge";
import { fulfillOrder } from "../dashboard/requests/actions";

type Tab = "home" | "customers" | "orders" | "settings";

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

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function PlatformKpiCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {subtext ? <p className="mt-1 text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

export default function GodModePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [platformRevenue, setPlatformRevenue] = useState<number | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const loadKpis = useCallback(async () => {
    const supabase = createClient();
    const [countRes, revRes] = await Promise.all([
      supabase.from("document_orders").select("id", { count: "exact", head: true }),
      supabase.from("document_orders").select("total_fee").in("order_status", ["paid", "fulfilled"]),
    ]);
    if (!countRes.error) setOrderCount(countRes.count ?? 0);
    if (!revRes.error) {
      const sum = (revRes.data ?? []).reduce((s, r) => s + (Number((r as { total_fee: number | null }).total_fee) || 0), 0);
      setPlatformRevenue(sum);
    }
  }, []);

  const loadAllOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("document_orders")
      .select(
        "id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setOrdersError(error.message);
      setOrders([]);
    } else {
      setOrders((data ?? []) as OrderRow[]);
    }
    setOrdersLoading(false);
  }, []);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    if (tab === "orders") void loadAllOrders();
  }, [tab, loadAllOrders]);

  const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = useMemo(
    () => [
      { id: "home", label: "Home", icon: LayoutDashboard },
      { id: "customers", label: "Customers", icon: Building2 },
      { id: "orders", label: "Orders", icon: ShoppingCart },
      { id: "settings", label: "Settings", icon: Settings },
    ],
    []
  );

  const handleMarkFulfilled = async (orderId: string) => {
    const result = await fulfillOrder(orderId);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Order marked fulfilled.");
    await loadAllOrders();
    await loadKpis();
    router.refresh();
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-56 shrink-0 flex-col bg-havn-navy text-white">
        <div className="border-b border-white/10 px-5 py-4">
          <span className="text-xl font-semibold tracking-tight text-white">Havn</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                tab === id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/80"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            href="/dashboard"
            className="block rounded-lg px-3 py-2.5 text-center text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
          >
            Exit to Dashboard
          </Link>
        </div>
      </aside>

      <main className="ml-56 min-h-screen flex-1 overflow-y-auto px-8 py-8">
        {tab === "home" ? (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
              <p className="mt-1 text-sm text-muted-foreground">Internal Havn admin (scoped to your session).</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PlatformKpiCard label="Total Customers" value="1" subtext="Design partner orgs" />
              <PlatformKpiCard
                label="Total Orders"
                value={orderCount == null ? "—" : String(orderCount)}
                subtext="All orders visible to this session"
              />
              <PlatformKpiCard
                label="Total Revenue"
                value={platformRevenue == null ? "—" : formatCurrency(platformRevenue)}
                subtext="Paid + fulfilled"
              />
              <PlatformKpiCard label="States Active" value="1" subtext="Washington (WA)" />
            </div>
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Platform Health</h2>
              </div>
              <ul className="space-y-3 p-5 text-sm text-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Resend: <strong>Verified</strong> (orders@havnhq.com)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Stripe Connect: <strong>Enabled</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Domain: <strong>havnhq.com</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Database: <strong>Supabase connected</strong>
                  </span>
                </li>
              </ul>
            </section>
          </div>
        ) : null}

        {tab === "customers" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
              <p className="mt-1 text-sm text-muted-foreground">Management companies on Havn.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Company</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Stripe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">AmLo Management</TableCell>
                    <TableCell className="text-muted-foreground">Duvall, WA</TableCell>
                    <TableCell>
                      <span className="text-foreground">loren@havnhq.com</span>
                    </TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell>Connected</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full border border-havn-success/40 bg-havn-success/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                        Active
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="outline" size="sm" onClick={() => toast.info("Coming soon")}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {tab === "orders" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">All Platform Orders</h1>
              <p className="mt-1 text-sm text-muted-foreground">Document orders visible under your current session.</p>
            </div>
            {ordersError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {ordersError}
              </div>
            ) : null}
            {ordersLoading ? (
              <p className="text-sm text-muted-foreground">Loading orders…</p>
            ) : orders.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
                No orders found.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
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
                      <TableHead className="w-[100px] text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const detailHref = `/dashboard/requests/${order.id}`;
                      const shortId = order.id.slice(0, 8);
                      const canFulfill = order.order_status !== "fulfilled";
                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer border-border hover:bg-muted/30"
                          onClick={() => router.push(detailHref)}
                        >
                          <TableCell className="text-foreground">{formatOrderDate(order.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs text-foreground">{shortId}</TableCell>
                          <TableCell>
                            <span className="block font-medium text-foreground">{order.requester_name || "—"}</span>
                            <span className="block text-xs text-muted-foreground">{order.requester_email || "—"}</span>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">
                            {order.property_address || "—"}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {formatMasterTypeKey(order.master_type_key)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDeliverySpeed(order.delivery_speed)}
                          </TableCell>
                          <TableCell className="tabular-nums text-foreground">
                            {formatCurrency(order.total_fee)}
                          </TableCell>
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
                                <span className="sr-only">Actions</span>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-44 p-1">
                                <Link
                                  href={detailHref}
                                  className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
                                >
                                  Open
                                </Link>
                                {canFulfill ? (
                                  <button
                                    type="button"
                                    className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                                    onClick={() => void handleMarkFulfilled(order.id)}
                                  >
                                    Mark Fulfilled
                                  </button>
                                ) : null}
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
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">Platform configuration (read-only).</p>
            </div>
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Environment</h2>
              </div>
              <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform</p>
                  <p className="mt-1 font-medium text-foreground">Havn</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</p>
                  <p className="mt-1 font-medium text-foreground">1.0.0-beta</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Environment</p>
                  <p className="mt-1 font-medium text-foreground">Production</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Domain</p>
                  <p className="mt-1 font-medium text-foreground">havnhq.com</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                  <p className="mt-1 font-medium text-foreground">orders@havnhq.com</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stripe</p>
                  <p className="mt-1 font-medium text-foreground">Connected (test mode)</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Database</p>
                  <p className="mt-1 font-medium text-foreground">Supabase (svvveiovnrkfvdwvfrxh)</p>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}