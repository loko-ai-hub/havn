import type { ReactNode } from "react";

import DashboardSidebar from "./dashboard-sidebar";
import { requireDashboardOrg } from "./_lib/require-dashboard-org";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { email } = await requireDashboardOrg();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar email={email} />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
