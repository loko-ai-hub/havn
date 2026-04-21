"use client";

import { addBusinessDays, format } from "date-fns";
import { Inbox, Package, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  organization_id: string;
  order_status: string | null;
  property_address: string | null;
  master_type_key: string | null;
  delivery_speed: string | null;
  created_at: string | null;
  total_fee: number | null;
};

type OrgRow = {
  id: string;
  name: string | null;
  brand_color: string | null;
};

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return nameOrEmail.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstName(nameOrEmail: string): string {
  const cleaned = nameOrEmail.trim();
  if (!cleaned) return "there";
  if (cleaned.includes("@")) return cleaned.split("@")[0];
  return cleaned.split(/\s+/)[0] || "there";
}

function formatDocType(key: string | null | undefined): string {
  const map: Record<string, string> = {
    resale_certificate: "Resale Certificate",
    lender_questionnaire: "Lender Questionnaire",
    certificate_update: "Certificate Update",
    demand_letter: "Demand Letter",
  };
  if (!key) return "—";
  return map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function estDate(createdAt: string | null, speed: string | null): string {
  if (!createdAt) return "—";
  const base = new Date(createdAt);
  if (Number.isNaN(base.getTime())) return "—";
  const normalized = speed ?? "standard";
  let days = 5;
  if (normalized === "rush_3day" || normalized === "rush_3_day") days = 3;
  if (normalized === "rush_next_day") days = 1;
  if (normalized === "rush_same_day") days = 0;
  return format(addBusinessDays(base, days), "MMM d, yyyy");
}

function brandHex(input: string | null | undefined): string {
  const v = (input ?? "#1B2B4B").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#1B2B4B";
}

const steps = ["Received", "Payment Confirmed", "Preparing", "Delivered"];

export default function MyOrdersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orgById, setOrgById] = useState<Record<string, OrgRow>>({});
  const [filter, setFilter] = useState<"all" | "active" | "delivered">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      router.replace("/my-orders/login");
      return;
    }

    setUserEmail(user.email);
    setUserName(
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) || user.email
    );

    const { data: orderRows, error } = await supabase
      .from("document_orders")
      .select("id, organization_id, order_status, property_address, master_type_key, delivery_speed, created_at, total_fee")
      .eq("requester_email", user.email)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setOrders([]);
      setLoading(false);
      return;
    }

    const typed = (orderRows ?? []) as OrderRow[];
    setOrders(typed);

    const orgIds = [...new Set(typed.map((o) => o.organization_id).filter(Boolean))];
    if (orgIds.length > 0) {
      const { data: orgRows } = await supabase
        .from("organizations")
        .select("id, name, brand_color")
        .in("id", orgIds);
      const map: Record<string, OrgRow> = {};
      for (const row of (orgRows ?? []) as OrgRow[]) {
        map[row.id] = row;
      }
      setOrgById(map);
    }

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(
    () => orders.filter((o) => o.order_status !== "fulfilled").length,
    [orders]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "delivered") return orders.filter((o) => o.order_status === "fulfilled");
    return orders.filter((o) => o.order_status !== "fulfilled");
  }, [filter, orders]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/my-orders/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col bg-havn-navy md:flex">
        <div className="border-b border-white/10 p-6">
          <p className="text-lg font-semibold tracking-tight text-havn-sand">Havn</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <Link href="/my-orders" className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-medium text-white">
            <Inbox className="h-4 w-4" />
            My Orders
          </Link>
          <Link href="/my-orders/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => window.open("mailto:support@havnhq.com", "_blank")}
            className="mt-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white"
          >
            Help
          </button>
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
              {initials(userName || userEmail)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{userName || userEmail}</p>
              <p className="truncate text-xs text-white/70">{userEmail}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={() => void handleSignOut()}
          >
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between border-b border-white/10 bg-havn-navy px-4 py-3 md:hidden">
          <p className="text-lg font-semibold tracking-tight text-havn-sand">Havn</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
            {initials(userName || userEmail)}
          </div>
        </div>

        <main className="px-6 py-8 sm:px-10 sm:py-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName(userName || userEmail)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {orders.length} total · {activeCount} active
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {([
              ["all", "All Orders"],
              ["active", "Active"],
              ["delivered", "Delivered"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  filter === id
                    ? "border-havn-navy bg-havn-navy text-white"
                    : "border-border bg-card text-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            {!loading && filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-base font-medium text-foreground">No orders found</p>
              </div>
            ) : null}

            {filtered.map((order) => {
              const org = orgById[order.organization_id];
              const status = order.order_status;
              const paymentDone = status === "paid" || status === "fulfilled";
              const delivered = status === "fulfilled";
              const complete = [true, paymentDone, delivered, delivered];
              const stepColor = delivered ? "#16a34a" : "#1B2B4B";
              const orgBrand = brandHex(org?.brand_color);
              const created = order.created_at ? format(new Date(order.created_at), "MMM d, yyyy") : "—";

              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => router.push(`/my-orders/${order.id}`)}
                  className="w-full rounded-xl border border-border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-bold text-white"
                        style={{ backgroundColor: orgBrand }}
                      >
                        {(org?.name?.charAt(0) ?? "O").toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{org?.name ?? "Organization"}</p>
                        <p className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8)}</p>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        status === "fulfilled"
                          ? "border-havn-success/40 bg-havn-success/20 text-emerald-900"
                          : status === "paid"
                            ? "border-blue-500/40 bg-blue-500/15 text-blue-900"
                            : "border-havn-amber/50 bg-havn-amber/20 text-amber-900"
                      )}
                    >
                      {status === "fulfilled" ? "Delivered" : status === "paid" ? "In Review" : "Pending Payment"}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                    {steps.map((label, idx) => (
                      <div key={label} className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                            complete[idx] ? "text-white" : "border border-border bg-background text-muted-foreground"
                          )}
                          style={complete[idx] ? { backgroundColor: stepColor } : undefined}
                        >
                          {complete[idx] ? "✓" : idx + 1}
                        </div>
                        <span className="text-xs text-muted-foreground">{label}</span>
                        {idx < steps.length - 1 ? (
                          <div
                            className="h-px w-8"
                            style={{ backgroundColor: complete[idx + 1] ? stepColor : "#d4d4d8" }}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <p className="truncate">{order.property_address || "—"}</p>
                    <p>{formatDocType(order.master_type_key)}</p>
                    <p>Order date: {created}</p>
                    <p>Estimated delivery: {estDate(order.created_at, order.delivery_speed)}</p>
                  </div>

                  {delivered ? (
                    <div className="mt-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          toast.info("Check your email for the document download link.");
                        }}
                      >
                        Download Documents
                      </Button>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
