"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDashboardOrg } from "../../_lib/require-dashboard-org";

export async function upsertCommunityContact(
  communityId: string,
  contactType: "insurance_agent" | "management_company",
  data: {
    name: string | null;
    role: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  }
) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  // Verify the community belongs to this org
  const { data: community, error: commErr } = await admin
    .from("communities")
    .select("id")
    .eq("id", communityId)
    .eq("organization_id", organizationId)
    .single();

  if (commErr || !community) return { error: "Community not found." };

  const { error } = await admin
    .from("community_contacts")
    .upsert(
      {
        community_id: communityId,
        contact_type: contactType,
        name: data.name,
        role: data.role,
        address: data.address,
        phone: data.phone,
        email: data.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "community_id,contact_type" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}
