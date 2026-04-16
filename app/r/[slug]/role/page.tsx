"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Briefcase, Building2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { REQUESTER_TYPES, type RequesterType } from "@/lib/portal-data";
import {
  usePortalOrg,
  usePortalOrder,
} from "@/components/requester/RequesterPortalOrgContext";

const ICONS: Record<RequesterType, typeof User> = {
  homeowner: User,
  buyer_agent: Briefcase,
  lender_title: Building2,
};

export default function RequesterRolePage() {
  const portalOrg = usePortalOrg();
  const { order, updateOrder } = usePortalOrder();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const [selected, setSelected] = useState<RequesterType | null>(order.requesterType);
  const [hovered, setHovered] = useState<RequesterType | null>(null);
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

  const getCardStyle = (value: RequesterType): React.CSSProperties => {
    const isSelected = selected === value;
    const isHovered = hovered === value;
    if (isSelected) {
      return { borderColor: primaryColor, backgroundColor: `${primaryColor}1A` };
    }
    if (isHovered) {
      return { borderColor: "rgba(26,23,21,0.4)", backgroundColor: "#f4f3f0" };
    }
    return {};
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
                updateOrder({ requesterType: role.value });
                if (error) setError(null);
              }}
              onMouseEnter={() => setHovered(role.value)}
              onMouseLeave={() => setHovered(null)}
              className="w-full rounded-xl border-2 border-border bg-card p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={getCardStyle(role.value)}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-havn-surface text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-foreground">{role.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex justify-end">
        <Button
          type="button"
          onClick={handleContinue}
          className="h-14 min-w-32 px-6 py-4 text-base font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
