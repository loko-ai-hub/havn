"use server";

import { revalidatePath } from "next/cache";
import {
  CONTACT_FIELD_KEYS,
  type ContactType,
} from "@/lib/community-contact-mapping";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDashboardOrg } from "../../_lib/require-dashboard-org";

export async function upsertCommunityContact(
  communityId: string,
  contactType: ContactType,
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

  const nowIso = new Date().toISOString();

  // 1. Write the contact-card row.
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
        updated_at: nowIso,
      },
      { onConflict: "community_id,contact_type" }
    );

  if (error) return { error: error.message };

  // 2. Mirror the same values into the merge-tag cache so document
  //    generation can use {{insurance_agent_name}} / {{management_contact_*}}
  //    etc. with `source='manual'` (which wins over OCR-sourced values
  //    on the next OCR pass). Non-empty fields are upserted; cleared
  //    fields delete their cache rows so OCR can refill them later.
  const keys = CONTACT_FIELD_KEYS[contactType];
  const fieldMap: { key: string; value: string | null }[] = [
    { key: keys.name, value: data.name },
    { key: keys.role, value: data.role },
    { key: keys.email, value: data.email },
    { key: keys.phone, value: data.phone },
    ...(keys.address ? [{ key: keys.address, value: data.address }] : []),
  ];

  const toUpsert = fieldMap
    .filter(
      (f): f is { key: string; value: string } =>
        typeof f.value === "string" && f.value.trim().length > 0
    )
    .map((f) => ({
      community_id: communityId,
      document_type: "_shared",
      field_key: f.key,
      field_value: f.value,
      source: "manual" as const,
      updated_at: nowIso,
    }));

  const toDeleteKeys = fieldMap
    .filter((f) => f.value === null || (typeof f.value === "string" && f.value.trim().length === 0))
    .map((f) => f.key);

  if (toUpsert.length > 0) {
    const { error: cacheErr } = await admin
      .from("community_field_cache")
      .upsert(toUpsert, { onConflict: "community_id,document_type,field_key" });
    if (cacheErr) {
      console.warn("[upsertCommunityContact] cache upsert failed:", cacheErr.message);
    }
  }

  if (toDeleteKeys.length > 0) {
    const { error: cacheDelErr } = await admin
      .from("community_field_cache")
      .delete()
      .eq("community_id", communityId)
      .eq("document_type", "_shared")
      .in("field_key", toDeleteKeys);
    if (cacheDelErr) {
      console.warn("[upsertCommunityContact] cache delete failed:", cacheDelErr.message);
    }
  }

  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}
