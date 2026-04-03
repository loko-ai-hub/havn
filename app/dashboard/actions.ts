"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { requireDashboardOrg } from "./_lib/require-dashboard-org";

export async function fulfillOrder(orderId: string) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("document_orders")
    .select("id, organization_id")
    .eq("id", orderId)
    .single();

  if (fetchError || !row || row.organization_id !== organizationId) {
    return { error: "Order not found or access denied." };
  }

  const { error: updateError } = await admin
    .from("document_orders")
    .update({
      order_status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true };
}
