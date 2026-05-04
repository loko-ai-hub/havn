import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Stripe's TS types don't include this exact literal in their union; the cast keeps runtime behavior as specified.
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

// Havn's platform fee in basis points (1 bp = 0.01%). 3500 = 35%.
export const PLATFORM_FEE_BPS = 3500;

export function calcApplicationFee(amountInCents: number): number {
  return Math.round((amountInCents * PLATFORM_FEE_BPS) / 10_000);
}

export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

/**
 * Client-safe mode check — derived from the publishable key, which is the
 * NEXT_PUBLIC_ env var the browser already has. Use this in client
 * components; use isStripeTestMode in server code.
 */
export function isStripeTestModeClient(): boolean {
  return (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").startsWith(
    "pk_test_"
  );
}

/**
 * Pair of column names that hold a connected account's state for the
 * current platform key mode. Reads/writes against organizations should
 * route through this so test and live data don't bleed into each other.
 */
export type ConnectColumnSet = {
  accountId: "stripe_account_id" | "stripe_test_account_id";
  onboardingComplete:
    | "stripe_onboarding_complete"
    | "stripe_test_onboarding_complete";
  chargesEnabled:
    | "stripe_charges_enabled"
    | "stripe_test_charges_enabled";
  payoutsEnabled:
    | "stripe_payouts_enabled"
    | "stripe_test_payouts_enabled";
  requirementsCurrentlyDue:
    | "stripe_requirements_currently_due"
    | "stripe_test_requirements_currently_due";
};

const LIVE_CONNECT_COLUMNS: ConnectColumnSet = {
  accountId: "stripe_account_id",
  onboardingComplete: "stripe_onboarding_complete",
  chargesEnabled: "stripe_charges_enabled",
  payoutsEnabled: "stripe_payouts_enabled",
  requirementsCurrentlyDue: "stripe_requirements_currently_due",
};

const TEST_CONNECT_COLUMNS: ConnectColumnSet = {
  accountId: "stripe_test_account_id",
  onboardingComplete: "stripe_test_onboarding_complete",
  chargesEnabled: "stripe_test_charges_enabled",
  payoutsEnabled: "stripe_test_payouts_enabled",
  requirementsCurrentlyDue: "stripe_test_requirements_currently_due",
};

export function activeConnectColumns(): ConnectColumnSet {
  return isStripeTestMode() ? TEST_CONNECT_COLUMNS : LIVE_CONNECT_COLUMNS;
}

/**
 * Comma-joined list of every connect column (both modes) — for use in
 * a single Supabase select that hydrates both sides at once.
 */
export const ALL_CONNECT_COLUMNS = [
  LIVE_CONNECT_COLUMNS.accountId,
  LIVE_CONNECT_COLUMNS.onboardingComplete,
  LIVE_CONNECT_COLUMNS.chargesEnabled,
  LIVE_CONNECT_COLUMNS.payoutsEnabled,
  LIVE_CONNECT_COLUMNS.requirementsCurrentlyDue,
  TEST_CONNECT_COLUMNS.accountId,
  TEST_CONNECT_COLUMNS.onboardingComplete,
  TEST_CONNECT_COLUMNS.chargesEnabled,
  TEST_CONNECT_COLUMNS.payoutsEnabled,
  TEST_CONNECT_COLUMNS.requirementsCurrentlyDue,
].join(",");

export type ConnectAccountState = {
  accountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
};

type RawOrgConnectColumns = Partial<
  Record<ConnectColumnSet[keyof ConnectColumnSet], unknown>
>;

/**
 * Read the connected-account state for whichever mode the platform is
 * currently in. Pass the org row produced by selecting `ALL_CONNECT_COLUMNS`.
 */
export function getActiveConnectAccount(
  org: RawOrgConnectColumns
): ConnectAccountState {
  const cols = activeConnectColumns();
  return {
    accountId: (org[cols.accountId] as string | null) ?? null,
    onboardingComplete: Boolean(org[cols.onboardingComplete]),
    chargesEnabled: Boolean(org[cols.chargesEnabled]),
    payoutsEnabled: Boolean(org[cols.payoutsEnabled]),
    requirementsCurrentlyDue:
      (org[cols.requirementsCurrentlyDue] as string[] | null) ?? [],
  };
}
