"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Briefcase, Building2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { REQUESTER_TYPES, type RequesterType } from "@/lib/portal-data";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

const ICONS: Record<RequesterType, typeof User> = {
  homeowner: User,
  buyer_agent: Briefcase,
  lender_title: Building2,
};

export default function RequesterRolePage() {
  const portalOrg = usePortalOrg();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const [selected, setSelected] = useState<RequesterType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roleCards = useMemo(() => REQUESTER_TYPES, []);

  const handleContinue = () => {
    if (!selected) {
      setError("Please select your role to continue.");
      return;
    }
    setError(null);
    router.push(`/r/${slug}/info`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Who are you?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Select the option that best describes your role in this transaction.
      </p>

      <div className="mt-8 space-y-4">
        {roleCards.map((role) => {
          const Icon = ICONS[role.value];
          const isSelected = selected === role.value;
          return (
            <button
              key={role.value}
              type="button"
              onClick={() => {
                setSelected(role.value);
                if (error) setError(null);
              }}
              className={[
                "w-full rounded-xl border-2 p-5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-havn-navy"
                  : "border-border bg-card hover:border-havn-navy/50 hover:bg-havn-surface/35",
              ].join(" ")}
              style={isSelected ? { backgroundColor: `${primaryColor}25` } : undefined}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-havn-surface text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{role.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8">
        <Button
          type="button"
          onClick={handleContinue}
          className="h-11 min-w-32 text-white hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
