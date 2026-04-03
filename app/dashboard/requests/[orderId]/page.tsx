import type { ReactNode } from "react";
import { FileText, Mail, MapPin, Phone, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "../../../../lib/supabase/admin";

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey, formatOrderDate } from "../../_lib/format";
import { requireDashboardOrg } from "../../_lib/require-dashboard-org";
import { OrderStatusBadge } from "../../_lib/status-badge";
import RequestsFulfillOrderButton from "../fulfill-order-button";

type OrderDetail = {
  id: string;
  organization_id: string;
  created_at: string | null;
  order_status: string | null;
  master_type_key: string | null;
  delivery_speed: string | null;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  requester_role: string | null;
  property_address: string | null;
  unit_number: string | null;
  closing_date: string | null;
  base_fee: number | null;
  rush_fee: number | null;
  total_fee: number | null;
  notes: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
};

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="bg-havn-navy rounded-t-xl px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">{title}</h2>
      </div>
      <div className="space-y-4 bg-background p-5">{children}</div>
    </section>
  );
}

export default async function DashboardRequestDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: order, error } = await admin.from("document_orders").select("*").eq("id", orderId).single();

  if (error || !order) {
    notFound();
  }

  const row = order as OrderDetail;
  if (row.organization_id !== organizationId) {
    notFound();
  }

  const shortId = row.id.slice(0, 8);
  const showFulfill = row.order_status !== "fulfilled";
  const roleLabel = row.requester_role ? row.requester_role.split("_").join(" ") : "—";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/requests"
          className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to requests
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Request detail</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Order ID: <span className="text-foreground">{shortId}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatOrderDate(row.created_at)}
            </p>
          </div>
          <OrderStatusBadge status={row.order_status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Requested By">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
                <p className="text-sm text-foreground">{row.requester_name || "—"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="text-sm text-foreground">{row.requester_email || "—"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                <p className="text-sm text-foreground">{row.requester_phone || "—"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
                <p className="text-sm capitalize text-foreground">{roleLabel}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Property">
          <div className="space-y-4">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</p>
                <p className="text-sm text-foreground">{row.property_address || "—"}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit</p>
                <p className="text-sm text-foreground">{row.unit_number || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Closing date</p>
                <p className="text-sm text-foreground">{formatOrderDate(row.closing_date)}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Document">
          <div className="flex gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</p>
                <p className="text-sm text-foreground">{formatMasterTypeKey(row.master_type_key)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery</p>
                <p className="text-sm text-foreground">{formatDeliverySpeed(row.delivery_speed)}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base fee</p>
                  <p className="text-sm tabular-nums text-foreground">{formatCurrency(row.base_fee)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rush fee</p>
                  <p className="text-sm tabular-nums text-foreground">{formatCurrency(row.rush_fee)}</p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Payment">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                {formatCurrency(row.total_fee)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stripe PaymentIntent
              </p>
              <p className="break-all font-mono text-sm text-foreground">
                {row.stripe_payment_intent_id || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid at</p>
              <p className="text-sm text-foreground">{row.paid_at ? formatOrderDate(row.paid_at) : "—"}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Order Details">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Full order ID</p>
              <p className="break-all font-mono text-xs text-foreground">{row.id}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</p>
              <p className="text-foreground">{formatOrderDate(row.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fulfilled</p>
              <p className="text-foreground">{row.fulfilled_at ? formatOrderDate(row.fulfilled_at) : "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-foreground">{row.notes || "—"}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {showFulfill ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mark this request fulfilled when documents have been delivered.
          </p>
          <div className="mt-4">
            <RequestsFulfillOrderButton orderId={row.id} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
