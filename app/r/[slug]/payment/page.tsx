import { createAdminClient } from "../../../../lib/supabase/admin";
import { formatCurrency, PORTAL_DOCUMENTS } from "../../../../lib/portal-data";
import PaymentForm from "./PaymentForm";
import { createPaymentIntent } from "./actions";

const DELIVERY_SPEED_TO_PORTAL_TYPE: Record<string, string> = {
  standard: "standard",
  rush_3day: "rush",
  rush_next_day: "rush_nextday",
  rush_same_day: "rush_sameday",
};

const MASTER_TYPE_TO_PORTAL_DOC_ID: Record<string, string> = {
  resale_certificate: "resale_cert",
  certificate_update: "resale_cert_update",
  lender_questionnaire: "lender_questionnaire",
  estoppel_letter: "estoppel",
  governing_documents: "governing_docs",
  demand_letter: "demand_letter",
};

export default async function RequesterPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orderId?: string | string[] }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const orderIdRaw = resolvedSearchParams.orderId;
  const orderId = Array.isArray(orderIdRaw) ? orderIdRaw[0] : orderIdRaw;

  if (!orderId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">Missing order id.</p>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("document_orders")
    .select(
      "id,total_fee,organization_id,requester_email,requester_name,property_address,delivery_speed,master_type_key"
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{orderError?.message ?? "Unable to load order."}</p>
        </div>
      </div>
    );
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("stripe_account_id,brand_color")
    .eq("id", order.organization_id)
    .single();

  if (orgError || !org) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{orgError?.message ?? "Unable to load organization."}</p>
        </div>
      </div>
    );
  }

  const primaryColor = org.brand_color ?? "#1B2B4B";

  const paymentIntentResult = await createPaymentIntent(orderId);
  if ("error" in paymentIntentResult) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{paymentIntentResult.error ?? "Unable to create payment intent."}</p>
        </div>
      </div>
    );
  }

  const deliveryType = DELIVERY_SPEED_TO_PORTAL_TYPE[order.delivery_speed] ?? "standard";

  const portalDocId = MASTER_TYPE_TO_PORTAL_DOC_ID[order.master_type_key] ?? order.master_type_key;
  const docName = PORTAL_DOCUMENTS.find((d) => d.id === portalDocId)?.name ?? portalDocId;

  const confirmationQuery = new URLSearchParams({
    orderId,
    requesterName: order.requester_name ?? "",
    requesterEmail: order.requester_email ?? "",
    documentTypes: docName,
    propertyAddress: order.property_address ?? "",
    deliveryType,
    totalFee: String(order.total_fee ?? 0),
  });

  const totalFee = Number(order.total_fee ?? 0);

  return (
    <div>
      {/* Display primary color to match the portal theme */}
      <div data-primary-color={primaryColor} />
      <PaymentForm
        slug={slug}
        orderId={orderId}
        clientSecret={paymentIntentResult.clientSecret}
        totalFee={totalFee}
        confirmationQuery={confirmationQuery.toString()}
        primaryColor={primaryColor}
      />
      {/* Keep a minimal summary for users with JS disabled */}
      <div className="mx-auto mt-6 w-full max-w-3xl px-6 text-sm text-muted-foreground">
        Total: {formatCurrency(totalFee)}
      </div>
    </div>
  );
}

