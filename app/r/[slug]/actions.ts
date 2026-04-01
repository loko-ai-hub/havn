"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import resend, { RESEND_FROM_EMAIL } from "@/lib/resend";
import {
  DELIVERY_OPTIONS,
  HOMEOWNER_DELIVERY_OPTIONS,
  PORTAL_DOCUMENTS,
  formatCurrency,
  type PortalOrder,
} from "@/lib/portal-data";

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

function getBaseFee(docId: string) {
  if (docId === "custom_company_form") return 200;
  return PORTAL_DOCUMENTS.find((doc) => doc.id === docId)?.fee ?? 0;
}

export async function submitOrder(input: {
  slug: string;
  organizationId: string;
  portalDisplayName: string;
  supportEmail?: string | null;
  order: PortalOrder;
}) {
  const { slug, organizationId, portalDisplayName, supportEmail, order } = input;
  const selectedDocuments = order.documentsSelected.filter((id) => DOC_TYPE_MAP[id]);

  if (selectedDocuments.length === 0) {
    return { error: "Please select at least one document before submitting." };
  }

  const deliverySpeed = DELIVERY_SPEED_MAP[order.deliveryType] ?? "standard";
  const deliveryFee = getDeliveryFee(order.deliveryType);
  const rushFeePerRow = deliveryFee / selectedDocuments.length;
  const propertyAddress = buildAddress(order);
  const notes = order.addOns.length > 0 ? order.addOns.join(", ") : null;
  const closingDate = order.closingDate
    ? new Date(order.closingDate).toISOString().slice(0, 10)
    : null;

  const rows = selectedDocuments.map((docId) => {
    const baseFee = getBaseFee(docId);
    const rushFee = Number(rushFeePerRow.toFixed(2));
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
      base_fee: baseFee,
      rush_fee: rushFee,
      total_fee: Number((baseFee + rushFee).toFixed(2)),
      notes,
    };
  });

  console.log("SERVICE ROLE KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20));


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
  const totalFee = rows.reduce((sum, row) => sum + Number(row.total_fee ?? 0), 0);
  const documentNames = selectedDocuments
    .map((docId) =>
      docId === "custom_company_form"
        ? "Upload Your Own Form"
        : PORTAL_DOCUMENTS.find((doc) => doc.id === docId)?.name ?? docId
    )
    .join(", ");
  const deliveryLabel = getDeliveryLabel(order.deliveryType);

  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: order.requesterEmail,
        subject: `Your order has been received — ${portalDisplayName}`,
        html: `
          <p>Hi ${order.requesterName}, your order has been received.</p>
          <p><strong>Order ID:</strong> ${shortId}</p>
          <p><strong>Documents:</strong> ${documentNames}</p>
          <p><strong>Property:</strong> ${propertyAddress}</p>
          <p><strong>Delivery:</strong> ${deliveryLabel}</p>
          <p><strong>Total:</strong> ${formatCurrency(totalFee)}</p>
          <p>The management company will be in touch once your documents are ready.</p>
          <p>Questions? Contact us at ${supportEmail || "support@havn.com"}</p>
        `,
      });
    } catch (emailError) {
      console.error("Resend email send failed:", emailError);
    }
  } else {
    console.error("RESEND_API_KEY missing; skipping confirmation email.");
  }

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
