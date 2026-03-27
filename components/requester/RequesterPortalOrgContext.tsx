"use client";

import { createContext, useContext } from "react";

export type OrgPortalData = {
  id: string;
  name: string;
  portal_slug: string;
  brand_color: string | null;
  logo_url: string | null;
  portal_tagline: string | null;
  portal_display_name: string | null;
  is_active: boolean | null;
};

const RequesterPortalOrgContext = createContext<OrgPortalData | null>(null);

export function RequesterPortalOrgProvider({
  org,
  children,
}: {
  org: OrgPortalData;
  children: React.ReactNode;
}) {
  return (
    <RequesterPortalOrgContext.Provider value={org}>
      {children}
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
