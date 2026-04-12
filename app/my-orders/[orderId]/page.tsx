import { addBusinessDays, format, isValid, parseISO } from "date-fns";
import { ArrowLeft, Calendar, CheckCircle2, Clock, FileText, Inbox, MapPin, Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type OrderRow = {
  id: string;
  order_status: string | null;
  requester_email: string | null;
  property_address: string | null;
  master_type_key: string | null;
  delivery_speed: string | null;
  base_fee: number | null;
  rush_fee: number | null;
  total_fee: number | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  created_at: string | null;
  organization_id: string;
};

type OrgRow = {
  id: string;
  name: string | null;
  brand_color: string | null;
  support_email: string | null;
};

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return nameOrEmail.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
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

function formatDeliverySpeed(speed: string | null | undefined): string {
  if (!speed) return "—";
  const map: Record<string, string> = {
    standard: "Standard (5 business days)",
    rush_3_day: "Rush — 3 Day",
    rush_3day: "Rush — 3 Day",
    rush_next_day: "Rush — Next Day",
    rush_same_day: "Rush — Same Day",
  };
  return map[speed] ?? speed;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

function getSteps(status: string, createdAt: string, paidAt: string | null, fulfilledAt: string | null) {
  return [
    {
      label: "Order Received",
      completed: true,
      date: createdAt ? format(parseISO(createdAt), "MMM d, yyyy 'at' h:mm a") : "—",
    },
    {
      label: "Payment Confirmed",
      completed: Boolean(paidAt),
      date: paidAt ? format(parseISO(paidAt), "MMM d, yyyy 'at' h:mm a") : null,
    },
    {
      label: "Documents Being Prepared",
      completed: status === "fulfilled",
      date: null as string | null,
    },
    {
      label: "Delivered",
      completed: status === "fulfilled",
      date: fulfilledAt ? format(parseISO(fulfilledAt), "MMM d, yyyy 'at' h:mm a") : null,
    },
  ];
}

function estimate(createdAt: string | null, deliverySpeed: string | null): Date | null {
  const base = parseDate(createdAt);
  if (!base) return null;
  if (deliverySpeed === "rush_same_day") return base;
  if (deliverySpeed === "rush_next_day") return addBusinessDays(base, 1);
  if (deliverySpeed === "rush_3day" || deliverySpeed === "rush_3_day") return addBusinessDays(base, 3);
  return addBusinessDays(base, 5);
}

function normalizeBrandHex(input: string | null | undefined): string {
  const v = (input ?? "#1B2B4B").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return "#1B2B4B";
}

export default async function MyOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/my-orders/login");
  }

  const admin = createAdminClient();
  const { data: orderData, error } = await admin
    .from("document_orders")
    .select(
      "id, order_status, requester_email, property_address, master_type_key, delivery_speed, base_fee, rush_fee, total_fee, paid_at, fulfilled_at, created_at, organization_id"
    )
    .eq("id", orderId)
    .eq("requester_email", user.email)
    .single();

  if (error || !orderData) {
    redirect("/my-orders");
  }

  const order = orderData as OrderRow;

  const { data: orgData } = await admin
    .from("organizations")
    .select("id, name, brand_color, support_email")
    .eq("id", order.organization_id)
    .single();

  const org = orgData as OrgRow | null;
  const brand = normalizeBrandHex(org?.brand_color);

  const status = order.order_status ?? "";
  const steps = getSteps(status, order.created_at ?? "", order.paid_at, order.fulfilled_at);
  const firstOpen = steps.findIndex((s) => !s.completed);
  const currentIndex = firstOpen === -1 ? steps.length - 1 : firstOpen;
  const isFulfilled = status === "fulfilled";
  const est = estimate(order.created_at, order.delivery_speed);

  const userDisplay =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) || user.email;

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
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
              {initials(userDisplay)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{userDisplay}</p>
              <p className="truncate text-xs text-white/70">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
          <Link
            href="/my-orders"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Back to My Orders
          </Link>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Order Tracking</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">Order #{order.id.slice(0, 8)}</p>
          </div>

          <div className="rounded-xl border-2 p-5 text-center" style={{ borderColor: `${brand}40`, backgroundColor: `${brand}08` }}>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {isFulfilled ? "Delivered" : "Estimated Delivery"}
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {isFulfilled && order.fulfilled_at
                ? format(parseISO(order.fulfilled_at), "MMM d, yyyy")
                : est
                  ? format(est, "MMM d, yyyy")
                  : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Progress</p>
            <ul className="mt-6">
              {steps.map((step, i) => {
                const isCurrent = i === currentIndex && !step.completed;
                const isLast = i === steps.length - 1;
                return (
                  <li key={step.label} className="flex gap-4">
                    <div className="flex w-8 flex-col items-center">
                      {step.completed ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: brand }}>
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      ) : isCurrent ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 animate-pulse" style={{ borderColor: brand }}>
                          <Clock className="h-4 w-4" style={{ color: brand }} />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/30">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      {!isLast ? <div className="my-1 w-px min-h-[2rem] flex-1 bg-border" /> : null}
                    </div>
                    <div className={isLast ? "" : "pb-8"}>
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      {step.date ? <p className="text-sm text-muted-foreground">{step.date}</p> : null}
                      {isCurrent ? <p className="text-sm font-medium" style={{ color: brand }}>In progress…</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="overflow-hidden divide-y divide-border rounded-xl border border-border bg-card">
            <div className="flex gap-3 px-5 py-4">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property</p>
                <p className="mt-0.5 text-sm text-foreground">{order.property_address || "—"}</p>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Document</p>
                  <p className="mt-0.5 text-sm text-foreground">{formatDocType(order.master_type_key)}</p>
                </div>
                <p className="text-sm tabular-nums text-foreground">{formatCurrency(order.base_fee)}</p>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery</p>
                  <p className="mt-0.5 text-sm text-foreground">{formatDeliverySpeed(order.delivery_speed)}</p>
                </div>
                {Number(order.rush_fee) > 0 ? <p className="text-sm tabular-nums text-foreground">{formatCurrency(order.rush_fee)}</p> : null}
              </div>
            </div>
            <div className="flex items-center justify-between bg-secondary/30 px-5 py-4">
              <span className="text-sm font-semibold text-foreground">Total Paid</span>
              <span className="text-base font-bold tabular-nums text-foreground">{formatCurrency(order.total_fee)}</span>
            </div>
          </div>

          {org?.support_email ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Questions about your order?</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Contact {org.name ?? "support"} at{" "}
                <a href={`mailto:${org.support_email}`} className="font-medium underline" style={{ color: brand }}>
                  {org.support_email}
                </a>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
