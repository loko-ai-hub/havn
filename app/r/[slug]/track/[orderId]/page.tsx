import { format, parseISO, addBusinessDays, isValid } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

type OrderRow = {
  id: string;
  order_status: string | null;
  requester_name: string | null;
  requester_email: string | null;
  requester_role: string | null;
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
  logo_url: string | null;
  portal_slug: string | null;
  support_email: string | null;
};

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
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

function normalizeBrandHex(input: string | null | undefined): string {
  const v = (input ?? "#1B2B4B").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#1B2B4B";
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

function formatStepDate(iso: string | null): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  return format(d, "MMM d, yyyy 'at' h:mm a");
}

function getSteps(status: string, createdAt: string, paidAt: string | null, fulfilledAt: string | null) {
  const created = parseDate(createdAt);
  const createdLabel = created
    ? format(created, "MMM d, yyyy 'at' h:mm a")
    : "—";

  return [
    {
      label: "Order Received",
      completed: true,
      date: createdLabel,
    },
    {
      label: "Payment Confirmed",
      completed: Boolean(paidAt),
      date: paidAt ? formatStepDate(paidAt) : null,
    },
    {
      label: "Documents Being Prepared",
      completed: status === "fulfilled",
      date: null as string | null,
    },
    {
      label: "Delivered",
      completed: status === "fulfilled",
      date: fulfilledAt ? formatStepDate(fulfilledAt) : null,
    },
  ];
}

function estimatedDeliveryDate(createdAt: string | null, deliverySpeed: string | null): Date | null {
  const base = parseDate(createdAt);
  if (!base) return null;
  const s = deliverySpeed ?? "standard";
  if (s === "rush_same_day") return base;
  if (s === "rush_next_day") return addBusinessDays(base, 1);
  if (s === "rush_3day" || s === "rush_3_day") return addBusinessDays(base, 3);
  return addBusinessDays(base, 5);
}

export default async function RequesterTrackOrderPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const admin = createAdminClient();

  const { data: orgData } = await admin
    .from("organizations")
    .select("id, name, brand_color, logo_url, portal_slug, support_email")
    .eq("portal_slug", slug)
    .single();

  const org = orgData as OrgRow | null;

  const { data: orderData, error: orderError } = await admin
    .from("document_orders")
    .select(
      "id, order_status, requester_name, requester_email, requester_role, property_address, master_type_key, delivery_speed, base_fee, rush_fee, total_fee, paid_at, fulfilled_at, created_at, organization_id"
    )
    .eq("id", orderId)
    .single();

  const order = orderData as OrderRow | null;
  const notFound =
    orderError ||
    !order ||
    !org ||
    order.organization_id !== org.id;

  if (notFound) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Order not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t find an order with that reference for this portal.
          </p>
          <Link
            href={`/r/${slug}`}
            className="mt-6 inline-flex text-sm font-medium text-havn-navy underline-offset-4 hover:underline dark:text-foreground"
          >
            Back to portal
          </Link>
        </div>
      </div>
    );
  }

  const brand = normalizeBrandHex(org.brand_color);
  const borderStyle = { borderColor: `${brand}40` };
  const bgHeroStyle = { backgroundColor: `${brand}08` };

  const status = order.order_status ?? "";
  const steps = getSteps(status, order.created_at ?? "", order.paid_at, order.fulfilled_at);
  const firstOpen = steps.findIndex((s) => !s.completed);
  const currentIndex = firstOpen === -1 ? steps.length - 1 : firstOpen;

  const isFulfilled = status === "fulfilled";
  const fulfilledAtDate = parseDate(order.fulfilled_at);
  const estimate = estimatedDeliveryDate(order.created_at, order.delivery_speed);

  const heroLabel = isFulfilled ? "Delivered" : "Estimated Delivery";
  const heroValue =
    isFulfilled && fulfilledAtDate
      ? format(fulfilledAtDate, "MMM d, yyyy")
      : estimate
        ? format(estimate, "MMM d, yyyy")
        : "—";

  const orgInitial = (org.name?.trim().charAt(0) ?? "O").toUpperCase();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col bg-havn-navy md:flex">
        <div className="p-6">
          <p className="text-lg font-semibold tracking-tight text-havn-sand">Havn</p>
          <div className="mt-8 space-y-3">
            {org.logo_url ? (
              <div className="relative h-12 w-full max-w-[180px]">
                <Image
                  src={org.logo_url}
                  alt={org.name ?? "Organization logo"}
                  fill
                  className="object-contain object-left"
                  unoptimized
                />
              </div>
            ) : null}
            {org.name ? (
              <p className="text-sm font-medium leading-snug text-white">{org.name}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-auto space-y-2 border-t border-white/10 p-6">
          {org.name ? <p className="text-xs font-medium text-white/90">{org.name}</p> : null}
          {org.support_email ? (
            <a
              href={`mailto:${org.support_email}`}
              className="block text-xs text-white/70 underline-offset-2 hover:text-white hover:underline"
            >
              {org.support_email}
            </a>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div
          className="flex items-center gap-3 border-b border-border px-6 py-4 md:hidden"
          style={{ backgroundColor: `${brand}12` }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
            style={{ backgroundColor: brand }}
          >
            {orgInitial}
          </div>
          <p className="text-sm font-semibold text-foreground">{org.name ?? "Portal"}</p>
        </div>

        <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
          <Link
            href={`/r/${slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Back to Portal
          </Link>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Order Tracking</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">Order #{order.id.slice(0, 8)}</p>
          </div>

          <div
            className="rounded-xl border-2 p-5 text-center"
            style={{ ...borderStyle, ...bgHeroStyle }}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {heroLabel}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{heroValue}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Progress
            </p>
            <ul className="mt-6">
              {steps.map((step, i) => {
                const isLast = i === steps.length - 1;
                const isCurrent = i === currentIndex && !step.completed;
                const done = step.completed;

                return (
                  <li key={step.label} className="flex gap-4">
                    <div className="flex w-8 flex-col items-center">
                      {done ? (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                          style={{ backgroundColor: brand }}
                        >
                          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                        </div>
                      ) : isCurrent ? (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-card shadow-sm animate-pulse"
                          style={{ borderColor: brand }}
                        >
                          <Clock className="h-4 w-4" style={{ color: brand }} />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 bg-card">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      {!isLast ? (
                        <div className="my-1 w-px min-h-[2rem] flex-1 bg-border" aria-hidden />
                      ) : null}
                    </div>
                    <div className={`min-w-0 pt-0.5 ${!isLast ? "pb-8" : ""}`}>
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      {step.date ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">{step.date}</p>
                      ) : null}
                      {isCurrent ? (
                        <p className="mt-0.5 text-sm font-medium" style={{ color: brand }}>
                          In progress…
                        </p>
                      ) : null}
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Property
                </p>
                <p className="mt-0.5 text-sm text-foreground">{order.property_address || "—"}</p>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Document
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatDocType(order.master_type_key)}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-foreground">
                  {formatCurrency(order.base_fee)}
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Delivery
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatDeliverySpeed(order.delivery_speed)}
                  </p>
                </div>
                {Number(order.rush_fee) > 0 ? (
                  <p className="text-sm tabular-nums font-medium text-foreground">
                    {formatCurrency(order.rush_fee)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 bg-secondary/30 px-5 py-4">
              <span className="text-sm font-semibold text-foreground">Total Paid</span>
              <span className="text-base font-bold tabular-nums text-foreground">
                {formatCurrency(order.total_fee)}
              </span>
            </div>
          </div>

          {org.support_email ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Questions about your order?</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Contact {org.name ?? "us"} at{" "}
                <a href={`mailto:${org.support_email}`} className="font-medium text-foreground underline-offset-2 hover:underline" style={{ color: brand }}>
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
