"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { US_STATES } from "@/lib/us-states";

import { IMPERSONATE_COOKIE, IMPERSONATE_NAME_COOKIE } from "./constants";

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

/* ── Customers ────────────────────────────────────────────────────────── */

export type CustomerRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  account_type: string | null;
  support_email: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  is_active: boolean | null;
  owner_email: string | null;
  community_count: number;
  configured_states: number;
};

export async function loadCustomers(): Promise<CustomerRow[] | { error: string }> {
  const admin = createAdminClient();

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, city, state, account_type, support_email, stripe_account_id, stripe_onboarding_complete, is_active")
    .order("name");

  if (error) return { error: error.message };

  const orgIds = (orgs ?? []).map((o) => o.id as string);
  if (orgIds.length === 0) return [];

  // Parallel: owners, community counts, configured state counts
  const [ownersRes, communitiesRes, feesRes] = await Promise.all([
    admin
      .from("profiles")
      .select("organization_id, id, role")
      .in("organization_id", orgIds)
      .eq("role", "owner"),
    admin
      .from("communities")
      .select("organization_id")
      .in("organization_id", orgIds)
      .eq("status", "active"),
    admin
      .from("document_request_fees")
      .select("organization_id, state")
      .in("organization_id", orgIds),
  ]);

  // Owner emails
  const ownerMap = new Map<string, string>();
  if (ownersRes.data) {
    const userResults = await Promise.all(
      ownersRes.data.map((p) => admin.auth.admin.getUserById(p.id as string))
    );
    for (let i = 0; i < ownersRes.data.length; i++) {
      const u = userResults[i];
      if (!u.error && u.data.user) {
        ownerMap.set(ownersRes.data[i].organization_id as string, u.data.user.email ?? "");
      }
    }
  }

  // Community counts
  const communityCountMap = new Map<string, number>();
  for (const row of communitiesRes.data ?? []) {
    const oid = row.organization_id as string;
    communityCountMap.set(oid, (communityCountMap.get(oid) ?? 0) + 1);
  }

  // Configured states count (distinct states per org from fees)
  const stateSetMap = new Map<string, Set<string>>();
  for (const row of feesRes.data ?? []) {
    const oid = row.organization_id as string;
    const st = row.state as string | null;
    if (!st) continue;
    if (!stateSetMap.has(oid)) stateSetMap.set(oid, new Set());
    stateSetMap.get(oid)!.add(st.toUpperCase());
  }

  return (orgs ?? []).map((o) => ({
    id: o.id as string,
    name: (o.name as string) ?? "Unnamed",
    city: o.city as string | null,
    state: o.state as string | null,
    account_type: o.account_type as string | null,
    support_email: o.support_email as string | null,
    stripe_account_id: o.stripe_account_id as string | null,
    stripe_onboarding_complete: o.stripe_onboarding_complete as boolean | null,
    is_active: o.is_active as boolean | null,
    owner_email: ownerMap.get(o.id as string) ?? null,
    community_count: communityCountMap.get(o.id as string) ?? 0,
    configured_states: stateSetMap.get(o.id as string)?.size ?? 0,
  }));
}

/* ── Block organization ───────────────────────────────────────────────── */

export async function blockOrganization(
  orgId: string
): Promise<{ ok: true; blockedEmails: string[] } | { error: string }> {
  const admin = createAdminClient();

  // 1. Deactivate the org
  const { error: deactivateError } = await admin
    .from("organizations")
    .update({ is_active: false })
    .eq("id", orgId);

  if (deactivateError) return { error: deactivateError.message };

  // 2. Collect all user emails associated with this org
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId);

  const blockedEmails: string[] = [];
  if (profiles && profiles.length > 0) {
    const userResults = await Promise.all(
      profiles.map((p) => admin.auth.admin.getUserById(p.id as string))
    );
    for (const u of userResults) {
      if (!u.error && u.data.user?.email) {
        blockedEmails.push(u.data.user.email.toLowerCase());
      }
    }
  }

  // Also block the org support email if present
  const { data: org } = await admin
    .from("organizations")
    .select("support_email")
    .eq("id", orgId)
    .single();

  if (org?.support_email) {
    const se = (org.support_email as string).toLowerCase();
    if (!blockedEmails.includes(se)) blockedEmails.push(se);
  }

  // 3. Insert blocked emails
  if (blockedEmails.length > 0) {
    const rows = blockedEmails.map((email) => ({
      email,
      organization_id: orgId,
      reason: "Organization blocked by platform admin",
    }));
    const { error: blockError } = await admin
      .from("blocked_emails")
      .upsert(rows, { onConflict: "email" });

    if (blockError) {
      console.error("[blockOrganization] blocked_emails insert:", blockError.message);
    }
  }

  // 4. Disable auth for each user (ban them)
  if (profiles && profiles.length > 0) {
    await Promise.all(
      profiles.map((p) =>
        admin.auth.admin.updateUserById(p.id as string, { ban_duration: "876000h" })
      )
    );
  }

  return { ok: true, blockedEmails };
}

export async function unblockOrganization(
  orgId: string
): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient();

  // 1. Reactivate the org
  const { error: activateError } = await admin
    .from("organizations")
    .update({ is_active: true })
    .eq("id", orgId);

  if (activateError) return { error: activateError.message };

  // 2. Remove blocked emails for this org
  await admin
    .from("blocked_emails")
    .delete()
    .eq("organization_id", orgId);

  // 3. Unban all users
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId);

  if (profiles && profiles.length > 0) {
    await Promise.all(
      profiles.map((p) =>
        admin.auth.admin.updateUserById(p.id as string, { ban_duration: "none" })
      )
    );
  }

  return { ok: true };
}

/* ── Impersonation ────────────────────────────────────────────────────── */

export async function startImpersonation(
  orgId: string,
  orgName: string
): Promise<{ ok: true } | { error: string }> {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE, orgId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 4, // 4 hours
  });
  cookieStore.set(IMPERSONATE_NAME_COOKIE, orgName, {
    path: "/",
    httpOnly: false, // readable by client for banner
    sameSite: "lax",
    maxAge: 60 * 60 * 4,
  });
  return { ok: true };
}

export async function stopImpersonation(): Promise<{ ok: true }> {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_COOKIE);
  cookieStore.delete(IMPERSONATE_NAME_COOKIE);
  return { ok: true };
}

export async function getImpersonationState(): Promise<{
  impersonating: boolean;
  orgId: string | null;
  orgName: string | null;
}> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null;
  const orgName = cookieStore.get(IMPERSONATE_NAME_COOKIE)?.value ?? null;
  return { impersonating: !!orgId, orgId, orgName };
}
