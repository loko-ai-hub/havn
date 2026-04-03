import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DashboardSession = {
  userId: string;
  email: string;
  organizationId: string;
  userName: string;
  userRole: string;
};

function displayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = user.user_metadata ?? {};
  const full =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  if (full) return full;
  const local = user.email?.split("@")[0];
  return local || "User";
}

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

  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    redirect("/onboarding");
  }

  const userRole =
    typeof profile.role === "string" && profile.role.length > 0
      ? profile.role
      : "member";

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationId: profile.organization_id as string,
    userName: displayNameFromUser(user),
    userRole,
  };
}
