"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

import { requireDashboardOrg } from "../_lib/require-dashboard-org";

export async function addCommunity(
  orgId: string,
  data: {
    legal_name: string;
    city: string;
    state: string;
    zip: string;
    community_type: string;
    manager_name: string;
    unit_count: number;
  }
) {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) {
    return { error: "You cannot add communities for this organization." };
  }

  const admin = createAdminClient();

  const { error } = await admin.from("communities").insert({
    organization_id: orgId,
    legal_name: data.legal_name,
    city: data.city,
    state: data.state,
    zip: data.zip,
    community_type: data.community_type,
    manager_name: data.manager_name || null,
    unit_count: data.unit_count,
    status: "active",
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/communities");
  return { ok: true };
}

export async function archiveCommunity(id: string, status: "active" | "archived") {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: community, error: commErr } = await admin
    .from("communities")
    .select("id, organization_id")
    .eq("id", id)
    .single();

  if (commErr || !community) {
    return { error: "Community not found." };
  }

  if (community.organization_id !== organizationId) {
    return { error: "You cannot update this community." };
  }

  const { error } = await admin
    .from("communities")
    .update({ status })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/communities");
  return { ok: true };
}

