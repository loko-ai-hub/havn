"use client";

import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Inbox,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey } from "./_lib/format";
import { OrderStatusBadge } from "./_lib/status-badge";
import { fulfillOrder } from "./requests/actions";


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

async function resolveOrg(supabase: ReturnType<typeof createClient>): Promise<{ orgId: string; portalSlug: string | null } | null> {
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
  if (!orgId) return null;
  const { data: org } = await supabase
    .from("organizations")
    .select("portal_slug")
    .eq("id", orgId)
    .single();
  return { orgId, portalSlug: org?.portal_slug ?? null };
}

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function KpiCardWrapper({ href, children }: { href?: string; children: ReactNode }) {
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

export default function DashboardHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPaid, setOpenPaid] = useState(0);
  const [pendingPayment, setPendingPayment] = useState(0);
  const [fulfilled, setFulfilled] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [docsIndexed, setDocsIndexed] = useState(0);
  const [recent, setRecent] = useState<OrderRow[]>([]);
  const [portalSlug, setPortalSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const resolved = await resolveOrg(supabase);
    if (!resolved) {
      setError("No organization linked to this account.");
      setLoading(false);
      return;
    }
    const { orgId, portalSlug: slug } = resolved;
    setPortalSlug(slug);

    const [paidRes, pendRes, fulRes, revRes, indexedRes, recentRes] = await Promise.all([
      supabase
        .from("document_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("order_status", "paid"),
      supabase
        .from("document_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("order_status", "pending_payment"),
      supabase
        .from("document_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("order_status", "fulfilled"),
      supabase
        .from("document_orders")
        .select("total_fee")
        .eq("organization_id", orgId)
        .in("order_status", ["paid", "fulfilled"]),
      supabase
        .from("community_documents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("ocr_status", "complete"),
      supabase
        .from("document_orders")
        .select(
          "id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status"
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (paidRes.error) {
      setError(paidRes.error.message);
      setLoading(false);
      return;
    }
    if (pendRes.error) {
      setError(pendRes.error.message);
      setLoading(false);
      return;
    }
    if (fulRes.error) {
      setError(fulRes.error.message);
      setLoading(false);
      return;
    }
    if (revRes.error) {
      setError(revRes.error.message);
      setLoading(false);
      return;
    }
    if (indexedRes.error) {
      setError(indexedRes.error.message);
      setLoading(false);
      return;
    }
    if (recentRes.error) {
      setError(recentRes.error.message);
      setLoading(false);
      return;
    }

    setOpenPaid(paidRes.count ?? 0);
    setPendingPayment(pendRes.count ?? 0);
    setFulfilled(fulRes.count ?? 0);
    const revSum = (revRes.data ?? []).reduce((s, r) => s + (Number((r as { total_fee: number | null }).total_fee) || 0), 0);
    setTotalRevenue(revSum);
    setDocsIndexed(indexedRes.count ?? 0);
    setRecent((recentRes.data ?? []) as OrderRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkFulfilled = async (orderId: string) => {
    const result = await fulfillOrder(orderId);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Order marked fulfilled.");
    await load();
    router.refresh();
  };

  const handleSharePortal = async () => {
    if (!portalSlug) return;
    try {
      await navigator.clipboard.writeText(`havnhq.com/r/${portalSlug}`);
      toast.success("Portal link copied!");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-20 -mx-6 mb-2 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dash-community" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Community
            </label>
            <select
              id="dash-community"
              className="h-9 max-w-xs rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              defaultValue="all"
            >
              <option value="all">All communities</option>
            </select>
          </div>
          <Button type="button" variant="outline" className="shrink-0 gap-2" disabled={!portalSlug} onClick={() => void handleSharePortal()}>
            Share portal link
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of requests and revenue for your organization.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCardWrapper href="/dashboard/requests?filter=paid">
          <div className="flex items-start justify-between gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-havn-amber/25 text-havn-amber"
              aria-hidden
            >
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : openPaid}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Open Requests</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Paid, awaiting fulfillment</p>
        </KpiCardWrapper>

        <KpiCardWrapper href="/dashboard/requests?filter=pending_payment">
          <div className="flex items-start justify-between gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-400/25 text-yellow-700 dark:text-yellow-400"
              aria-hidden
            >
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : pendingPayment}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Pending Payment</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Awaiting requester payment</p>
        </KpiCardWrapper>

        <KpiCardWrapper href="/dashboard/requests?filter=fulfilled">
          <div className="flex items-start justify-between gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-havn-success/25 text-emerald-700 dark:text-emerald-400"
              aria-hidden
            >
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : fulfilled}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Fulfilled</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Completed orders</p>
        </KpiCardWrapper>

        <KpiCardWrapper>
          <div className="flex items-start justify-between gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-havn-success/25 text-emerald-700 dark:text-emerald-400"
              aria-hidden
            >
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : formatCurrency(totalRevenue)}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Total Revenue</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Paid and fulfilled orders</p>
        </KpiCardWrapper>

        <KpiCardWrapper>
          <div className="flex items-start justify-between gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/20 text-violet-700 dark:text-violet-300"
              aria-hidden
            >
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {loading ? "—" : docsIndexed}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground/80">Docs Indexed</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Ready for auto-fill</p>
        </KpiCardWrapper>

        {portalSlug ? (
          <a
            href={`https://havnhq.com/r/${portalSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-border bg-card p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-havn-navy/15 text-havn-navy"
                aria-hidden
              >
                <ExternalLink className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">Portal</p>
            <p className="mt-1 text-xs font-medium text-foreground/80">Resident portal</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{`havnhq.com/r/${portalSlug}`}</p>
          </a>
        ) : null}
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Recent orders</h2>
          <Link
            href="/dashboard/requests"
            className="text-sm font-medium text-havn-navy underline-offset-4 hover:underline dark:text-white"
          >
            View all requests →
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading orders…</p>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            No orders yet. Share your portal link to receive requests.
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
                {recent.map((order) => {
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
    </div>
  );
}
