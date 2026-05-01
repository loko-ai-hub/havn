"use server";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import resend, { RESEND_FROM_EMAIL } from "@/lib/resend";
import {
  DELIVERY_OPTIONS,
  HOMEOWNER_DELIVERY_OPTIONS,
  PORTAL_DOCUMENTS,
  formatCurrency,
  type PortalOrder,
} from "@/lib/portal-data";

const THIRD_PARTY_BUCKET = "third-party-templates";
const MAX_THIRD_PARTY_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_THIRD_PARTY_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const DOC_TYPE_MAP: Record<string, string> = {
  resale_cert: "resale_certificate",
  resale_cert_update: "certificate_update",
  lender_questionnaire: "lender_questionnaire",
  custom_company_form: "lender_questionnaire",
  estoppel: "estoppel_letter",
  governing_docs: "governing_documents",
  demand_letter: "demand_letter",
};

const DELIVERY_SPEED_MAP: Record<string, string> = {
  standard: "standard",
  rush: "rush_3day",
  rush_nextday: "rush_next_day",
  rush_sameday: "rush_same_day",
};

function getDeliveryLabel(deliveryType: string) {
  return (
    [...DELIVERY_OPTIONS, ...HOMEOWNER_DELIVERY_OPTIONS].find(
      (option) => option.id === deliveryType
    )?.label ?? "Standard"
  );
}

function getDeliveryFee(deliveryType: string) {
  return (
    [...DELIVERY_OPTIONS, ...HOMEOWNER_DELIVERY_OPTIONS].find(
      (option) => option.id === deliveryType
    )?.fee ?? 0
  );
}

function buildAddress(order: PortalOrder) {
  const first = [order.propertyAddress, order.unitNumber].filter(Boolean).join(", ");
  const second = [order.city, order.state, order.zip].filter(Boolean).join(" ");
  return [first, second].filter(Boolean).join(", ");
}

// Server-side fee resolution. Looks up the org's configured base_fee in
// document_request_fees first; falls back to the static PORTAL_DOCUMENTS
// default only when the org hasn't priced that doc type yet.
function getBaseFee(
  docId: string,
  feesByMasterType: Record<string, number | null>
): number {
  const masterKey = DOC_TYPE_MAP[docId];
  if (masterKey && typeof feesByMasterType[masterKey] === "number") {
    return feesByMasterType[masterKey] as number;
  }
  if (docId === "custom_company_form") return 200;
  return PORTAL_DOCUMENTS.find((doc) => doc.id === docId)?.fee ?? 0;
}

export type ThirdPartyUploadDescriptor = {
  path: string;
  filename: string;
  mimeType: string;
};

/**
 * Uploads a requester's third-party form PDF/DOCX to Supabase Storage and
 * returns the storage path so the client can reference it during
 * `submitOrder`. Stored under a temporary UUID directory; the final
 * `third_party_templates` row is created in `submitOrder` and linked via
 * the order id.
 */
export async function uploadThirdPartyForm(
  formData: FormData
): Promise<{ upload: ThirdPartyUploadDescriptor } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided." };
  }
  if (file.size === 0) {
    return { error: "File is empty." };
  }
  if (file.size > MAX_THIRD_PARTY_SIZE_BYTES) {
    return { error: `File is larger than ${Math.round(MAX_THIRD_PARTY_SIZE_BYTES / 1024 / 1024)} MB.` };
  }
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_THIRD_PARTY_MIME.has(mimeType)) {
    return { error: "Only PDF or DOCX files are accepted." };
  }

  const ext = mimeType === "application/pdf" ? "pdf" : "docx";
  const path = `pending/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(THIRD_PARTY_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });

  if (error) {
    return { error: `Upload failed: ${error.message}` };
  }

  return {
    upload: {
      path,
      filename: file.name,
      mimeType,
    },
  };
}

export async function submitOrder(input: {
  slug: string;
  organizationId: string;
  portalDisplayName: string;
  supportEmail?: string | null;
  order: PortalOrder;
  thirdPartyUpload?: ThirdPartyUploadDescriptor | null;
}) {
  const { slug, organizationId, portalDisplayName, supportEmail, order, thirdPartyUpload } = input;
  const selectedDocuments = order.documentsSelected.filter((id) => DOC_TYPE_MAP[id]);

  if (selectedDocuments.length === 0) {
    return { error: "Please select at least one document before submitting." };
  }

  const deliverySpeed = DELIVERY_SPEED_MAP[order.deliveryType] ?? "standard";
  const deliveryFee = getDeliveryFee(order.deliveryType);
  const rushFeePerRow = deliveryFee / selectedDocuments.length;
  const propertyAddress = buildAddress(order);

  // Pull the org's configured per-doc-type base fees so we charge what
  // appears in the org's pricing settings, not the static defaults.
  const adminForFees = createAdminClient();
  const { data: feeRows } = await adminForFees
    .from("document_request_fees")
    .select("master_type_key, base_fee")
    .eq("organization_id", organizationId);
  const feesByMasterType: Record<string, number | null> = {};
  for (const row of (feeRows ?? []) as Array<{
    master_type_key: string;
    base_fee: number | null;
  }>) {
    feesByMasterType[row.master_type_key] = row.base_fee;
  }
  const baseNotes = order.addOns.length > 0 ? order.addOns.join(", ") : null;
  const closingDate = order.closingDate
    ? new Date(order.closingDate).toISOString().slice(0, 10)
    : null;

  // If the order includes a demand_letter (title company payoff request) and
  // the same property already has a qualifying recent cert on file, the
  // payoff letter rides for free. Window: 60 days. Trigger doc types: resale
  // certificate / certificate update / estoppel. Trigger statuses: paid,
  // in_progress, fulfilled (an unpaid prior order shouldn't unlock a freebie).
  const FREE_PAYOFF_WINDOW_DAYS = 60;
  const FREE_PAYOFF_TRIGGER_TYPES = [
    "resale_certificate",
    "certificate_update",
    "estoppel_letter",
  ];
  const FREE_PAYOFF_TRIGGER_STATUSES = ["paid", "in_progress", "fulfilled"];

  let priorCert: {
    masterTypeKey: string;
    createdAt: string;
  } | null = null;
  if (
    selectedDocuments.includes("demand_letter") &&
    propertyAddress.trim().length > 0
  ) {
    const cutoffIso = new Date(
      Date.now() - FREE_PAYOFF_WINDOW_DAYS * 86400000
    ).toISOString();
    const { data: priorMatches } = await createAdminClient()
      .from("document_orders")
      .select("master_type_key, created_at")
      .eq("organization_id", organizationId)
      .ilike("property_address", propertyAddress.trim())
      .in("master_type_key", FREE_PAYOFF_TRIGGER_TYPES)
      .in("order_status", FREE_PAYOFF_TRIGGER_STATUSES)
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(1);
    const hit = (priorMatches ?? [])[0] as
      | { master_type_key: string; created_at: string }
      | undefined;
    if (hit) {
      priorCert = {
        masterTypeKey: hit.master_type_key,
        createdAt: hit.created_at,
      };
    }
  }

  const rows = selectedDocuments.map((docId) => {
    const baseFee = getBaseFee(docId, feesByMasterType);
    const rushFee = Number(rushFeePerRow.toFixed(2));
    const isFreePayoff = docId === "demand_letter" && priorCert !== null;
    const finalBaseFee = isFreePayoff ? 0 : baseFee;
    const freeNote = isFreePayoff
      ? `Free payoff letter — prior ${priorCert!.masterTypeKey} on file (${new Date(
          priorCert!.createdAt
        ).toLocaleDateString("en-US")})`
      : null;
    const notes = [baseNotes, freeNote].filter(Boolean).join(" · ") || null;

    return {
      organization_id: organizationId,
      master_type_key: DOC_TYPE_MAP[docId],
      delivery_speed: deliverySpeed,
      requester_name: order.requesterName,
      requester_email: order.requesterEmail,
      requester_phone: order.requesterPhone || null,
      requester_role: order.requesterType,
      property_address: propertyAddress,
      unit_number: order.unitNumber || null,
      closing_date: closingDate,
      base_fee: finalBaseFee,
      rush_fee: rushFee,
      total_fee: Number((finalBaseFee + rushFee).toFixed(2)),
      notes,
    };
  });



  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("document_orders")
    .insert(rows)
    .select("id");

  if (error) {
    return { error: error.message };
  }

  const insertedIds = (data ?? []).map((row) => row.id as string);
  const firstId = insertedIds[0];
  const shortId = firstId ? firstId.slice(0, 8) : "unknown";

  // If the requester uploaded a third-party form, create the template row
  // and link it to the first order. Ingestion fires later, from the Stripe
  // webhook, so we don't spend OCR budget on abandoned (unpaid) orders.
  if (thirdPartyUpload && firstId) {
    const { data: tplInsert, error: tplErr } = await supabase
      .from("third_party_templates")
      .insert({
        order_id: firstId,
        organization_id: organizationId,
        storage_path_pdf: thirdPartyUpload.path,
        original_filename: thirdPartyUpload.filename,
        mime_type: thirdPartyUpload.mimeType,
        ingest_status: "pending",
        review_status: "pending",
      })
      .select("id")
      .single();
    if (tplErr) {
      console.error("[submitOrder] third_party_templates insert failed:", tplErr.message);
    } else if (tplInsert?.id) {
      const tplId = tplInsert.id as string;
      await supabase
        .from("document_orders")
        .update({
          third_party_template_id: tplId,
          third_party_review_status: "pending",
        })
        .eq("id", firstId);
    }
  }
  const totalFee = rows.reduce((sum, row) => sum + Number(row.total_fee ?? 0), 0);
  const documentNames = selectedDocuments
    .map((docId) =>
      docId === "custom_company_form"
        ? "Upload Your Own Form"
        : PORTAL_DOCUMENTS.find((doc) => doc.id === docId)?.name ?? docId
    )
    .join(", ");
  const deliveryLabel = getDeliveryLabel(order.deliveryType);

  // Requester confirmation email is sent in confirmPayment() after successful payment.

  const params = new URLSearchParams({
    orderId: firstId,
    requesterName: order.requesterName,
    requesterEmail: order.requesterEmail,
    documentTypes: documentNames,
    propertyAddress,
    deliveryType: order.deliveryType,
    totalFee: String(totalFee),
  });

  return {
    insertedIds,
    redirectTo: `/r/${slug}/confirmation?${params.toString()}`,
  };
}
