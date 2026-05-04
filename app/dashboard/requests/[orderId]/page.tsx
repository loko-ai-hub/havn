import type { ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { mapFieldsToDocument } from "@/lib/autofill";
import { getCommunityFields } from "@/lib/community-data";
import { createAdminClient } from "../../../../lib/supabase/admin";

import {
  formatCurrency,
  formatDeliverySpeed,
  formatMasterTypeKey,
  formatOrderDate,
} from "../../_lib/format";
import { requireDashboardOrg } from "../../_lib/require-dashboard-org";
import { getStatusCfg } from "../../_lib/status-badge";
import ApproveRejectButtons from "../approve-reject-buttons";
import RefundButton from "./refund-button";

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
  requester_company: string | null;
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
  third_party_review_status: string | null;
  third_party_template_id: string | null;
};

const AUTOFILL_TOTAL_FIELDS = 20;

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="rounded-t-xl bg-havn-navy px-5 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white">{title}</h3>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </div>
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

function getDaysRemaining(closingDate: string | null): number | null {
  if (!closingDate) return null;
  try {
    const due = new Date(closingDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export default async function DashboardRequestDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("document_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (error || !order) notFound();

  const row = order as OrderDetail;
  if (row.organization_id !== organizationId) notFound();

  const shortId = row.id.slice(0, 8);
  const showActions =
    row.order_status !== "fulfilled" &&
    row.order_status !== "cancelled" &&
    row.order_status !== "refunded";
  const canRefund =
    row.order_status === "paid" && Boolean(row.stripe_payment_intent_id);
  const roleLabel = row.requester_role
    ? row.requester_role.split("_").join(" ")
    : "—";

  const days = getDaysRemaining(row.closing_date);
  const statusCfg = getStatusCfg(row.order_status);
  const StatusIcon = statusCfg.Icon;

  // Auto-fill
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
  const autoFillPct = Math.min(
    100,
    Math.round((autofillFieldCount / AUTOFILL_TOTAL_FIELDS) * 100)
  );
  const autoFillColor = getAutoFillColor(autoFillPct);
  const autoFillBg = getAutoFillBg(autoFillPct);
  const documentsHref = communityId
    ? `/dashboard/communities/${communityId}/documents`
    : "/dashboard/communities";

  // 3P upload: signed URL to the pristine PDF the requester uploaded,
  // before any pipeline output. Used to render the "View original upload"
  // button. Skipped when the order has no 3P template attached.
  let originalUploadUrl: string | null = null;
  let originalUploadFilename: string | null = null;
  {
    const { data: tpl3p } = await admin
      .from("third_party_templates")
      .select("storage_path_pdf, original_filename")
      .eq("order_id", row.id)
      .maybeSingle();
    const tplRow = tpl3p as
      | { storage_path_pdf: string | null; original_filename: string | null }
      | null;
    if (tplRow?.storage_path_pdf) {
      const { data: signed } = await admin.storage
        .from("third-party-templates")
        .createSignedUrl(tplRow.storage_path_pdf, 60 * 60); // 1h
      originalUploadUrl = signed?.signedUrl ?? null;
      originalUploadFilename = tplRow.original_filename ?? null;
    }
  }

  // Add-ons: notes is a comma-joined string from the portal
  const addOns = row.notes
    ? row.notes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 -mx-6 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/requests"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-semibold text-foreground">{shortId}</h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.className}`}
          >
            <StatusIcon className="h-3 w-3" />
            {statusCfg.label}
          </span>
          <ThirdPartyReviewBadge status={row.third_party_review_status} />
          {days !== null && (
            <div className="ml-auto">
              <span
                className={`text-sm font-semibold tabular-nums ${
                  days < 0
                    ? "text-destructive"
                    : days <= 3
                    ? "text-havn-amber"
                    : "text-havn-success"
                }`}
              >
                {days < 0
                  ? `${Math.abs(days)}d overdue`
                  : `${days}d remaining`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {/* Auto-fill callout */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-havn-navy">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Auto-Filled by Havn</p>
            {hasAutofillData ? (
              <p className="text-xs text-muted-foreground">
                {autofillFieldCount} field{autofillFieldCount === 1 ? "" : "s"} auto-populated
                from community data
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
              <p className={`text-3xl font-bold tabular-nums ${autoFillColor}`}>
                {autoFillPct}%
              </p>
              <p className="text-xs text-muted-foreground">auto-completed</p>
            </div>
          )}
        </div>

        {/* Requested By */}
        <SectionCard title="Requested By">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium text-foreground">
                  {row.requester_name || "—"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="text-sm capitalize text-foreground">{roleLabel}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="text-sm text-foreground">
                  {row.requester_company || "—"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm text-foreground">{row.requester_phone || "—"}</p>
              </div>
            </div>
            <div className="col-span-2 flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm text-foreground">{row.requester_email || "—"}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Add-Ons */}
        {addOns.length > 0 && (
          <SectionCard title="Add-Ons Selected">
            <div className="flex flex-wrap gap-2">
              {addOns.map((addOn) => (
                <span
                  key={addOn}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-havn-amber/30 bg-havn-amber/10 px-3 py-1.5 text-sm font-medium text-foreground"
                >
                  <Package className="h-3.5 w-3.5 text-havn-amber" />
                  {addOn}
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Property Address */}
        <SectionCard title="Property Address">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {row.property_address || "—"}
              </p>
              {row.unit_number && (
                <p className="text-xs text-muted-foreground">Unit {row.unit_number}</p>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Document */}
        <SectionCard title="Document">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-havn-surface">
                <FileText className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {formatMasterTypeKey(row.master_type_key)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Order {shortId}
                  {row.closing_date ? ` · Due ${formatOrderDate(row.closing_date)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {/* Progress */}
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
              <div className="flex flex-wrap items-center gap-2">
                {originalUploadUrl && (
                  <a
                    href={originalUploadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    title={
                      originalUploadFilename
                        ? `Open ${originalUploadFilename} in a new tab — the file as the requester uploaded it, before any Havn processing.`
                        : "Open the original uploaded file in a new tab — before any Havn processing."
                    }
                  >
                    <ExternalLink className="h-4 w-4" />
                    View original upload
                  </a>
                )}
                <Link
                  href={`/dashboard/requests/${row.id}/review`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" />
                  Review Document
                </Link>
              </div>
            </div>
          </div>
          {/* Fee breakdown */}
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Base fee</p>
              <p className="text-sm tabular-nums text-foreground">
                {formatCurrency(row.base_fee)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rush fee</p>
              <p className="text-sm tabular-nums text-foreground">
                {formatCurrency(row.rush_fee)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-sm font-bold tabular-nums text-foreground">
                {formatCurrency(row.total_fee)}
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Order Details */}
        <SectionCard title="Order Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Order Date</p>
              <p className="text-sm font-medium text-foreground">
                {formatOrderDate(row.created_at)}
              </p>
            </div>
            {row.closing_date && (
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="text-sm font-medium text-foreground">
                  {formatOrderDate(row.closing_date)}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Request Type</p>
              <p className="text-sm font-medium text-foreground">
                {formatMasterTypeKey(row.master_type_key)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delivery</p>
              <p className="text-sm font-medium text-foreground">
                {formatDeliverySpeed(row.delivery_speed)}
              </p>
            </div>
            {row.paid_at && (
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-sm text-foreground">{formatOrderDate(row.paid_at)}</p>
              </div>
            )}
            {row.fulfilled_at && (
              <div>
                <p className="text-xs text-muted-foreground">Fulfilled</p>
                <p className="text-sm text-foreground">
                  {formatOrderDate(row.fulfilled_at)}
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Actions */}
        {showActions && (
          <div className="pt-2">
            <ApproveRejectButtons orderId={row.id} alreadyFulfilled={false} />
          </div>
        )}

        {canRefund && (
          <div className="pt-2">
            <RefundButton orderId={row.id} totalFee={row.total_fee} />
          </div>
        )}
      </div>
    </div>
  );
}

function ThirdPartyReviewBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cfg: Record<string, { label: string; cls: string }> = {
    pending: {
      label: "Awaiting 3P form review",
      cls: "border-havn-amber/40 bg-havn-amber/10 text-havn-amber",
    },
    approved: {
      label: "Using requester-supplied form",
      cls: "border-havn-success/40 bg-havn-success/10 text-havn-success",
    },
    denied: {
      label: "Default Havn form (3P denied)",
      cls: "border-border bg-muted/50 text-muted-foreground",
    },
    auto_defaulted: {
      label: "Default Havn form (3P timed out)",
      cls: "border-border bg-muted/50 text-muted-foreground",
    },
  };
  const entry = cfg[status];
  if (!entry) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${entry.cls}`}
    >
      {entry.label}
    </span>
  );
}
