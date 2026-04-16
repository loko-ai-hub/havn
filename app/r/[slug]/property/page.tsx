"use client";

import { useParams } from "next/navigation";

import StepPropertyAddress from "@/components/requester/StepPropertyAddress";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterPropertyPage() {
  const portalOrg = usePortalOrg();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  return (
    <div data-primary-color={primaryColor}>
      <StepPropertyAddress slug={slug} primaryColor={primaryColor} />
    </div>
  );
}
