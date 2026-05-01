"use client";

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { createStripeConnectLink } from "@/app/dashboard/settings/stripe/actions";

// Friendly copy keyed off Stripe's `requirements.currently_due` field codes.
// Falls back to a generic message when the field isn't in the map.
const REQUIREMENT_COPY: Record<string, string> = {
  external_account: "connect a bank account",
  "individual.id_number": "verify your SSN",
  "individual.verification.document": "upload an ID document",
  "individual.address.line1": "add your address",
  "company.tax_id": "add your EIN / tax ID",
  "company.verification.document": "upload a business verification document",
  "company.address.line1": "add your business address",
  "business_profile.url": "add your business website",
  tos_acceptance: "accept the Stripe terms of service",
};

function summarizeRequirements(requirementsDue: string[]): string {
  if (requirementsDue.length === 0) {
    return "finish a few details";
  }
  // Prefer the first known requirement; if more than one, hint at it.
  const first = requirementsDue.find((r) => REQUIREMENT_COPY[r]) ?? requirementsDue[0];
  const friendly = REQUIREMENT_COPY[first] ?? "finish a few details";
  if (requirementsDue.length > 1) {
    return `${friendly} (and ${requirementsDue.length - 1} more)`;
  }
  return friendly;
}

export default function PayoutBanner({
  orgId,
  requirementsDue,
}: {
  orgId: string;
  requirementsDue: string[];
}) {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  const summary = summarizeRequirements(requirementsDue);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await createStripeConnectLink(orgId, "/dashboard");
      if ("error" in result) {
        toast.error(result.error);
        setLoading(false);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
      setLoading(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open Stripe.");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-foreground">
          Payments are live on your portal, but payouts are on hold until you {summary}.{" "}
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={loading}
            className="inline-flex items-center gap-1 font-medium text-destructive transition-colors hover:text-destructive/80 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Opening Stripe…
              </>
            ) : (
              <>Connect now →</>
            )}
          </button>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}
