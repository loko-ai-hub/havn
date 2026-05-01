"use client";

import { Check, CircleDashed, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Step = {
  label: string;
  complete: boolean;
  hint?: string;
};

const REQUIREMENT_HINT: Record<string, string> = {
  external_account: "Add a bank account",
  "individual.id_number": "Verify your SSN",
  "individual.verification.document": "Upload an ID document",
  "individual.address.line1": "Add your address",
  "company.tax_id": "Add your EIN",
  "company.verification.document": "Upload a business verification document",
  "company.address.line1": "Add your business address",
  "business_profile.url": "Add your business website",
  tos_acceptance: "Accept the Stripe terms of service",
};

function StepRow({ label, complete, hint }: Step) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div className="mt-0.5 shrink-0">
        {complete ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-havn-success text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        ) : (
          <CircleDashed className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && !complete && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      <span
        className={
          complete
            ? "shrink-0 text-xs font-semibold uppercase tracking-wide text-havn-success"
            : "shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        }
      >
        {complete ? "Complete" : "Not complete"}
      </span>
    </div>
  );
}

export default function PaymentsSetupChecklist({
  stripeAccountId,
  stripeComplete,
  stripeChargesEnabled,
  stripePayoutsEnabled,
  stripeBankLast4,
  stripeRequirementsDue,
  stripeConnectLoading,
  disabled,
  canManageStripe,
  onConnect,
  onOpenStripeDashboard,
}: {
  stripeAccountId: string | null;
  stripeComplete: boolean | null;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
  stripeBankLast4: string | null;
  stripeRequirementsDue: string[];
  stripeConnectLoading: boolean;
  disabled: boolean;
  canManageStripe: boolean;
  onConnect: () => void;
  onOpenStripeDashboard: () => void;
}) {
  const accountCreated = Boolean(stripeAccountId);
  const detailsSubmitted = stripeComplete === true;
  const chargesEnabled = stripeChargesEnabled === true;
  const payoutsEnabled = stripePayoutsEnabled === true;
  const bankOnFile = Boolean(stripeBankLast4);

  const steps: Step[] = [
    {
      label: "Stripe account created",
      complete: accountCreated,
      hint: "Click Connect Stripe below to start.",
    },
    {
      label: "Identity & business details submitted",
      complete: detailsSubmitted,
      hint: "Finish the Stripe onboarding flow.",
    },
    {
      label: "Charges enabled",
      complete: chargesEnabled,
      hint: "Stripe needs to verify your account before you can accept payments.",
    },
    {
      label: "Bank account on file",
      complete: bankOnFile,
      hint: "Add a bank account to receive payouts.",
    },
    {
      label: "Payouts enabled",
      complete: payoutsEnabled,
      hint: stripeRequirementsDue.length
        ? `Stripe still needs: ${stripeRequirementsDue
            .map((r) => REQUIREMENT_HINT[r] ?? r)
            .join(", ")}`
        : "Stripe will enable payouts once verification is complete.",
    },
  ];

  const allComplete = steps.every((s) => s.complete);
  const inProgress = accountCreated && !allComplete;

  return (
    <div className="space-y-4">
      {!accountCreated ? (
        <p className="text-sm text-muted-foreground">
          Connect Stripe to start accepting payments and receive payouts from completed
          document orders.
        </p>
      ) : allComplete ? (
        <div className="rounded-lg border border-havn-success/40 bg-havn-success/15 px-4 py-3 text-sm text-foreground">
          <p className="font-semibold text-emerald-950 dark:text-emerald-100">
            You&rsquo;re all set
          </p>
          <p className="mt-1 text-muted-foreground">
            {stripeBankLast4
              ? `Payouts go to your bank account ending in ${stripeBankLast4}.`
              : "Your payout account is linked with Stripe."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Finish the steps below to start accepting payments and receiving payouts.
        </p>
      )}

      <div className="space-y-2">
        {steps.map((s) => (
          <StepRow key={s.label} {...s} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!allComplete && (
          <Button
            type="button"
            disabled={stripeConnectLoading || disabled}
            onClick={onConnect}
          >
            {stripeConnectLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening Stripe…
              </>
            ) : !accountCreated ? (
              "Connect Stripe"
            ) : inProgress ? (
              "Continue Stripe setup"
            ) : (
              "Open Stripe"
            )}
          </Button>
        )}

        {accountCreated && canManageStripe && (
          <button
            type="button"
            onClick={onOpenStripeDashboard}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-2 transition-colors hover:underline"
          >
            View your Stripe account configuration
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
