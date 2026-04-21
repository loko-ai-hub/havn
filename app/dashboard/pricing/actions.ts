"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "../../../lib/supabase/admin";
import { requireDashboardOrg } from "../_lib/require-dashboard-org";
import { DEFAULT_FEES, PRICING_DOC_TYPE_KEYS } from "./pricing-constants";

export type FeeSaveRow = {
  master_type_key: string;
  base_fee: number;
  rush_same_day_fee: number | null;
  rush_next_day_fee: number | null;
  rush_3day_fee: number | null;
  standard_turnaround_days: number;
};

export type FeeLoadResult = {
  fees: FeeSaveRow[] | null;
  configuredStates: string[];
  orgPrimaryState: string;
};

export async function loadFees(state: string): Promise<FeeLoadResult | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  // Run all three queries; fees query is non-fatal (column may not exist yet)
  const [orgRes, communitiesRes, allFeesRes] = await Promise.all([
    admin.from("organizations").select("state").eq("id", organizationId).single(),
    admin.from("communities").select("state").eq("organization_id", organizationId).eq("status", "active"),
    admin
      .from("document_request_fees")
      .select("master_type_key, state, base_fee, rush_same_day_fee, rush_next_day_fee, rush_3day_fee, standard_turnaround_days")
      .eq("organization_id", organizationId)
      .in("master_type_key", PRICING_DOC_TYPE_KEYS)
      .then((r) => r), // always resolves, error handled below
  ]);

  if (communitiesRes.error) {
    console.error("[loadFees] communities query failed:", communitiesRes.error.message);
  }
  if (allFeesRes.error) {
    console.error("[loadFees] fees query failed:", allFeesRes.error.message);
  }

  const orgPrimaryState = typeof orgRes.data?.state === "string" ? orgRes.data.state.trim().toUpperCase() : "";

  // Build available states: communities are the source of truth; fees + org state fill in extras
  const stateSet = new Set<string>();
  if (orgPrimaryState) stateSet.add(orgPrimaryState);
  for (const row of communitiesRes.data ?? []) {
    if (typeof row.state === "string" && row.state.trim()) stateSet.add(row.state.trim().toUpperCase());
  }
  for (const row of allFeesRes.data ?? []) {
    if (typeof row.state === "string" && row.state.trim()) stateSet.add(row.state.trim().toUpperCase());
  }
  const configuredStates = [...stateSet].sort();

  // Empty state param = initial load, just return the state list
  if (!state) {
    return { fees: null, configuredStates, orgPrimaryState };
  }

  // If fees query failed, treat as no fees configured for this state
  const feeRows = allFeesRes.data ?? [];
  const stateRows = feeRows.filter(
    (r) => (r.state ?? "").trim().toUpperCase() === state.trim().toUpperCase()
  );

  if (stateRows.length === 0) {
    return { fees: null, configuredStates, orgPrimaryState };
  }

  const fees: FeeSaveRow[] = stateRows.map((r) => ({
    master_type_key: r.master_type_key as string,
    base_fee: Number(r.base_fee ?? 0),
    rush_same_day_fee: r.rush_same_day_fee as number | null,
    rush_next_day_fee: r.rush_next_day_fee as number | null,
    rush_3day_fee: r.rush_3day_fee as number | null,
    standard_turnaround_days: Number(r.standard_turnaround_days ?? 10),
  }));

  return { fees, configuredStates, orgPrimaryState };
}

export async function saveFees(fees: FeeSaveRow[], state: string) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  // Delete legacy NULL-state rows (from before multi-state support) and
  // current state-specific rows so we can re-insert cleanly.
  const [nullDel, stateDel] = await Promise.all([
    admin.from("document_request_fees")
      .delete()
      .eq("organization_id", organizationId)
      .is("state", null)
      .in("master_type_key", PRICING_DOC_TYPE_KEYS),
    admin.from("document_request_fees")
      .delete()
      .eq("organization_id", organizationId)
      .eq("state", state.toUpperCase())
      .in("master_type_key", PRICING_DOC_TYPE_KEYS),
  ]);

  if (nullDel.error) console.error("[saveFees] null-state delete:", nullDel.error.message);
  if (stateDel.error) return { error: stateDel.error.message };

  const insertRows = fees.map((f) => ({
    organization_id: organizationId,
    master_type_key: f.master_type_key,
    state: state.toUpperCase(),
    base_fee: f.base_fee,
    rush_same_day_fee: f.rush_same_day_fee,
    rush_next_day_fee: f.rush_next_day_fee,
    rush_3day_fee: f.rush_3day_fee,
    standard_turnaround_days: f.standard_turnaround_days,
  }));

  const { error: insError } = await admin.from("document_request_fees").insert(insertRows);
  if (insError) return { error: insError.message };

  revalidatePath("/dashboard/pricing");
  return { ok: true };
}

export async function configureDefaultFees(state: string) {
  return saveFees(DEFAULT_FEES, state);
}
