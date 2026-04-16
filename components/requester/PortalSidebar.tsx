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
    { number: 1, label: "Role", segment: "role" },
    { number: 2, label: "Your Info", segment: "info" },
    { number: 3, label: "Property", segment: "property" },
    { number: 4, label: "Documents", segment: "documents" },
    { number: 5, label: "Delivery", segment: "delivery" },
    { number: 6, label: "Add-ons", segment: "addons" },
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

          const circleEl = isCompleted ? (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </div>
          ) : (
            <div
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                isActive ? `${borderMuted}` : borderMuted,
                isActive ? "" : `opacity-${isFuture ? "60" : "100"}`,
              ].join(" ")}
            >
              {step.number}
            </div>
          );

          const rowClasses = [
            "flex items-center gap-3 rounded-md border-l-4 py-0.5 pl-1",
            isActive ? "" : "border-transparent",
          ].join(" ");

          const rowStyle = isActive ? { borderLeftColor: textColor } : undefined;

          const labelEl = (
            <span
              className={[
                "text-sm",
                isActive ? "font-semibold" : "",
                isFuture ? mutedText : "",
              ].join(" ")}
            >
              {step.label}
            </span>
          );

          if (isCompleted) {
            return (
              <Link
                key={step.number}
                href={requesterPortalPath(slug, step.segment)}
                className={`${rowClasses} transition-opacity hover:opacity-90`}
                style={rowStyle}
              >
                {circleEl}
                {labelEl}
              </Link>
            );
          }

          return (
            <div key={step.number} className={rowClasses} style={rowStyle}>
              {circleEl}
              {labelEl}
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
