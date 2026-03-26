"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import PortalPaymentBlock from "@/components/requester/PortalPaymentBlock";
import {
  PORTAL_DOCUMENTS,
  formatCurrency,
  getDeliveryDate,
  getTotalFee,
  type PortalOrder,
} from "@/lib/portal-data";

export default function StepReview({
  slug,
  order,
}: {
  slug: string;
  order: PortalOrder;
}) {
  const router = useRouter();
  const total = getTotalFee(order);
  const selectedDocs = PORTAL_DOCUMENTS.filter((doc) =>
    order.documentsSelected.includes(doc.id)
  );
  const deliveryDate = getDeliveryDate(order.deliveryType);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Review order
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm your details and complete payment.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-foreground">Order summary</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Property:{" "}
              <span className="text-foreground">
                {order.propertyAddress || "Not provided"}
              </span>
            </p>
            <p>
              Delivery:{" "}
              <span className="text-foreground">{order.deliveryType || "standard"}</span>
            </p>
            <p>
              Estimated completion:{" "}
              <span className="text-foreground">
                {deliveryDate.toLocaleDateString()}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documents
            </p>
            {selectedDocs.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No documents selected.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {selectedDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{doc.name}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(doc.fee)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <PortalPaymentBlock
          total={total}
          onPay={() => router.push(`/r/${slug}/confirmation`)}
        />
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => router.push(`/r/${slug}/delivery`)}>
          Back
        </Button>
      </div>
    </div>
  );
}
