"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "../../../lib/supabase/admin";
import { requireDashboardOrg } from "../_lib/require-dashboard-org";

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

const PRICING_DOC_TYPES = [
  "resale_certificate",
  "certificate_update",
  "lender_questionnaire",
  "demand_letter",
] as const;

export const DEFAULT_FEES: FeeSaveRow[] = [
  { master_type_key: "resale_certificate",   base_fee: 250, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "certificate_update",   base_fee: 75,  rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "lender_questionnaire", base_fee: 150, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "demand_letter",        base_fee: 100, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
];

export async function loadFees(state: string): Promise<FeeLoadResult | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const [orgRes, allFeesRes, communitiesRes] = await Promise.all([
    admin.from("organizations").select("state").eq("id", organizationId).single(),
    admin
      .from("document_request_fees")
      .select("master_type_key, state, base_fee, rush_same_day_fee, rush_next_day_fee, rush_3day_fee, standard_turnaround_days")
      .eq("organization_id", organizationId)
      .in("master_type_key", [...PRICING_DOC_TYPES]),
    admin
      .from("communities")
      .select("state")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  if (allFeesRes.error) return { error: allFeesRes.error.message };

  const orgPrimaryState = typeof orgRes.data?.state === "string" ? orgRes.data.state.toUpperCase() : "";

  // Build available states from: communities + existing fee rows + org primary state
  const stateSet = new Set<string>();
  if (orgPrimaryState) stateSet.add(orgPrimaryState);
  for (const row of communitiesRes.data ?? []) {
    if (typeof row.state === "string" && row.state.trim()) stateSet.add(row.state.trim().toUpperCase());
  }
  for (const row of allFeesRes.data ?? []) {
    if (typeof row.state === "string" && row.state.trim()) stateSet.add(row.state.trim().toUpperCase());
  }
  const configuredStates = [...stateSet].sort();

  // Filter fees for the requested state (empty string = just return state list)
  if (!state) {
    return { fees: null, configuredStates, orgPrimaryState };
  }

  const stateRows = (allFeesRes.data ?? []).filter(
    (r) => (r.state ?? "").toUpperCase() === state.toUpperCase()
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

  const { error: delError } = await admin
    .from("document_request_fees")
    .delete()
    .eq("organization_id", organizationId)
    .eq("state", state.toUpperCase())
    .in("master_type_key", [...PRICING_DOC_TYPES]);

  if (delError) return { error: delError.message };

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
