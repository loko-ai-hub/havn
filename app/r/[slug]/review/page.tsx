"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import StepReview from "@/components/requester/StepReview";
import type { PortalOrder } from "@/lib/portal-data";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterReviewPage() {
  const portalOrg = usePortalOrg();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const mockOrder = useMemo<PortalOrder>(
    () => ({
      requesterType: "homeowner",
      requesterName: "",
      requesterEmail: "",
      requesterPhone: "",
      brokerageName: "",
      licenseNumber: "",
      mlsId: "",
      companyName: "",
      nmlsNumber: "",
      propertyAddress: "",
      unitNumber: "",
      city: "",
      state: "",
      zip: "",
      documentsSelected: [],
      addOns: [],
      deliveryType: "standard",
      closingDate: "",
      additionalEmails: [],
      lenderFormChoice: "",
    }),
    []
  );
  return (
    <div data-primary-color={primaryColor}>
      <StepReview slug={slug} order={mockOrder} />
    </div>
  );
}
