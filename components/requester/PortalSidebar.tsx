import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";

import type { RequesterType } from "@/lib/portal-data";
import { requesterPortalPath } from "@/lib/requester-flow";

type PortalSidebarProps = {
  slug: string;
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  currentStep: number;
  requesterType?: RequesterType;
};

type SidebarStep = {
  number: number;
  label: string;
  segment: string;
};

function normalizeHex(input: string): string {
  const value = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#1B2B4B";
}

function getTextColor(hex: string): string {
  const c = normalizeHex(hex);
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

function getSteps(): SidebarStep[] {
  return [
    { number: 1, label: "Your Role", segment: "role" },
    { number: 2, label: "Your Information", segment: "info" },
    { number: 3, label: "Property Address", segment: "property" },
    { number: 4, label: "Documents", segment: "documents" },
    { number: 5, label: "Add-Ons", segment: "addons" },
    { number: 6, label: "Delivery & Timing", segment: "delivery" },
    { number: 7, label: "Review & Pay", segment: "review" },
    { number: 8, label: "Payment", segment: "payment" },
    { number: 9, label: "Confirmation", segment: "confirmation" },
  ];
}

export default function PortalSidebar({
  slug,
  companyName,
  logoUrl,
  primaryColor,
  currentStep,
}: PortalSidebarProps) {
  const textColor = getTextColor(primaryColor);
  const steps = getSteps();
  const completedBg = textColor === "#ffffff" ? "bg-white/20" : "bg-black/15";
  const activeBg = textColor === "#ffffff" ? "bg-white text-slate-900" : "bg-slate-900 text-white";
  const mutedText = textColor === "#ffffff" ? "text-white/65" : "text-black/60";
  const borderMuted = textColor === "#ffffff" ? "border-white/35" : "border-black/35";

  return (
    <aside
      className="flex h-screen w-[280px] shrink-0 flex-col p-6"
      style={{ backgroundColor: normalizeHex(primaryColor), color: textColor }}
    >
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-white/15">
          {logoUrl ? (
            <Image src={logoUrl} alt={`${companyName} logo`} width={44} height={44} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-semibold">LOGO</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{companyName}</p>
          <p className={`text-xs ${mutedText}`}>Document Request Portal</p>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step) => {
          const isCompleted = step.number < currentStep;
          const isActive = step.number === currentStep;
          const isFuture = step.number > currentStep;

          const itemContent = (
            <>
              <div
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  isCompleted ? completedBg : "",
                  isActive ? activeBg : "",
                  isFuture ? `border ${borderMuted}` : "",
                ].join(" ")}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.number}
              </div>
              <span className={isFuture ? `text-sm ${mutedText}` : "text-sm font-medium"}>{step.label}</span>
            </>
          );

          if (isCompleted) {
            return (
              <Link
                key={step.number}
                href={requesterPortalPath(slug, step.segment)}
                className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-90"
              >
                {itemContent}
              </Link>
            );
          }

          return (
            <div key={step.number} className="flex items-center gap-3">
              {itemContent}
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        <p className={`text-xs ${mutedText}`}>Powered by Havn</p>
      </div>
    </aside>
  );
}
