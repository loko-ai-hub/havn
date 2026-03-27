"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency, type PortalAddon } from "@/lib/portal-data";

type StepAddonsProps = {
  selected: string[];
  primaryColor: string;
  onToggle: (id: string) => void;
  addOnsList: PortalAddon[];
  documentTotal?: number;
  onContinue: () => void;
  onBack: () => void;
};

export default function StepAddons({
  selected,
  primaryColor,
  onToggle,
  addOnsList,
  documentTotal = 0,
  onContinue,
  onBack,
}: StepAddonsProps) {
  const hasSelection = selected.length > 0;
  const addOnsTotal = addOnsList
    .filter((addon) => selected.includes(addon.id))
    .reduce((sum, addon) => sum + addon.fee, 0);
  const orderTotal = documentTotal + addOnsTotal;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Add-Ons</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Optional extras you can include with this order.
      </p>

      <div className="mt-6 space-y-3">
        {addOnsList.map((addon) => {
          const isSelected = selected.includes(addon.id);
          return (
            <button
              key={addon.id}
              type="button"
              onClick={() => onToggle(addon.id)}
              className={[
                "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                isSelected
                  ? "border-havn-success bg-havn-success/10"
                  : "border-border bg-card hover:border-havn-navy/40",
              ].join(" ")}
              style={isSelected ? { boxShadow: `inset 0 0 0 1px ${primaryColor}25` } : undefined}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 mt-0.5 transition-colors ${
                  isSelected ? "" : "border-muted-foreground/30"
                }`}
                style={isSelected ? { borderColor: primaryColor, backgroundColor: primaryColor } : undefined}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-foreground">{addon.name}</p>
                    {addon.popular ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                      >
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{addon.description}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">
                  {formatCurrency(addon.fee)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg bg-secondary/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Documents</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(documentTotal)}</p>
        </div>
        <div className="my-2 h-px bg-border" />
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Add-ons</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(addOnsTotal)}</p>
        </div>
        <div className="my-2 h-px bg-border" />
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-foreground">Order total</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(orderTotal)}</p>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          className="flex-1 bg-havn-navy text-white hover:bg-havn-navy-light"
          onClick={onContinue}
        >
          {hasSelection ? "Continue" : "Skip"}
        </Button>
      </div>
    </div>
  );
}
