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
  getTotalFee,
  type PortalOrder,
} from "@/lib/portal-data";

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
  const total = getTotalFee(order);
  const selectedDocs = PORTAL_DOCUMENTS.filter((doc) =>
    order.documentsSelected.includes(doc.id)
  );
  const selectedAddOns = [...PORTAL_ADDONS, ...LENDER_ADDONS].filter((addon) =>
    order.addOns.includes(addon.id)
  );
  const deliveryDate = getDeliveryDate(order.deliveryType);
  const deliveryLabel =
    [...DELIVERY_OPTIONS, ...HOMEOWNER_DELIVERY_OPTIONS].find(
      (option) => option.id === order.deliveryType
    )?.label ?? order.deliveryType ?? "Standard";
  const fullAddress = order.propertyAddress
    ? `${order.propertyAddress}${order.unitNumber ? `, ${order.unitNumber}` : ""}, ${order.city}, ${order.state} ${order.zip}`.replace(
        /, ,/g,
        ","
      )
    : "Not provided";
  const deliveryOption =
    [...DELIVERY_OPTIONS, ...HOMEOWNER_DELIVERY_OPTIONS].find(
      (option) => option.id === order.deliveryType
    ) ?? { label: "Standard", fee: 0 };
  const additionalEmailList = order.additionalEmails.filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Review Your Order
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Please confirm everything looks correct before submitting.
      </p>

      <div className="mt-8 space-y-4">
        <div className="w-full rounded-xl px-6 py-6 text-white sm:px-7 sm:py-7" style={{ backgroundColor: primaryColor }}>
          <p className="text-xs uppercase tracking-widest text-white/80">CLOSING DATE</p>
          <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {order.closingDate ? new Date(order.closingDate).toLocaleDateString() : "Not provided"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="border-b border-border pb-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Requester</p>
              <button
                type="button"
                onClick={() => router.push(`/r/${slug}/info`)}
                className="text-xs font-medium text-havn-navy hover:underline"
              >
                Edit
              </button>
            </div>
            <p className="text-sm text-foreground">{order.requesterName || "Not provided"}</p>
            <p className="text-sm text-muted-foreground">{order.requesterEmail || "Not provided"}</p>
            {additionalEmailList.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {additionalEmailList.map((email) => (
                  <span key={email} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground">
                    {email}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="border-b border-border py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Property</p>
              <button
                type="button"
                onClick={() => router.push(`/r/${slug}/property`)}
                className="text-xs font-medium text-havn-navy hover:underline"
              >
                Edit
              </button>
            </div>
            <p className="text-sm text-foreground">{fullAddress}</p>
          </div>

          <div className="border-b border-border py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Documents</p>
              <button
                type="button"
                onClick={() => router.push(`/r/${slug}/documents`)}
                className="text-xs font-medium text-havn-navy hover:underline"
              >
                Edit
              </button>
            </div>
            <ul className="space-y-1">
              {selectedDocs.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{doc.name}</span>
                  <span className="text-muted-foreground">{formatCurrency(doc.fee)}</span>
                </li>
              ))}
            </ul>
          </div>

          {selectedAddOns.length > 0 ? (
            <div className="border-b border-border py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Add-ons</p>
                <button
                  type="button"
                  onClick={() => router.push(`/r/${slug}/addons`)}
                  className="text-xs font-medium text-havn-navy hover:underline"
                >
                  Edit
                </button>
              </div>
              <ul className="space-y-1">
                {selectedAddOns.map((addon) => (
                  <li key={addon.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{addon.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(addon.fee)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="border-b border-border py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Delivery</p>
              <button
                type="button"
                onClick={() => router.push(`/r/${slug}/delivery`)}
                className="text-xs font-medium text-havn-navy hover:underline"
              >
                Edit
              </button>
            </div>
            <p className="text-sm text-foreground">{deliveryLabel}</p>
            <p className="text-xs text-muted-foreground">Estimated completion: {deliveryDate.toLocaleDateString()}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(deliveryOption.fee)}</p>
          </div>

          <div className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-foreground">Total Due</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          No payment is due yet. You&apos;ll enter your payment details on the next step. Certificates are delivered to the email addresses provided.
        </p>
      </div>
      {submitError ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{submitError}</p>
        </div>
      ) : null}

      <div className="mt-8 flex items-center gap-3">
        <Button type="button" variant="outline" className="h-12 flex-1 text-base" onClick={() => router.push(`/r/${slug}/delivery`)}>
          Back
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={onSubmit ?? (() => router.push(`/r/${slug}/confirmation`))}
          className="h-12 flex-1 text-base font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          {isSubmitting ? "Submitting..." : "Review &amp; Pay"}
        </Button>
      </div>
    </div>
  );
}
