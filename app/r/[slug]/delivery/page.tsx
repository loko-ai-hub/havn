"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import StepDeliveryOptions from "@/components/requester/StepDeliveryOptions";
import type { RequesterType } from "@/lib/portal-data";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterDeliveryPage() {
  const portalOrg = usePortalOrg();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [requesterType] = useState<RequesterType>("homeowner");

  return (
    <StepDeliveryOptions
      slug={slug}
      requesterType={requesterType}
      primaryColor={primaryColor}
    />
  );
}
