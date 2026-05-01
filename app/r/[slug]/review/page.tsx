"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";

import StepReview from "../../../../components/requester/StepReview";
import type { PortalOrder } from "../../../../lib/portal-data";
import {
  usePortalOrg,
  usePortalOrder,
  useRequesterPortalOrg,
} from "../../../../components/requester/RequesterPortalOrgContext";
import { submitOrder } from "./actions";

export default function RequesterReviewPage() {
  const router = useRouter();
  const portalOrg = usePortalOrg();
  const rawOrg = useRequesterPortalOrg();
  const { order } = usePortalOrder();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const realOrder: PortalOrder = {
    requesterType: order.requesterType ?? "homeowner",
    requesterName: order.requesterName,
    requesterEmail: order.requesterEmail,
    requesterPhone: order.requesterPhone,
    brokerageName: order.brokerageName,
    licenseNumber: order.licenseNumber,
    mlsId: order.mlsId,
    companyName: order.companyName,
    nmlsNumber: order.nmlsNumber,
    propertyAddress: order.propertyAddress,
    unitNumber: order.unitNumber,
    city: order.city,
    state: order.state,
    zip: order.zip,
    documentsSelected: order.documentsSelected,
    addOns: order.addOns,
    deliveryType: order.deliveryType,
    closingDate: order.closingDate,
    additionalEmails: order.additionalEmails,
    lenderFormChoice: order.lenderFormChoice,
  };

  const handleSubmit = () => {
    if (!rawOrg) return;
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitOrder({
        slug,
        organizationId: rawOrg.id,
        portalDisplayName: rawOrg.portal_display_name ?? rawOrg.name,
        supportEmail: rawOrg.support_email,
        order: realOrder,
        thirdPartyUpload: order.customFormUpload,
      });
      if ("error" in result) {
        setSubmitError(result.error ?? "Unable to submit your order. Please try again.");
        return;
      }
      const firstId = result.insertedIds?.[0];
      if (!firstId) {
        setSubmitError("Unable to start payment. Please try again.");
        return;
      }
      router.push(`/r/${slug}/payment?orderId=${encodeURIComponent(firstId)}`);
    });
  };

  return (
    <div data-primary-color={primaryColor}>
      <StepReview
        slug={slug}
        order={realOrder}
        primaryColor={primaryColor}
        isSubmitting={isPending}
        submitError={submitError}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
