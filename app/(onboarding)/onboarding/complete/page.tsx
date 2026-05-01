"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { createStripeConnectLink } from "@/app/dashboard/settings/stripe/actions";

type OrgSummary = {
  id: string;
  portal_slug: string;
  name: string | null;
  stripe_onboarding_complete: boolean | null;
  logo_url: string | null;
  account_type: string | null;
};

export default function OnboardingCompletePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: companyId, error: companyIdError } = await supabase.rpc("auth_company_id");
      if (companyIdError || !companyId) {
        if (active) setLoading(false);
        return;
      }

      const { data: orgData } = await supabase
        .from("organizations")
        .select("id, portal_slug, name, stripe_onboarding_complete, logo_url, account_type")
        .eq("id", companyId)
        .single();

      if (active) {
        setOrg((orgData as OrgSummary | null) ?? null);
        setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  const portalUrl = org?.portal_slug
    ? `havnhq.com/r/${org.portal_slug}`
    : "havnhq.com/r/your-portal";
  const fullPortalUrl = `https://${portalUrl}`;
  const alreadyConnected = org?.stripe_onboarding_complete === true;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullPortalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail on restricted environments.
    }
  };

  const handleConnectStripe = async () => {
    if (!org?.id) return;
    setConnecting(true);
    try {
      const result = await createStripeConnectLink(org.id, "/dashboard?welcome=1");
      if ("error" in result) {
        toast.error(result.error);
        setConnecting(false);
        return;
      }
      window.location.href = result.url;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start Stripe onboarding."
      );
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-havn-navy">
        <Loader2 className="h-8 w-8 animate-spin text-white/80" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-havn-navy px-6 py-10 text-white">
      <div
        className="mx-auto flex w-full max-w-xl flex-col items-center"
        style={{ animation: "havn-fade-up 360ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        <Image
          src="/havn-lockup-dark.svg"
          alt="Havn"
          width={240}
          height={80}
          priority
          className="h-20 w-auto"
        />

        <div className="mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-havn-cyan">
          <CheckCircle2 className="h-8 w-8 text-havn-navy" strokeWidth={2.5} />
        </div>

        <h1 className="mt-5 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          Your portal is ready
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-base text-white/60">
          {org?.account_type === "self_managed"
            ? "Share this when document requests come in. It's saved in your dashboard too."
            : "Add this link to your website or homeowner portal so residents, agents, and lenders can submit requests."}
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className="group mt-6 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/[0.06] px-6 py-3.5 text-base text-white transition-colors hover:border-white/40 hover:bg-white/10"
          aria-label={copied ? "Copied to clipboard" : "Copy portal URL"}
        >
          <span className="font-medium">{portalUrl}</span>
          {copied ? (
            <span className="inline-flex items-center gap-1 text-havn-cyan">
              <Check className="h-4 w-4" />
              Copied
            </span>
          ) : (
            <Copy className="h-4 w-4 text-white/70 transition-colors group-hover:text-white" />
          )}
        </button>

        <div className="mt-7 w-full rounded-2xl border border-white/15 bg-white/[0.04] p-6 text-center">
          {alreadyConnected ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-havn-cyan" />
                <p className="text-sm font-semibold text-white">Stripe connected</p>
              </div>
              <p className="mt-2 text-sm text-white/65">
                You&rsquo;re all set to accept payments. Head to the dashboard to add
                communities and start fulfilling requests.
              </p>
              <Link
                href="/dashboard?welcome=1"
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-havn-cyan px-5 text-sm font-semibold text-havn-navy transition-colors hover:bg-havn-cyan/90"
              >
                Go to dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">
                Next: connect Stripe to start accepting payments
              </p>
              <p className="mt-2 text-sm text-white/65">
                Havn uses Stripe to process payments from requesters and transfer funds
                to your bank account minus our platform fee. This takes about 3 minutes.
              </p>
              <button
                type="button"
                onClick={() => void handleConnectStripe()}
                disabled={connecting || !org?.id}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-havn-cyan px-5 text-sm font-semibold text-havn-navy transition-colors hover:bg-havn-cyan/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  <>
                    Connect Stripe
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {!alreadyConnected && (
          <Link
            href="/dashboard"
            className="mt-6 text-xs font-medium text-white/50 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
          >
            Take me to the dashboard, I&rsquo;ll do this later
          </Link>
        )}
      </div>
    </div>
  );
}
