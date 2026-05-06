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
    .select(
      "id, organization_id, master_type_key, property_address, order_status, community_unit_id, match_source, match_applied_at"
    )
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

  // Match suggestion (for 3P uploads). Null when no template row exists.
  const { data: tpl } = await admin
    .from("third_party_templates")
    .select(
      "match_level, match_confidence, match_reasoning, suggested_community_id, suggested_unit_id, extracted_context, mapped_count, unmapped_count, storage_path_pdf, pdf_pages, field_layout, detected_fields"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  const tplRow = tpl as
    | {
        match_level: string | null;
        match_confidence: string | null;
        match_reasoning: string | null;
        suggested_community_id: string | null;
        suggested_unit_id: string | null;
        extracted_context: {
          associationName: string | null;
          propertyAddress: string | null;
          ownerNames: string[];
        } | null;
        mapped_count: number | null;
        unmapped_count: number | null;
        storage_path_pdf: string | null;
        pdf_pages: Array<{ page: number; width: number; height: number }> | null;
        field_layout: Array<{
          registryKey: string | null;
          label: string;
          page: number;
          kind?: "text" | "checkbox";
          selectionValue?: string | null;
          valueBbox: { x: number; y: number; w: number; h: number } | null;
          labelBbox: { x: number; y: number; w: number; h: number } | null;
          currentValue: string;
        }> | null;
        detected_fields: Array<{
          externalLabel: string;
          registryKey: string | null;
          confidence: number | null;
          fieldKind?: string | null;
          reasoning?: string | null;
        }> | null;
      }
    | null;

  // Sign a short-lived URL for the original PDF so the overlay UI can
  // render it client-side. Skipped when no 3P upload exists.
  let pdfSignedUrl: string | null = null;
  if (tplRow?.storage_path_pdf) {
    const { data: signed } = await admin.storage
      .from("third-party-templates")
      .createSignedUrl(tplRow.storage_path_pdf, 60 * 60); // 1h
    pdfSignedUrl = signed?.signedUrl ?? null;
  }

  const overlay =
    tplRow && pdfSignedUrl && tplRow.pdf_pages && tplRow.field_layout
      ? {
          pdfUrl: pdfSignedUrl,
          pages: tplRow.pdf_pages,
          fields: tplRow.field_layout,
        }
      : null;

  // Claude's text-based extraction. Catches everything Form Parser
  // misses (especially the underline-blank text fields most HOA forms
  // use for response questions). Form view renders these as a flat
  // editable list; PDF view stays on overlay.fields for spatial
  // accuracy.
  const detectedFields = (tplRow?.detected_fields ?? []) as Array<{
    externalLabel: string;
    registryKey: string | null;
    confidence: number | null;
    fieldKind?: string | null;
  }>;

  // Resolve names for the suggested community + unit so the card can show
  // them without a second round-trip on the client.
  const suggestedCommunityId = tplRow?.suggested_community_id ?? null;
  const suggestedUnitId = tplRow?.suggested_unit_id ?? null;

  const [communityNameRow, unitRow] = await Promise.all([
    suggestedCommunityId
      ? admin
          .from("communities")
          .select("legal_name")
          .eq("id", suggestedCommunityId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    suggestedUnitId
      ? admin
          .from("community_units")
          .select("property_street, owner_names")
          .eq("id", suggestedUnitId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const matchCard = tplRow
    ? {
        level: tplRow.match_level,
        confidence: tplRow.match_confidence,
        reasoning: tplRow.match_reasoning,
        suggestedCommunityId,
        suggestedCommunityName:
          (communityNameRow.data as { legal_name: string } | null)?.legal_name ?? null,
        suggestedUnitId,
        suggestedUnitStreet:
          (unitRow.data as { property_street: string | null } | null)?.property_street ?? null,
        suggestedUnitOwners:
          (unitRow.data as { owner_names: string[] | null } | null)?.owner_names ?? null,
        appliedAt: (order.match_applied_at as string | null) ?? null,
        matchSource: (order.match_source as string | null) ?? null,
        extractedContext: tplRow.extracted_context ?? null,
        mappedCount: tplRow.mapped_count ?? 0,
        unmappedCount: tplRow.unmapped_count ?? 0,
        appliedUnitId: (order.community_unit_id as string | null) ?? null,
      }
    : null;

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
          matchCard={matchCard}
          overlay={overlay}
          detectedFields={detectedFields}
        />
      )}
    </div>
  );
}
