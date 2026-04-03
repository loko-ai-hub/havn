import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DashboardSession = {
  userId: string;
  email: string;
  organizationId: string;
};

/**
 * Confirms the user is logged in (cookie session), then loads their org via service role.
 * Table reads use admin client per dashboard requirements; auth uses the server SSR client.
 */
export async function requireDashboardOrg(): Promise<DashboardSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (error || !profile?.organization_id) {
    redirect("/onboarding");
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationId: profile.organization_id as string,
  };
}
