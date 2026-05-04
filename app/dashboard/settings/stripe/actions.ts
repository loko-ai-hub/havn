"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  stripe,
  activeConnectColumns,
  ALL_CONNECT_COLUMNS,
  getActiveConnectAccount,
} from "@/lib/stripe";

import { requireDashboardOrg } from "../../_lib/require-dashboard-org";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://havnhq.com";

// When called from onboarding, pass returnPath = "/dashboard?welcome=1" so the
// user lands on the dashboard with the celebration confetti. Default return is
// the settings page where the banner toggles to "Connected".
export async function createStripeConnectLink(
  orgId: string,
  returnPath?: string
): Promise<{ url: string } | { error: string }> {
  try {
    const { organizationId } = await requireDashboardOrg();
    if (organizationId !== orgId) {
      return { error: "You cannot manage Stripe for this organization." };
    }

    const cols = activeConnectColumns();
    const supabase = createAdminClient();

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select(`name, support_email, ${cols.accountId}`)
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return { error: "Organization not found" };
    }

    let accountId = (org as Record<string, unknown>)[cols.accountId] as
      | string
      | null;

    // If we have a stored account ID, validate it's reachable on the current
    // Stripe environment. Stale IDs (e.g. test acct stored before flipping to
    // live) trigger "account does not exist on your platform" — wipe and
    // start fresh. Note we only wipe the *active* mode's columns, leaving
    // the other mode's account untouched.
    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId);
      } catch (err) {
        console.warn(
          `createStripeConnectLink: stale or invalid ${cols.accountId}, recreating:`,
          err
        );
        accountId = null;
        await supabase
          .from("organizations")
          .update({
            [cols.accountId]: null,
            [cols.onboardingComplete]: false,
          })
          .eq("id", orgId);
      }
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: { name: (org.name as string) ?? undefined },
        email: (org.support_email as string | null) ?? undefined,
      });
      accountId = account.id;

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ [cols.accountId]: accountId })
        .eq("id", orgId);

      if (updateError) {
        return { error: updateError.message };
      }
    }

    const safeReturn =
      returnPath && returnPath.startsWith("/")
        ? `${appUrl()}${returnPath}`
        : `${appUrl()}/dashboard/settings?stripe=success`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl()}/dashboard/settings?stripe=refresh`,
      return_url: safeReturn,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create Stripe link" };
  }
}

export async function checkStripeOnboardingStatus(orgId: string): Promise<void> {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) {
    return;
  }

  const cols = activeConnectColumns();
  const supabase = createAdminClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select(cols.accountId)
    .eq("id", orgId)
    .single();

  const accountId = (org as Record<string, unknown> | null)?.[cols.accountId] as
    | string
    | null
    | undefined;
  if (error || !accountId) return;

  const account = await stripe.accounts.retrieve(accountId);

  // Pull every signal we care about. Webhook is the primary source of truth,
  // but this on-demand sync covers cases where the webhook fires late or the
  // operator finishes Stripe in another tab and comes back.
  await supabase
    .from("organizations")
    .update({
      [cols.onboardingComplete]: Boolean(account.details_submitted),
      [cols.payoutsEnabled]: Boolean(account.payouts_enabled),
      [cols.chargesEnabled]: Boolean(account.charges_enabled),
      [cols.requirementsCurrentlyDue]:
        account.requirements?.currently_due ?? [],
    })
    .eq("id", orgId);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

// Returns a one-time login link to the Stripe Express dashboard for the
// connected account. Owner-only — non-owners get a clear error. The URL is
// short-lived; we never store it server-side.
export async function createStripeDashboardLoginLink(
  orgId: string
): Promise<{ url: string } | { error: string }> {
  try {
    const { organizationId, userRole } = await requireDashboardOrg();
    if (organizationId !== orgId) {
      return { error: "You cannot manage Stripe for this organization." };
    }
    if (userRole !== "owner") {
      return { error: "Only the organization owner can open the Stripe dashboard." };
    }

    const cols = activeConnectColumns();
    const supabase = createAdminClient();
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select(cols.accountId)
      .eq("id", orgId)
      .single();

    const accountId = (org as Record<string, unknown> | null)?.[cols.accountId] as
      | string
      | null
      | undefined;
    if (orgError || !accountId) {
      return { error: "No connected Stripe account on file for the active mode yet." };
    }

    const link = await stripe.accounts.createLoginLink(accountId);
    return { url: link.url };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not open Stripe dashboard.",
    };
  }
}

export async function getStripeBankLast4(
  orgId: string
): Promise<{ last4: string | null } | { error: string }> {
  try {
    const { organizationId } = await requireDashboardOrg();
    if (organizationId !== orgId) {
      return { error: "Unauthorized" };
    }

    const supabase = createAdminClient();
    const { data: org, error } = await supabase
      .from("organizations")
      .select(ALL_CONNECT_COLUMNS)
      .eq("id", orgId)
      .single();

    if (error || !org) {
      return { last4: null };
    }

    const active = getActiveConnectAccount(org as unknown as Record<string, unknown>);
    if (!active.accountId || !active.onboardingComplete) {
      return { last4: null };
    }

    const account = await stripe.accounts.retrieve(active.accountId, {
      expand: ["external_accounts"],
    });

    const list = account.external_accounts?.data ?? [];
    const bank = list.find((x) => x.object === "bank_account");
    if (bank && bank.object === "bank_account" && "last4" in bank) {
      return { last4: (bank as { last4?: string }).last4 ?? null };
    }

    return { last4: null };
  } catch {
    return { last4: null };
  }
}
