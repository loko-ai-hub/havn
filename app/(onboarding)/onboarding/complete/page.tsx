"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type OrgSummary = {
  id: string;
  portal_slug: string;
  name: string | null;
  stripe_onboarding_complete: boolean | null;
  logo_url: string | null;
};

export default function OnboardingCompletePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [copied, setCopied] = useState(false);

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
        .select("id, portal_slug, name, stripe_onboarding_complete, logo_url")
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

  const portalUrl = org?.portal_slug ? `havn.com/r/${org.portal_slug}` : "havn.com/r/your-portal";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail on restricted environments.
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1628]">
        <Loader2 className="h-8 w-8 animate-spin text-white/80" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1628] px-6 py-12 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-5xl flex-col items-center justify-center">
        <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-[#D4AF37]">
          <CheckCircle2 className="h-8 w-8 text-[#0B1628]" />
        </div>

        <h1 className="text-center text-5xl font-semibold tracking-tight">You&apos;re live.</h1>
        <p className="mt-3 text-center text-lg text-white/60">Your portal is ready to share.</p>

        <button
          type="button"
          onClick={handleCopy}
          className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm text-white hover:bg-white/15"
        >
          <span className="font-medium">{portalUrl}</span>
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4 text-white/80" />
          )}
        </button>

        <div className="mt-10 grid w-full max-w-4xl gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/15 bg-white/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-yellow-400" />
              <p className="text-sm font-semibold">Connect Stripe</p>
            </div>
            <p className="text-sm text-white/65">Required to process payments</p>
            <button className="mt-5 h-10 rounded-md bg-[#D4AF37] px-4 text-sm font-semibold text-[#0B1628]">
              Connect now
            </button>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/5 p-5">
            <p className="text-sm font-semibold">Add your first community</p>
            <p className="mt-2 text-sm text-white/65">
              So orders can be looked up by address
            </p>
            <button className="mt-5 h-10 rounded-md border border-white/20 px-4 text-sm text-white/70">
              Do this later
            </button>
          </div>

          {!org?.logo_url ? (
            <div className="rounded-xl border border-white/15 bg-white/5 p-5">
              <p className="text-sm font-semibold">Upload your logo</p>
              <p className="mt-2 text-sm text-white/65">
                Appears on your portal and documents
              </p>
              <button className="mt-5 h-10 rounded-md border border-white/20 px-4 text-sm text-white/70">
                Do this later
              </button>
            </div>
          ) : null}
        </div>

        <Link
          href="/dashboard"
          className="mt-12 inline-flex h-11 items-center rounded-md border border-white/70 px-6 text-sm font-medium text-white hover:bg-white/10"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
