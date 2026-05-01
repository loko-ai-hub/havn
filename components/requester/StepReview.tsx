"use client";

import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DELIVERY_OPTIONS,
  HOMEOWNER_DELIVERY_OPTIONS,
  LENDER_ADDONS,
  PORTAL_ADDONS,
  PORTAL_DOCUMENTS,
  formatCurrency,
  getDeliveryDate,
  type PortalOrder,
} from "@/lib/portal-data";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

// Mirror the resolution rules used on the docs step + the server. Keep these
// in sync with PORTAL_ID_TO_MASTER_TYPE in StepDocumentSelection and
// resolveMasterTypeKey in app/r/[slug]/actions.ts.
const PORTAL_ID_TO_MASTER_TYPE: Record<string, string> = {
  resale_cert: "resale_certificate",
  resale_cert_update: "certificate_update",
  lender_questionnaire: "lender_questionnaire",
  custom_company_form: "lender_questionnaire",
  estoppel: "estoppel_letter",
  governing_docs: "governing_documents",
  demand_letter: "demand_letter",
};

function resolveMasterKey(docId: string, requesterType: string): string {
  if (docId === "custom_company_form" && requesterType === "title_company") {
    return "demand_letter";
  }
  return PORTAL_ID_TO_MASTER_TYPE[docId] ?? docId;
}

function labelForDoc(docId: string, requesterType: string): string {
  if (docId === "custom_company_form") {
    return requesterType === "title_company"
      ? "Title Company Payoff Form"
      : "Lender Custom Form";
  }
  const fromPortal = PORTAL_DOCUMENTS.find((d) => d.id === docId);
  if (fromPortal) return fromPortal.name;
  return docId;
}

// Headers across all summary cards on the review page. User asked for these
// to render as plain black instead of brand-colored, so all sections look
// uniform regardless of the org's brandColor.
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="bg-foreground px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-background">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function StepReview({
  slug,
  order,
  primaryColor = "#1B2B4B",
  isSubmitting = false,
  submitError = null,
  onSubmit,
}: {
  slug: string;
  order: PortalOrder;
  primaryColor?: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit?: () => void;
}) {
  const router = useRouter();
  const portalOrg = usePortalOrg();
  const feesByMasterType = portalOrg?.feesByMasterType ?? {};
  const requesterType = order.requesterType;
  const isFormUploadFlow =
    requesterType === "lender_title" || requesterType === "title_company";

  // Resolve each selected docId's display label + fee from the org's
  // configured pricing. Falls back to PORTAL_DOCUMENTS defaults only when
  // the org hasn't priced that master_type_key.
  const resolveFee = (docId: string): number => {
    const masterKey = resolveMasterKey(docId, requesterType);
    const cfg = feesByMasterType[masterKey];
    if (cfg && typeof cfg.base_fee === "number") return cfg.base_fee;
    const fallback = PORTAL_DOCUMENTS.find((d) => d.id === docId);
    return fallback?.fee ?? 0;
  };

  const selectedDocs = order.documentsSelected.map((docId) => ({
    id: docId,
    name: labelForDoc(docId, requesterType),
    fee: resolveFee(docId),
  }));

  // Add-ons are intentionally hidden for lender + title flows — those
  // requesters don't see the add-ons step at all in the new flow.
  const selectedAddOns = isFormUploadFlow
    ? []
    : [...PORTAL_ADDONS, ...LENDER_ADDONS].filter((addon) => order.addOns.includes(addon.id));
  const deliveryDate = getDeliveryDate(order.deliveryType);
  const deliveryOption =
    [...DELIVERY_OPTIONS, ...HOMEOWNER_DELIVERY_OPTIONS].find((option) => option.id === order.deliveryType) ?? {
      label: "Standard",
      fee: 0,
    };
  const fullAddress = order.propertyAddress
    ? `${order.propertyAddress}${order.unitNumber ? `, ${order.unitNumber}` : ""}, ${order.city}, ${order.state} ${order.zip}`.replace(
        /, ,/g,
        ","
      )
    : "Not provided";
  const additionalEmailList = order.additionalEmails.filter(Boolean);

  const docBaseTotal = selectedDocs.reduce((sum, d) => sum + d.fee, 0);
  const addonsTotal = selectedAddOns.reduce((sum, addon) => sum + addon.fee, 0);
  const baseAndAddOns = docBaseTotal + addonsTotal;
  const rushFee = Number(deliveryOption.fee) || 0;
  const total = baseAndAddOns + rushFee;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Review &amp; Pay</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm your order details before proceeding to secure payment.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <SectionCard title="Requester">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{order.requesterName || "Not provided"}</p>
                <p className="text-sm text-muted-foreground">{order.requesterEmail || "Not provided"}</p>
              </div>
              <button type="button" onClick={() => router.push(`/r/${slug}/info`)} className="text-xs font-medium text-havn-navy hover:underline">
                Edit
              </button>
            </div>
            {additionalEmailList.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {additionalEmailList.map((email) => (
                  <span key={email} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground">
                    {email}
                  </span>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Property">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-foreground">{fullAddress}</p>
              <button type="button" onClick={() => router.push(`/r/${slug}/property`)} className="text-xs font-medium text-havn-navy hover:underline">
                Edit
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Documents">
            <div className="space-y-2">
              {selectedDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{doc.name}</span>
                  <span className="text-muted-foreground">{formatCurrency(doc.fee)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right">
              <button type="button" onClick={() => router.push(`/r/${slug}/documents`)} className="text-xs font-medium text-havn-navy hover:underline">
                Edit
              </button>
            </div>
          </SectionCard>

          {selectedAddOns.length > 0 ? (
            <SectionCard title="Add-ons">
              <div className="space-y-2">
                {selectedAddOns.map((addon) => (
                  <div key={addon.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{addon.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(addon.fee)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right">
                <button type="button" onClick={() => router.push(`/r/${slug}/addons`)} className="text-xs font-medium text-havn-navy hover:underline">
                  Edit
                </button>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Delivery">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">{deliveryOption.label}</p>
                <p className="text-xs text-muted-foreground">Estimated completion: {deliveryDate.toLocaleDateString()}</p>
              </div>
              <button type="button" onClick={() => router.push(`/r/${slug}/delivery`)} className="text-xs font-medium text-havn-navy hover:underline">
                Edit
              </button>
            </div>
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <div className="sticky top-24 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="bg-foreground px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-background">Price breakdown</p>
            </div>
            <div className="flex flex-1 flex-col space-y-3 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Base fee</span>
                <span className="text-foreground">{formatCurrency(baseAndAddOns)}</span>
              </div>
              {rushFee > 0 ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rush fee</span>
                  <span className="text-foreground">{formatCurrency(rushFee)}</span>
                </div>
              ) : null}
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-lg font-bold text-foreground">{formatCurrency(total)}</span>
                </div>
              </div>
              {submitError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </div>
              ) : null}
              <div className="mt-auto pt-4">
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onSubmit ?? (() => router.push(`/r/${slug}/confirmation`))}
                  className="h-12 w-full text-base font-semibold text-white hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Submitting..." : "Proceed to Payment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
