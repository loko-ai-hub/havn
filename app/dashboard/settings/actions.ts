"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "../../../lib/supabase/admin";

import { requireDashboardOrg } from "../_lib/require-dashboard-org";

export async function updatePortalSettings(
  orgId: string,
  fields: { brand_color: string; portal_tagline: string }
) {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) {
    return { error: "You cannot update this organization." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      brand_color: fields.brand_color,
      portal_tagline: fields.portal_tagline,
    })
    .eq("id", orgId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true };
}
