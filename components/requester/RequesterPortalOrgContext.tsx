"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { RequesterType } from "@/lib/portal-data";

export type OrgPortalData = {
  id: string;
  name: string;
  portal_slug: string;
  brand_color: string | null;
  logo_url: string | null;
  portal_tagline: string | null;
  portal_display_name: string | null;
  support_email: string | null;
  is_active: boolean | null;
};

const RequesterPortalOrgContext = createContext<OrgPortalData | null>(null);
const RequesterPortalOrderContext = createContext<{
  order: PortalOrderState;
  updateOrder: (fields: Partial<PortalOrderState>) => void;
  updateEmails: (emails: string[]) => void;
} | null>(null);

export interface PortalOrderState {
  requesterType: RequesterType | null;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  brokerageName: string;
  licenseNumber: string;
  mlsId: string;
  companyName: string;
  nmlsNumber: string;
  propertyAddress: string;
  unitNumber: string;
  city: string;
  state: string;
  zip: string;
  documentsSelected: string[];
  addOns: string[];
  deliveryType: string;
  closingDate: string;
  additionalEmails: string[];
  lenderFormChoice: string;
}

const DEFAULT_ORDER_STATE: PortalOrderState = {
  requesterType: null,
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
  documentsSelected: ["resale_cert"],
  addOns: [],
  deliveryType: "standard",
  closingDate: "",
  additionalEmails: [],
  lenderFormChoice: "",
};

export function RequesterPortalOrgProvider({
  org,
  children,
}: {
  org: OrgPortalData;
  children: React.ReactNode;
}) {
  const [order, setOrder] = useState<PortalOrderState>(DEFAULT_ORDER_STATE);
  const value = useMemo(
    () => ({
      order,
      updateOrder: (fields: Partial<PortalOrderState>) =>
        setOrder((prev) => ({ ...prev, ...fields })),
      updateEmails: (emails: string[]) =>
        setOrder((prev) => ({ ...prev, additionalEmails: emails })),
    }),
    [order]
  );

  return (
    <RequesterPortalOrgContext.Provider value={org}>
      <RequesterPortalOrderContext.Provider value={value}>
        {children}
      </RequesterPortalOrderContext.Provider>
    </RequesterPortalOrgContext.Provider>
  );
}

export function useRequesterPortalOrg() {
  return useContext(RequesterPortalOrgContext);
}

export function usePortalOrg() {
  const org = useContext(RequesterPortalOrgContext);
  if (!org) return null;
  return {
    name: org.name,
    brandColor: org.brand_color ?? "#1B2B4B",
    logoUrl: org.logo_url,
    portalTagline: org.portal_tagline,
  };
}

export function usePortalOrder() {
  const ctx = useContext(RequesterPortalOrderContext);
  if (!ctx) {
    throw new Error("usePortalOrder must be used within RequesterPortalOrgProvider");
  }
  return ctx;
}
