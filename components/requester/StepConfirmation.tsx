"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getDeliveryDate, type PortalOrder } from "@/lib/portal-data";

export default function StepConfirmation({
  slug,
  orderNumber,
  order,
}: {
  slug: string;
  orderNumber: string;
  order: PortalOrder;
}) {
  const router = useRouter();
  const eta = getDeliveryDate(order.deliveryType || "standard");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-16 text-center">
      <CheckCircle2 className="h-12 w-12 text-havn-success" />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        Order confirmed
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your request has been submitted. We&apos;ll email updates as your order
        progresses.
      </p>

      <div className="mt-8 w-full rounded-xl border border-border bg-card p-5 text-left">
        <p className="text-sm text-muted-foreground">Order number</p>
        <p className="text-lg font-semibold text-foreground">{orderNumber}</p>
        <p className="mt-3 text-sm text-muted-foreground">Estimated delivery</p>
        <p className="text-sm font-medium text-foreground">
          {eta.toLocaleDateString()}
        </p>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => router.push(`/r/${slug}/track/${orderNumber}`)}>
          Track order
        </Button>
        <Button type="button" onClick={() => router.push(`/r/${slug}`)} className="bg-havn-navy text-white hover:bg-havn-navy-light">
          Return to portal
        </Button>
      </div>
    </div>
  );
}
