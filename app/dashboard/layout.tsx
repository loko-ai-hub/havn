import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import DashboardSidebar from "./dashboard-sidebar";
import { requireDashboardOrg } from "./_lib/require-dashboard-org";

const GOD_MODE_EMAILS = ["loren@havnhq.com"];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { email, userName, userRole, portalSlug } = await requireDashboardOrg();

  if (GOD_MODE_EMAILS.includes(email.trim().toLowerCase())) {
    redirect("/god-mode");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <DashboardSidebar email={email} userName={userName} userRole={userRole} portalSlug={portalSlug} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
