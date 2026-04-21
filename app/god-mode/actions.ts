"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { US_STATES } from "@/lib/us-states";

/* ── Types ────────────────────────────────────────────────────────────── */

export type StateServiceRow = {
  master_type_key: string;
  formal_name: string;
  pricing_cap: number | null;
  cap_type: "fixed" | "actual";
  rush_cap: number | null;
  no_rush: boolean;
  standard_turnaround: number;
  auto_refund_on_miss: boolean;
  auto_refund_note: string;
  statute: string;
  recommended_default: number | null;
  ai_memory: string;
};

export type StateConfig = {
  state: string;
  stateName: string;
  enabled: boolean;
  notes: string;
  services: StateServiceRow[];
};

/* ── Load ─────────────────────────────────────────────────────────────── */

export async function loadStateConfigs(): Promise<
  StateConfig[] | { error: string }
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("state_fee_limits")
    .select("*")
    .order("state")
    .order("master_type_key");

  if (error) return { error: error.message };

  const stateNameMap = new Map(US_STATES.map((s) => [s.abbr, s.name]));

  const grouped = new Map<string, { enabled: boolean; notes: string; services: StateServiceRow[] }>();
  for (const row of data ?? []) {
    const st = (row.state as string).toUpperCase();
    if (!grouped.has(st)) {
      grouped.set(st, {
        enabled: (row.state_enabled as boolean) ?? true,
        notes: (row.state_notes as string) ?? "",
        services: [],
      });
    }
    grouped.get(st)!.services.push({
      master_type_key: row.master_type_key as string,
      formal_name: (row.formal_name as string) ?? "",
      pricing_cap: row.pricing_cap as number | null,
      cap_type: ((row.cap_type as string) ?? "actual") as "fixed" | "actual",
      rush_cap: row.rush_cap as number | null,
      no_rush: (row.no_rush as boolean) ?? false,
      standard_turnaround: (row.standard_turnaround as number) ?? 5,
      auto_refund_on_miss: (row.auto_refund_on_miss as boolean) ?? false,
      auto_refund_note: (row.auto_refund_note as string) ?? "",
      statute: (row.statute as string) ?? "",
      recommended_default: row.recommended_default as number | null,
      ai_memory: (row.ai_memory as string) ?? "",
    });
  }

  const configs: StateConfig[] = [];
  for (const [st, g] of grouped) {
    configs.push({
      state: st,
      stateName: stateNameMap.get(st) ?? st,
      enabled: g.enabled,
      notes: g.notes,
      services: g.services,
    });
  }

  return configs;
}

/* ── Save ─────────────────────────────────────────────────────────────── */

export async function saveStateConfig(
  state: string,
  enabled: boolean,
  notes: string,
  services: StateServiceRow[]
): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient();
  const st = state.toUpperCase();

  // Delete all existing rows for this state, then re-insert
  const { error: delError } = await admin
    .from("state_fee_limits")
    .delete()
    .eq("state", st);

  if (delError) return { error: delError.message };

  if (services.length === 0) return { ok: true };

  const rows = services.map((svc) => ({
    state: st,
    state_enabled: enabled,
    state_notes: notes,
    master_type_key: svc.master_type_key,
    formal_name: svc.formal_name || null,
    pricing_cap: svc.pricing_cap,
    cap_type: svc.cap_type,
    rush_cap: svc.rush_cap,
    no_rush: svc.no_rush,
    standard_turnaround: svc.standard_turnaround,
    auto_refund_on_miss: svc.auto_refund_on_miss,
    auto_refund_note: svc.auto_refund_note || "",
    statute: svc.statute || "",
    recommended_default: svc.recommended_default,
    ai_memory: svc.ai_memory || "",
    updated_at: new Date().toISOString(),
  }));

  const { error: insError } = await admin.from("state_fee_limits").insert(rows);
  if (insError) return { error: insError.message };

  return { ok: true };
}

/* ── Delete entire state ──────────────────────────────────────────────── */

export async function deleteStateConfig(
  state: string
): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("state_fee_limits")
    .delete()
    .eq("state", state.toUpperCase());

  if (error) return { error: error.message };
  return { ok: true };
}

/* ── Load caps for a single state (used by dashboard pricing page) ──── */

export async function loadStateCaps(
  state: string
): Promise<{
  caps: Record<
    string,
    { pricing_cap: number | null; cap_type: string; statute: string }
  >;
} | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("state_fee_limits")
    .select("master_type_key, pricing_cap, cap_type, statute")
    .eq("state", state.toUpperCase())
    .eq("state_enabled", true);

  if (error) return { error: error.message };

  const caps: Record<
    string,
    { pricing_cap: number | null; cap_type: string; statute: string }
  > = {};
  for (const row of data ?? []) {
    caps[row.master_type_key as string] = {
      pricing_cap: row.pricing_cap as number | null,
      cap_type: (row.cap_type as string) ?? "actual",
      statute: (row.statute as string) ?? "",
    };
  }

  return { caps };
}

/* ── Legal check results (from monthly cron) ──────────────────────────── */

export type LegalCheckItem = {
  type: "current_law" | "recent_change" | "pending_legislation" | "action_needed";
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  statute_reference: string | null;
  effective_date: string | null;
};

export type LegalCheckResult = {
  id: string;
  state: string;
  checked_at: string;
  model_used: string;
  summary: string;
  changes_detected: boolean;
  details: LegalCheckItem[];
};

export async function loadLatestLegalChecks(): Promise<
  Record<string, LegalCheckResult> | { error: string }
> {
  const admin = createAdminClient();

  // For each state, get the most recent check.
  // Supabase doesn't support DISTINCT ON, so fetch recent checks and dedupe.
  const { data, error } = await admin
    .from("state_legal_checks")
    .select("id, state, checked_at, model_used, summary, changes_detected, details")
    .order("checked_at", { ascending: false })
    .limit(200);

  if (error) return { error: error.message };

  const byState: Record<string, LegalCheckResult> = {};
  for (const row of data ?? []) {
    const st = (row.state as string).toUpperCase();
    if (byState[st]) continue; // already have a newer one
    byState[st] = {
      id: row.id as string,
      state: st,
      checked_at: row.checked_at as string,
      model_used: (row.model_used as string) ?? "",
      summary: (row.summary as string) ?? "",
      changes_detected: (row.changes_detected as boolean) ?? false,
      details: (row.details as LegalCheckItem[]) ?? [],
    };
  }

  return byState;
}

export async function runLegalCheckForState(
  state: string
): Promise<{ ok: true } | { error: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/cron/legal-check?state=${state}`, {
      headers: process.env.CRON_SECRET
        ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
        : {},
    });
    if (!res.ok) {
      const body = await res.text();
      return { error: body || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Request failed" };
  }
}
