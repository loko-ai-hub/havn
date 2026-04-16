"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import StepYourInfo from "@/components/requester/StepYourInfo";
import type { PortalOrder } from "@/lib/portal-data";
import {
  usePortalOrg,
  usePortalOrder,
} from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterInfoPage() {
  const portalOrg = usePortalOrg();
  const { order } = usePortalOrder();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const portalOrder = useMemo<PortalOrder>(
    () => ({
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
    }),
    [order]
  );

  return (
    <div data-primary-color={primaryColor}>
      <StepYourInfo slug={slug} order={portalOrder} primaryColor={primaryColor} />
    </div>
  );
}
