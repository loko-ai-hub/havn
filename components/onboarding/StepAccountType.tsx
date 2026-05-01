"use client";

import { Building2, Home, CheckCircle2 } from "lucide-react";

export type AccountType = "management_company" | "self_managed";

interface StepAccountTypeProps {
  onSelect: (type: AccountType) => void;
}

const options: {
  type: AccountType;
  icon: typeof Building2;
  title: string;
  description: string;
  bullets: string[];
}[] = [
  {
    type: "management_company",
    icon: Building2,
    title: "Management Company",
    description: "I do or will need to support multiple different communities.",
    bullets: [
      "Manage documents across multiple communities",
      "Assign team members to handle requests",
    ],
  },
  {
    type: "self_managed",
    icon: Home,
    title: "Self-Managed Association",
    description: "I'm a board member and only need my community supported.",
    bullets: [
      "Simple setup for a single community",
      "Ideal for HOA board members and volunteers",
    ],
  },
];

const StepAccountType = ({ onSelect }: StepAccountTypeProps) => {
  return (
    <div className="flex flex-1 items-center justify-center px-8 py-16 md:px-16 md:py-20">
      <div className="w-full max-w-2xl">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Who are you setting up Havn for?
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Based on your answer, we&rsquo;ll set up your profile to support a single community or
            multiple.
          </p>
        </div>

        <div className="space-y-4">
          {options.map((opt) => (
            <button
              key={opt.type}
              onClick={() => onSelect(opt.type)}
              className="group flex w-full items-start gap-6 rounded-xl border-2 border-border bg-card p-7 text-left transition-all hover:border-havn-navy-light hover:shadow-md"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-havn-surface text-foreground">
                <opt.icon className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <span className="block text-base font-semibold text-foreground">{opt.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{opt.description}</span>
                <ul className="mt-3 space-y-1.5">
                  {opt.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--havn-success))]" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StepAccountType;
