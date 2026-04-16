import type { ReactNode } from "react";
import {
  Building2,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { mapFieldsToDocument } from "@/lib/autofill";
import { getCommunityFields } from "@/lib/community-data";
import { createAdminClient } from "../../../../lib/supabase/admin";

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey, formatOrderDate } from "../../_lib/format";
import { requireDashboardOrg } from "../../_lib/require-dashboard-org";
import { OrderStatusBadge } from "../../_lib/status-badge";
import ApproveRejectButtons from "../approve-reject-buttons";

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

const AUTOFILL_TOTAL_FIELDS = 20; // approximate max fields for a document type

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

function getAutoFillColor(pct: number) {
  if (pct >= 85) return "text-havn-success";
  if (pct >= 75) return "text-havn-amber";
  if (pct >= 40) return "text-foreground";
  return "text-destructive";
}

function getAutoFillBg(pct: number) {
  if (pct >= 85) return "bg-havn-success";
  if (pct >= 75) return "bg-havn-amber";
  if (pct >= 40) return "bg-muted-foreground";
  return "bg-destructive";
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
  const showActions = row.order_status !== "fulfilled" && row.order_status !== "cancelled" && row.order_status !== "refunded";
  const roleLabel = row.requester_role ? row.requester_role.split("_").join(" ") : "—";

  const { data: community } = await admin
    .from("communities")
    .select("id")
    .eq("organization_id", row.organization_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const communityId = community?.id as string | undefined;
  const rawFields = communityId ? await getCommunityFields(communityId) : null;
  const mapped =
    rawFields != null ? mapFieldsToDocument(rawFields, row.master_type_key ?? "") : null;
  const autofillFieldCount = mapped
    ? Object.values(mapped).filter((v) => v != null && String(v).trim() !== "").length
    : 0;
  const hasAutofillData = autofillFieldCount > 0;
  const autoFillPct = Math.min(100, Math.round((autofillFieldCount / AUTOFILL_TOTAL_FIELDS) * 100));
  const autoFillColor = getAutoFillColor(autoFillPct);
  const autoFillBg = getAutoFillBg(autoFillPct);
  const documentsHref = communityId
    ? `/dashboard/communities/${communityId}/documents`
    : "/dashboard/communities";

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Auto-fill callout — Lovable style */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-havn-navy">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Auto-Filled by Havn</p>
          {hasAutofillData ? (
            <p className="text-xs text-muted-foreground">
              {autofillFieldCount} field{autofillFieldCount === 1 ? "" : "s"} auto-populated from community data
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No community data available —{" "}
              <Link href={documentsHref} className="underline hover:text-foreground">
                upload documents
              </Link>{" "}
              to enable auto-fill
            </p>
          )}
        </div>
        {hasAutofillData && (
          <div className="shrink-0 text-right">
            <p className={`text-3xl font-bold tabular-nums ${autoFillColor}`}>{autoFillPct}%</p>
            <p className="text-xs text-muted-foreground">auto-completed</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Requested By */}
        <SectionCard title="Requested By">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
                <p className="text-sm font-medium text-foreground">{row.requester_name || "—"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
                <p className="text-sm capitalize text-foreground">{roleLabel}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                <p className="text-sm text-foreground">{row.requester_phone || "—"}</p>
              </div>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="text-sm text-foreground">{row.requester_email || "—"}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Property */}
        <SectionCard title="Property Address">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{row.property_address || "—"}</p>
              {row.unit_number && (
                <p className="text-xs text-muted-foreground">Unit {row.unit_number}</p>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Document */}
        <SectionCard title="Document">
          {/* Header row: icon + name + progress + review button */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {formatMasterTypeKey(row.master_type_key)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDeliverySpeed(row.delivery_speed)}
                  {row.closing_date ? ` · Due ${formatOrderDate(row.closing_date)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {/* Progress bar */}
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                    <div
                      className={`h-full rounded-full ${autoFillBg}`}
                      style={{ width: `${autoFillPct}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold tabular-nums ${autoFillColor}`}>
                    {autoFillPct}%
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">complete</p>
              </div>
              <Link
                href={`/dashboard/requests/${row.id}/review`}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" />
                Review
              </Link>
            </div>
          </div>
          {/* Fee breakdown */}
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base fee</p>
              <p className="text-sm tabular-nums text-foreground">{formatCurrency(row.base_fee)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rush fee</p>
              <p className="text-sm tabular-nums text-foreground">{formatCurrency(row.rush_fee)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(row.total_fee)}</p>
            </div>
          </div>
        </SectionCard>

        {/* Order Details */}
        <SectionCard title="Order Details">
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order date</p>
                <p className="text-foreground">{formatOrderDate(row.created_at)}</p>
              </div>
              {row.closing_date && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Closing date</p>
                  <p className="text-foreground">{formatOrderDate(row.closing_date)}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid at</p>
                <p className="text-foreground">{row.paid_at ? formatOrderDate(row.paid_at) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fulfilled</p>
                <p className="text-foreground">{row.fulfilled_at ? formatOrderDate(row.fulfilled_at) : "—"}</p>
              </div>
            </div>
            {row.stripe_payment_intent_id && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment intent</p>
                <p className="break-all font-mono text-xs text-muted-foreground">{row.stripe_payment_intent_id}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Full order ID</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{row.id}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Notes / Add-Ons */}
      {row.notes && (
        <SectionCard title="Notes / Add-Ons">
          <p className="whitespace-pre-wrap text-sm text-foreground">{row.notes}</p>
        </SectionCard>
      )}

      {/* Actions */}
      {showActions && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve to mark this request fulfilled and notify the requester, or reject to cancel it.
          </p>
          <div className="mt-4">
            <ApproveRejectButtons orderId={row.id} alreadyFulfilled={row.order_status === "fulfilled"} />
          </div>
        </div>
      )}
    </div>
  );
}
