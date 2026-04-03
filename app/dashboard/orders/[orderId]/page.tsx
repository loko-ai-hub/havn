import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey, formatOrderDate } from "../../_lib/format";
import { requireDashboardOrg } from "../../_lib/require-dashboard-org";
import { OrderStatusBadge } from "../../_lib/status-badge";
import FulfillOrderButton from "./fulfill-button";

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

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-3 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-muted-foreground sm:w-40">{label}</dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </div>
  );
}

export default async function DashboardOrderDetailPage({
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

  const record = order as Record<string, unknown>;
  const displayedKeys = new Set([
    "id",
    "organization_id",
    "created_at",
    "order_status",
    "master_type_key",
    "delivery_speed",
    "requester_name",
    "requester_email",
    "requester_phone",
    "requester_role",
    "property_address",
    "unit_number",
    "closing_date",
    "base_fee",
    "rush_fee",
    "total_fee",
    "notes",
    "stripe_payment_intent_id",
    "paid_at",
    "fulfilled_at",
    "updated_at",
  ]);
  const extraFields = Object.entries(record)
    .filter(([key, value]) => !displayedKeys.has(key) && value !== null && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to orders
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Order detail</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground break-all">Full ID: {row.id}</p>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">Short ID: {shortId}</p>
          </div>
          <OrderStatusBadge status={row.order_status} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Created {formatOrderDate(row.created_at)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection title="Requester">
          <dl className="space-y-3">
            <Row label="Name" value={row.requester_name || "—"} />
            <Row label="Email" value={row.requester_email || "—"} />
            <Row label="Phone" value={row.requester_phone || "—"} />
            <Row label="Role" value={row.requester_role ? row.requester_role.split("_").join(" ") : "—"} />
          </dl>
        </DetailSection>

        <DetailSection title="Property">
          <dl className="space-y-3">
            <Row label="Address" value={row.property_address || "—"} />
            <Row label="Unit" value={row.unit_number || "—"} />
            <Row label="Closing date" value={formatOrderDate(row.closing_date)} />
          </dl>
        </DetailSection>

        <DetailSection title="Document & delivery">
          <dl className="space-y-3">
            <Row label="Document type" value={formatMasterTypeKey(row.master_type_key)} />
            <Row label="Delivery speed" value={formatDeliverySpeed(row.delivery_speed)} />
          </dl>
        </DetailSection>

        <DetailSection title="Fees">
          <dl className="space-y-3">
            <Row label="Base fee" value={formatCurrency(row.base_fee)} />
            <Row label="Rush fee" value={formatCurrency(row.rush_fee)} />
            <Row label="Total" value={<span className="font-semibold">{formatCurrency(row.total_fee)}</span>} />
          </dl>
        </DetailSection>

        <DetailSection title="Payment">
          <dl className="space-y-3">
            <Row label="Stripe PaymentIntent" value={row.stripe_payment_intent_id || "—"} />
            <Row label="Paid at" value={row.paid_at ? formatOrderDate(row.paid_at) : "—"} />
          </dl>
        </DetailSection>

        <DetailSection title="Notes & fulfillment">
          <dl className="space-y-3">
            <Row label="Notes" value={row.notes || "—"} />
            <Row label="Fulfilled at" value={row.fulfilled_at ? formatOrderDate(row.fulfilled_at) : "—"} />
            {typeof record.updated_at === "string" ? (
              <Row label="Updated at" value={formatOrderDate(record.updated_at)} />
            ) : null}
          </dl>
        </DetailSection>
      </div>

      {extraFields.length > 0 ? (
        <DetailSection title="Additional fields">
          <dl className="space-y-3">
            {extraFields.map(([key, value]) => (
              <Row
                key={key}
                label={key.split("_").join(" ")}
                value={
                  <span className="break-all font-mono text-xs">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                }
              />
            ))}
          </dl>
        </DetailSection>
      ) : null}

      {showFulfill ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Fulfillment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mark this order fulfilled when documents have been delivered.
          </p>
          <div className="mt-4">
            <FulfillOrderButton orderId={row.id} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
