import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import DashboardSidebar from "./dashboard-sidebar";
import { requireDashboardOrg } from "./_lib/require-dashboard-org";
import { getImpersonationState } from "../god-mode/actions";
import { GOD_MODE_EMAILS } from "../god-mode/constants";
import ImpersonationBanner from "./impersonation-banner";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { email, userName, userRole, portalSlug } = await requireDashboardOrg();
  const { impersonating, orgName } = await getImpersonationState();

  // God-mode users go to /god-mode unless they're impersonating
  if (
    GOD_MODE_EMAILS.includes(email.trim().toLowerCase()) &&
    !impersonating
  ) {
    redirect("/god-mode");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {impersonating && <ImpersonationBanner orgName={orgName} />}
      <DashboardSidebar email={email} userName={userName} userRole={userRole} portalSlug={portalSlug} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <main className="mx-auto max-w-6xl px-6 py-8">
          {impersonating && <div className="h-10" />}
          {children}
        </main>
      </div>
    </div>
  );
}
