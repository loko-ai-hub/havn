import Link from "next/link";
import { notFound } from "next/navigation";

import { getPrefilledFields } from "@/lib/document-fields";
import { createAdminClient } from "@/lib/supabase/admin";

import { formatMasterTypeKey } from "../../../_lib/format";
import { requireDashboardOrg } from "../../../_lib/require-dashboard-org";
import ReviewForm from "./review-form";

export default async function DashboardRequestReviewPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { organizationId, userName, email } = await requireDashboardOrg();
  const admin = createAdminClient();

  // Verify order belongs to this org
  const { data: order, error } = await admin
    .from("document_orders")
    .select("id, organization_id, master_type_key, property_address, order_status")
    .eq("id", orderId)
    .single();

  if (error || !order || order.organization_id !== organizationId) notFound();

  const masterTypeKey = order.master_type_key as string | null;
  const isFulfilled = order.order_status === "fulfilled";

  // Load community list for this org (for the community selector)
  const { data: communities } = await admin
    .from("communities")
    .select("id, legal_name")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("legal_name");

  // Get prefilled fields
  const result = await getPrefilledFields(orderId);
  const hasError = "error" in result;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/requests/${orderId}`}
          className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          &larr; Back to request detail
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Review Document
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMasterTypeKey(masterTypeKey)}
          {order.property_address ? ` · ${order.property_address as string}` : ""}
        </p>
      </div>

      {hasError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{result.error}</p>
        </div>
      ) : (
        <ReviewForm
          orderId={orderId}
          template={result.template}
          initialFields={result.fields}
          completionPct={result.completionPct}
          communityId={result.communityId}
          communities={(communities ?? []).map((c) => ({
            id: c.id as string,
            name: c.legal_name as string,
          }))}
          isFulfilled={isFulfilled}
          currentUserName={userName}
          currentUserEmail={email}
        />
      )}
    </div>
  );
}
