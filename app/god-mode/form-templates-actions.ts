"use server";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  GOD_MODE_EMAILS,
  IMPERSONATE_COOKIE,
  IMPERSONATE_NAME_COOKIE,
} from "./constants";

async function requireGodMode(): Promise<void> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = (user?.email ?? "").toLowerCase().trim();
  if (!user || !GOD_MODE_EMAILS.includes(email)) {
    throw new Error("Not authorized.");
  }
}

/**
 * Start impersonation of the org that owns a given order. Used by the
 * Form Library Refine button — God-Mode users have no organization of
 * their own, so without setting the impersonation cookie the dashboard
 * pages bounce them to /onboarding.
 */
export async function impersonateForOrder(
  orderId: string
): Promise<{ ok: true } | { error: string }> {
  await requireGodMode();
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("document_orders")
    .select("organization_id")
    .eq("id", orderId)
    .single();
  if (orderErr || !order?.organization_id) {
    return { error: "Order not found." };
  }
  const orgId = order.organization_id as string;

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = (org as { name: string | null } | null)?.name ?? "Org";

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE, orgId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 4,
  });
  cookieStore.set(IMPERSONATE_NAME_COOKIE, orgName, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 4,
  });

  return { ok: true };
}

export type FormVariantRow = {
  /** Composite key — issuer + form_title + content_fingerprint may be empty if Claude didn't tag the form. */
  fingerprint: string | null;
  issuer: string | null;
  formTitle: string | null;
  masterTypeKey: string | null;
  /** Whether a canonical layout has been saved for this variant. */
  templateSaved: boolean;
  /** Number of orders that ingested this variant. */
  orderCount: number;
  /** Most recent ingest of this variant — link target for the editor. */
  latestOrderId: string | null;
  latestIngestAt: string | null;
  /** Telemetry from the latest ingest (which positioner won, field counts). */
  latestTelemetry: Record<string, unknown> | null;
};

/**
 * List every unique vendor form variant Havn has ever ingested, joined
 * with whether a canonical layout has been curated for it. The God Mode
 * form library uses this to triage which forms still need staff
 * attention vs which are already covered by the template cache.
 *
 * Variants are keyed by `(issuer, form_title, content_fingerprint_proxy)`
 * — third_party_templates doesn't store the fingerprint directly today
 * (we compute it in the pipeline), so we group by issuer + form_title
 * here as a serviceable proxy. The vendor_form_templates table joins
 * on the same composite key.
 */
export async function listFormVariants(): Promise<FormVariantRow[]> {
  await requireGodMode();
  const admin = createAdminClient();

  const [tplRes, savedRes] = await Promise.all([
    admin
      .from("third_party_templates")
      .select(
        "order_id, issuer, form_title, document_type, ingest_telemetry, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(500),
    admin
      .from("vendor_form_templates")
      .select(
        "issuer, form_title, content_fingerprint, master_type_key, approved_at"
      ),
  ]);

  const tplRows =
    (tplRes.data as Array<{
      order_id: string;
      issuer: string | null;
      form_title: string | null;
      document_type: string | null;
      ingest_telemetry: Record<string, unknown> | null;
      updated_at: string | null;
    }> | null) ?? [];
  const savedRows =
    (savedRes.data as Array<{
      issuer: string | null;
      form_title: string | null;
      content_fingerprint: string;
      master_type_key: string | null;
      approved_at: string | null;
    }> | null) ?? [];

  const savedKeys = new Set(
    savedRows.map(
      (s) =>
        `${(s.issuer ?? "").trim().toLowerCase()}|${(s.form_title ?? "").trim().toLowerCase()}`
    )
  );

  const grouped = new Map<string, FormVariantRow>();

  for (const r of tplRows) {
    const issuer = (r.issuer ?? "").trim();
    const formTitle = (r.form_title ?? "").trim();
    const key = `${issuer.toLowerCase()}|${formTitle.toLowerCase()}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.orderCount += 1;
      continue;
    }

    grouped.set(key, {
      fingerprint: null,
      issuer: issuer || null,
      formTitle: formTitle || null,
      masterTypeKey: r.document_type,
      templateSaved: savedKeys.has(key),
      orderCount: 1,
      latestOrderId: r.order_id,
      latestIngestAt: r.updated_at,
      latestTelemetry: r.ingest_telemetry,
    });
  }

  // Sort: forms without a saved template first (need staff attention),
  // then by most-recent ingest within each group.
  const out = Array.from(grouped.values());
  out.sort((a, b) => {
    if (a.templateSaved !== b.templateSaved) {
      return a.templateSaved ? 1 : -1;
    }
    const at = a.latestIngestAt ? new Date(a.latestIngestAt).getTime() : 0;
    const bt = b.latestIngestAt ? new Date(b.latestIngestAt).getTime() : 0;
    return bt - at;
  });

  return out;
}
