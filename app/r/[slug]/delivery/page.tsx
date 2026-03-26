"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import StepDeliveryOptions from "@/components/requester/StepDeliveryOptions";
import type { RequesterType } from "@/lib/portal-data";

export default function RequesterDeliveryPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [requesterType] = useState<RequesterType>("homeowner");

  return <StepDeliveryOptions slug={slug} requesterType={requesterType} />;
}
