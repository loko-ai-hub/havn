import { createAdminClient } from "@/lib/supabase/admin";

export async function getEnabledStates(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("state_fee_limits")
    .select("state, state_enabled")
    .eq("state_enabled", true);

  const states = new Set<string>();
  for (const row of data ?? []) {
    const st = (row.state as string).toUpperCase();
    if (st !== "_PLACEHOLDER") states.add(st);
  }
  return states;
}
