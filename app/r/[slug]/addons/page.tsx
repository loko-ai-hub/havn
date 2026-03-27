"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import StepAddons from "@/components/requester/StepAddons";
import { PORTAL_ADDONS, getDocumentFee } from "@/lib/portal-data";
import {
  usePortalOrg,
  usePortalOrder,
} from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterAddonsPage() {
  const portalOrg = usePortalOrg();
  const { order, updateOrder } = usePortalOrder();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [selectedAddons, setSelectedAddons] = useState<string[]>(order.addOns);

  const handleToggle = (id: string) => {
    const next = selectedAddons.includes(id)
      ? selectedAddons.filter((item) => item !== id)
      : [...selectedAddons, id];
    setSelectedAddons(next);
    updateOrder({ addOns: next });
  };
  return (
    <StepAddons
      selected={selectedAddons}
      primaryColor={primaryColor}
      requesterType={order.requesterType ?? "homeowner"}
      onToggle={handleToggle}
      addOnsList={PORTAL_ADDONS}
      documentTotal={getDocumentFee(order.documentsSelected)}
      onBack={() => router.push(`/r/${slug}/documents`)}
      onContinue={() => router.push(`/r/${slug}/delivery`)}
    />
  );
}
