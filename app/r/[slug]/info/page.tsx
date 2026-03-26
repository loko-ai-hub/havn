"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import StepYourInfo from "@/components/requester/StepYourInfo";
import type { PortalOrder } from "@/lib/portal-data";

export default function RequesterInfoPage() {
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

  return <StepYourInfo slug={slug} order={mockOrder} />;
}
