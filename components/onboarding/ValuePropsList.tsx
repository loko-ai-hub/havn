"use client";

import { Zap, Sparkles, DollarSign, Shield } from "lucide-react";

export const valueProps = [
  {
    icon: Zap,
    title: "Set up in minutes",
    description:
      "Get a shareable link for requests in as little as 3 minutes. No interviews, no delays.",
  },
  {
    icon: Sparkles,
    title: "Smart auto-completion",
    description:
      "We pre-fill docs using previous answers and your governing docs - less typing, fewer mistakes.",
  },
  {
    icon: DollarSign,
    title: "You set the prices",
    description:
      "Full control over pricing - we just cap based on local laws. Payments go straight to you.",
  },
  {
    icon: Shield,
    title: "Always in compliance",
    description:
      "We track state laws so you don't have to. Stay 100% compliant, automatically.",
  },
];

interface ValuePropsListProps {
  variant?: "dark" | "light";
  audience?: "teams" | "associations";
}

const ValuePropsList = ({
  variant = "dark",
  audience = "teams",
}: ValuePropsListProps) => {
  const isDark = variant === "dark";
  const heading =
    audience === "associations"
      ? "Why Associations choose Havn"
      : "Why teams choose Havn";

  return (
    <div className="space-y-5">
      <p
        className={`text-xs font-semibold uppercase tracking-widest ${isDark ? "text-white/65" : "text-muted-foreground"}`}
      >
        {heading}
      </p>
      {valueProps.map((prop, index) => (
        <div key={index} className="flex gap-3.5">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${isDark ? "border border-white/10 bg-black/20" : "bg-havn-surface"}`}
          >
            <prop.icon
              className={`h-4 w-4 ${isDark ? "text-havn-gold" : "text-foreground"}`}
            />
          </div>
          <div>
            <p className={`text-sm font-medium ${isDark ? "text-white" : "text-foreground"}`}>
              {prop.title}
            </p>
            <p
              className={`mt-0.5 text-xs leading-relaxed ${isDark ? "text-white/60" : "text-muted-foreground"}`}
            >
              {prop.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ValuePropsList;
