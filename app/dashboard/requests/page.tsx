"use client";

import { format, parseISO } from "date-fns";
import { Inbox, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
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

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey } from "../_lib/format";
import { OrderStatusBadge } from "../_lib/status-badge";
import { fulfillOrder } from "./actions";

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

type FilterTab = "all" | "pending_payment" | "paid" | "fulfilled";

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

export default function DashboardRequestsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

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
        "id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status"
      )
      .eq("organization_id", orgId)
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((row) => {
      if (filter !== "all" && row.order_status !== filter) return false;
      if (!q) return true;
      const name = (row.requester_name ?? "").toLowerCase();
      const email = (row.requester_email ?? "").toLowerCase();
      const prop = (row.property_address ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || prop.includes(q);
    });
  }, [orders, filter, search]);

  const handleMarkFulfilled = async (orderId: string) => {
    const result = await fulfillOrder(orderId);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Order marked fulfilled.");
    await loadOrders();
    router.refresh();
  };

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "pending_payment", label: "Pending Payment" },
    { id: "paid", label: "Paid" },
    { id: "fulfilled", label: "Fulfilled" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Document orders from your requester portal.
      </p>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === tab.id
                  ? "border-havn-navy bg-havn-navy text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          placeholder="Search name, email, or property…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm bg-background"
        />
      </div>

      {loadError ? (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{loadError}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading requests…</p>
      ) : !loadError && filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="mt-4 text-sm font-medium text-foreground">No requests match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another filter or search, or check back when new orders arrive.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
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
              {filtered.map((order) => {
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
                      <span className="block font-medium text-foreground">
                        {order.requester_name || "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {order.requester_email || "—"}
                      </span>
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
  );
}
