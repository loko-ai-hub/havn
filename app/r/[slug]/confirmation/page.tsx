"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  DELIVERY_OPTIONS,
  HOMEOWNER_DELIVERY_OPTIONS,
  formatCurrency,
} from "@/lib/portal-data";
import { confirmPayment } from "@/app/r/[slug]/payment/actions";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterConfirmationPage() {
  const router = useRouter();
  const portalOrg = usePortalOrg();
  const searchParams = useSearchParams();
  const routeParams = useParams<{ slug: string }>();
  const slug = routeParams?.slug ?? "";
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const logoUrl = portalOrg?.logoUrl;
  const orgName = portalOrg?.name ?? "Organization";
  const orderId = searchParams.get("orderId") ?? "unknown";
  const requesterName = searchParams.get("requesterName") ?? "Not provided";
  const requesterEmail = searchParams.get("requesterEmail") ?? "Not provided";
  const documentTypes = searchParams.get("documentTypes") ?? "Not provided";
  const propertyAddress = searchParams.get("propertyAddress") ?? "Not provided";
  const deliveryType = searchParams.get("deliveryType") ?? "standard";
  const totalFee = Number(searchParams.get("totalFee") ?? "0");
  const paymentIntentId = searchParams.get("payment_intent");
  const redirectStatus = searchParams.get("redirect_status");
  const deliveryLabel =
    [...DELIVERY_OPTIONS, ...HOMEOWNER_DELIVERY_OPTIONS].find(
      (option) => option.id === deliveryType
    )?.label ?? deliveryType;
  const shortId = orderId.slice(0, 8);

  // Accelerate status transition when the user lands here via a Stripe redirect
  // (e.g. after 3DS). Webhook is still the source of truth; this is idempotent.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (!paymentIntentId || redirectStatus !== "succeeded") return;
    if (!orderId || orderId === "unknown") return;
    firedRef.current = true;
    confirmPayment(orderId, paymentIntentId).catch((err) => {
      console.error("confirmPayment (redirect-return) failed:", err);
    });
  }, [orderId, paymentIntentId, redirectStatus]);

  if (redirectStatus === "failed") {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-14 md:py-16">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 md:p-8">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Payment failed
            </h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Your payment could not be completed. No charge was made. Please try again.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() =>
                router.push(`/r/${slug}/payment?orderId=${orderId}`)
              }
              className="rounded-md px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = redirectStatus === "processing";
  const badgeLabel = isProcessing ? "Processing" : "Received";
  const headingLabel = isProcessing ? "Payment processing" : "Order Received";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-14 md:py-16">
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={`${orgName} logo`}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : null}
            <p className="text-sm font-medium text-foreground">{orgName}</p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            {badgeLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-havn-success" />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {headingLabel}
          </h1>
        </div>

        <div className="mt-6 space-y-3 rounded-xl border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">
            Order ID: <span className="font-medium text-foreground">{shortId}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Requester:{" "}
            <span className="font-medium text-foreground">
              {requesterName} ({requesterEmail})
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Documents: <span className="font-medium text-foreground">{documentTypes}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Property: <span className="font-medium text-foreground">{propertyAddress}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Delivery: <span className="font-medium text-foreground">{deliveryLabel}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Total fee: <span className="font-medium text-foreground">{formatCurrency(totalFee)}</span>
          </p>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          {isProcessing
            ? "Your bank is finalizing the payment. You'll receive a confirmation email at "
            : "A confirmation email has been sent to "}
          <span className="font-medium text-foreground">{requesterEmail}</span>
          {isProcessing ? " once it clears." : "."}
        </p>

        <div className="mt-6">
          <Link
            href={`/r/${slug}`}
            className="text-sm font-medium underline-offset-2 hover:underline"
            style={{ color: primaryColor }}
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}
