"use client";

import { Check } from "lucide-react";
import ValuePropsList from "./ValuePropsList";
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
      <div className="mb-10">
        <span className="text-2xl font-semibold tracking-tight text-white">Havn</span>
      </div>

      <div className="mb-12 space-y-4">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const canNavigate = isCompleted;

          return (
            <button
              key={index}
              onClick={() => canNavigate && onStepClick?.(stepNum)}
              className={`flex w-full items-center gap-3 text-left transition-opacity ${
                canNavigate ? "cursor-pointer hover:opacity-80" : "cursor-default"
              }`}
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-all ${
                  isCompleted
                    ? "bg-havn-success text-primary-foreground"
                    : isActive
                      ? "bg-primary-foreground text-primary"
                      : "border border-havn-navy-muted text-havn-navy-muted"
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
                      : "text-havn-navy-muted"
                }`}
              >
                {step.label}
              </span>
              {step.optional && !isCompleted && (
                <span className="ml-auto text-[10px] text-havn-navy-muted">Optional</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-10 h-px bg-havn-navy-light" />

      <div className="flex-1">
        <ValuePropsList
          variant="dark"
          audience={accountType === "self_managed" ? "associations" : "teams"}
        />
      </div>
    </div>
  );
};

export default OnboardingSidebar;
