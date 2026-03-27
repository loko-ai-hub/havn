"use client";

import { useParams } from "next/navigation";

import StepDeliveryOptions from "@/components/requester/StepDeliveryOptions";
import {
  usePortalOrg,
  usePortalOrder,
} from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterDeliveryPage() {
  const portalOrg = usePortalOrg();
  const { order } = usePortalOrder();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const requesterType = order.requesterType ?? "homeowner";

  return (
    <StepDeliveryOptions
      slug={slug}
      requesterType={requesterType}
      primaryColor={primaryColor}
    />
  );
}
