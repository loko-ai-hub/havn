import { createAdminClient } from "@/lib/supabase/admin";
import { getAllCommunityOcrFields } from "@/lib/community-data";
import { getTemplate, type DocumentTemplate, type FieldDef } from "@/lib/document-templates";

export type FieldSource = "order" | "cache" | "ocr" | null;

export type MergedField = {
  value: string | null;
  source: FieldSource;
};

export type MergedFieldSet = {
  fields: Record<string, MergedField>;
  template: DocumentTemplate;
  completionPct: number;
  communityId: string | null;
};

/**
 * Build pre-filled fields for an order by merging 3 sources:
 *   1. Order data (highest priority)
 *   2. Community field cache (from previous fulfillments)
 *   3. OCR-extracted data (lowest priority)
 */
export async function getPrefilledFields(
  orderId: string
): Promise<MergedFieldSet | { error: string }> {
  const admin = createAdminClient();

  // Load the order
  const { data: order, error: orderErr } = await admin
    .from("document_orders")
    .select(
      "id, organization_id, master_type_key, property_address, unit_number, requester_name, requester_email, requester_phone, closing_date, community_id, draft_fields"
    )
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { error: "Order not found." };

  const masterTypeKey = order.master_type_key as string | null;
  if (!masterTypeKey) return { error: "Order has no document type." };

  const template = getTemplate(masterTypeKey);
  if (!template) return { error: `No template for document type: ${masterTypeKey}` };

  // Resolve community — use order.community_id or fall back to most recent for org
  let communityId = order.community_id as string | null;
  if (!communityId) {
    const { data: community } = await admin
      .from("communities")
      .select("id")
      .eq("organization_id", order.organization_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    communityId = (community?.id as string) ?? null;
  }

  // If there's a saved draft, use it directly
  const draftFields = order.draft_fields as Record<string, string | null> | null;
  if (draftFields && Object.keys(draftFields).length > 0) {
    const fields: Record<string, MergedField> = {};
    for (const f of template.fields) {
      const val = draftFields[f.key] ?? null;
      fields[f.key] = { value: val, source: val ? "cache" : null };
    }
    const filled = Object.values(fields).filter((f) => f.value?.trim()).length;
    const required = template.fields.filter((f) => f.required).length;
    return {
      fields,
      template,
      completionPct: required > 0 ? Math.min(100, Math.round((filled / required) * 100)) : 100,
      communityId,
    };
  }

  // Source 3 (lowest priority): OCR-extracted fields from all community docs
  const ocrFields = communityId ? await getAllCommunityOcrFields(communityId) : {};

  // Source 2: Community field cache
  const cacheFields: Record<string, string | null> = {};
  if (communityId) {
    const { data: cacheRows } = await admin
      .from("community_field_cache")
      .select("field_key, field_value")
      .eq("community_id", communityId)
      .in("document_type", [masterTypeKey, "_shared"]);

    for (const row of cacheRows ?? []) {
      const val = row.field_value as string | null;
      if (val?.trim()) cacheFields[row.field_key as string] = val;
    }
  }

  // Source 1 (highest priority): Order data
  const orderFields: Record<string, string | null> = {
    property_address: order.property_address as string | null,
    unit_number: order.unit_number as string | null,
    requester_name: order.requester_name as string | null,
    requester_email: order.requester_email as string | null,
    requester_phone: order.requester_phone as string | null,
    closing_date: order.closing_date as string | null,
  };

  // Merge with priority: order > cache > ocr
  const fields: Record<string, MergedField> = {};
  for (const f of template.fields) {
    const ocrKey = f.ocrFieldKey ?? f.key;

    // Check order data
    if (orderFields[f.key]?.trim()) {
      fields[f.key] = { value: orderFields[f.key], source: "order" };
      continue;
    }

    // Check cache
    if (cacheFields[f.key]?.trim()) {
      fields[f.key] = { value: cacheFields[f.key], source: "cache" };
      continue;
    }

    // Check OCR (try exact key, then ocrFieldKey)
    const ocrVal = ocrFields[ocrKey] ?? ocrFields[f.key] ?? null;
    if (ocrVal?.trim()) {
      // Flatten arrays to comma-separated strings
      fields[f.key] = { value: ocrVal, source: "ocr" };
      continue;
    }

    fields[f.key] = { value: null, source: null };
  }

  const filled = Object.values(fields).filter((f) => f.value?.trim()).length;
  const required = template.fields.filter((f) => f.required).length;

  return {
    fields,
    template,
    completionPct: required > 0 ? Math.min(100, Math.round((filled / required) * 100)) : 100,
    communityId,
  };
}
