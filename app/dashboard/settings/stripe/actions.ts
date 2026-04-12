"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

import { requireDashboardOrg } from "../../_lib/require-dashboard-org";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://havnhq.com";

export async function createStripeConnectLink(
  orgId: string
): Promise<{ url: string } | { error: string }> {
  try {
    const { organizationId } = await requireDashboardOrg();
    if (organizationId !== orgId) {
      return { error: "You cannot manage Stripe for this organization." };
    }

    const supabase = createAdminClient();

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("stripe_account_id, name, support_email")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return { error: "Organization not found" };
    }

    let accountId = org.stripe_account_id as string | null;

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
        .update({ stripe_account_id: accountId })
        .eq("id", orgId);

      if (updateError) {
        return { error: updateError.message };
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl()}/dashboard/settings?stripe=refresh`,
      return_url: `${appUrl()}/dashboard/settings?stripe=success`,
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

  const supabase = createAdminClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("stripe_account_id")
    .eq("id", orgId)
    .single();

  if (error || !org?.stripe_account_id) return;

  const account = await stripe.accounts.retrieve(org.stripe_account_id as string);

  if (account.details_submitted) {
    await supabase
      .from("organizations")
      .update({ stripe_onboarding_complete: true })
      .eq("id", orgId);
  }

  revalidatePath("/dashboard/settings");
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
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("id", orgId)
      .single();

    if (error || !org?.stripe_account_id || !org.stripe_onboarding_complete) {
      return { last4: null };
    }

    const account = await stripe.accounts.retrieve(org.stripe_account_id as string, {
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
