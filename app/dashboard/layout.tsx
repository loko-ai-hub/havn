import type { ReactNode } from "react";

import DashboardSidebar from "./dashboard-sidebar";
import { requireDashboardOrg } from "./_lib/require-dashboard-org";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { email, userName, userRole, portalSlug } = await requireDashboardOrg();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <DashboardSidebar email={email} userName={userName} userRole={userRole} portalSlug={portalSlug} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
