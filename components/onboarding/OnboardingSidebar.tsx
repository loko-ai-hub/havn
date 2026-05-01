"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import type { AccountType } from "./StepAccountType";

interface OnboardingSidebarProps {
  currentStep: number;
  totalSteps: number;
  accountType: AccountType;
  onStepClick?: (step: number) => void;
}

const getSteps = (accountType: AccountType) => [
  { label: "Account Type" },
  { label: accountType === "self_managed" ? "Association Details" : "Company Details" },
  { label: "Fees & Turnaround" },
  {
    label: accountType === "self_managed" ? "Association Portal" : "Company Portal",
    optional: true,
  },
  {
    label: accountType === "self_managed" ? "Invite Board" : "Invite Teammates",
    optional: true,
  },
];

const OnboardingSidebar = ({
  currentStep,
  accountType,
  onStepClick,
}: OnboardingSidebarProps) => {
  const steps = getSteps(accountType);
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-havn-navy p-10 text-primary-foreground">
      <div className="mb-12">
        <Image
          src="/havn-lockup-dark.svg"
          alt="Havn"
          width={120}
          height={40}
          priority
          className="h-10 w-auto"
        />
      </div>

      <ol className="relative">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const canNavigate = isCompleted;
          const isLast = index === steps.length - 1;

          return (
            <li key={index} className="relative pb-8 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-3 top-6 -ml-px h-[calc(100%-1rem)] w-px ${
                    isCompleted ? "bg-havn-cyan/60" : "bg-white/15"
                  }`}
                />
              )}
              <button
                onClick={() => canNavigate && onStepClick?.(stepNum)}
                className={`relative flex w-full items-center gap-3 text-left transition-opacity ${
                  canNavigate ? "cursor-pointer hover:opacity-80" : "cursor-default"
                }`}
              >
                <div
                  className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-all ${
                    isCompleted
                      ? "bg-havn-cyan text-havn-navy"
                      : isActive
                        ? "bg-primary-foreground text-primary"
                        : "border border-white/25 bg-havn-navy text-white/60"
                  }`}
                >
                  {isCompleted ? <Check className="h-3 w-3" /> : stepNum}
                </div>
                <span
                  className={`text-sm font-medium transition-colors ${
                    isActive
                      ? "text-primary-foreground"
                      : isCompleted
                        ? "text-primary-foreground/80"
                        : "text-white/60"
                  }`}
                >
                  {step.label}
                </span>
                {step.optional && !isCompleted && (
                  <span className="ml-auto text-xs font-medium text-white/50">Optional</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default OnboardingSidebar;
