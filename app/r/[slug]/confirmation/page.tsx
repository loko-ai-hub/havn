"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import StepConfirmation from "@/components/requester/StepConfirmation";
import type { PortalOrder } from "@/lib/portal-data";

export default function RequesterConfirmationPage() {
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
    <StepConfirmation slug={slug} order={mockOrder} orderNumber="ORD-00001" />
  );
}
