"use client";

import { CalendarIcon, Clock, Zap } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DELIVERY_OPTIONS,
  HOMEOWNER_DELIVERY_OPTIONS,
  formatCurrency,
  type RequesterType,
} from "@/lib/portal-data";

export default function StepDeliveryOptions({
  slug,
  requesterType,
  primaryColor = "#1B2B4B",
}: {
  slug: string;
  requesterType: RequesterType;
  primaryColor?: string;
}) {
  const router = useRouter();
  const [deliveryType, setDeliveryType] = useState<string>("standard");
  const [closingDate, setClosingDate] = useState<Date | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const options =
    requesterType === "homeowner" ? HOMEOWNER_DELIVERY_OPTIONS : DELIVERY_OPTIONS;

  const handleContinue = () => {
    if (!deliveryType) {
      setError("Please choose a delivery option.");
      return;
    }
    setError(null);
    router.push(`/r/${slug}/review`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Delivery options
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Select how quickly you need your documents.
      </p>

      <div className="mt-6 space-y-3">
        {options.map((option) => {
          const selected = deliveryType === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setDeliveryType(option.id);
                if (error) setError(null);
              }}
              className={[
                "w-full rounded-xl border-2 p-4 text-left transition-colors",
                selected
                  ? "border-havn-success bg-havn-success/10"
                  : "border-border bg-card hover:border-havn-navy/40",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {option.id === "standard" ? (
                    <Clock
                      className="h-4 w-4"
                      style={{ color: selected ? primaryColor : "var(--muted-foreground)" }}
                    />
                  ) : (
                    <Zap
                      className="h-4 w-4"
                      style={{ color: selected ? primaryColor : "var(--muted-foreground)" }}
                    />
                  )}
                  <span className="text-sm font-semibold text-foreground">
                    {option.label}
                  </span>
                </div>
                <span className="text-sm text-foreground">
                  {formatCurrency(option.fee)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Estimated closing date (optional)</p>
        <Popover>
          <PopoverTrigger className="mt-3 inline-flex h-10 w-full items-center justify-start rounded-lg border border-border bg-white px-3 text-sm text-foreground transition-colors hover:bg-muted">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {closingDate ? format(closingDate, "PPP") : "Pick a date"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={closingDate} onSelect={setClosingDate} initialFocus />
          </PopoverContent>
        </Popover>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => router.push(`/r/${slug}/addons`)}>
          Back
        </Button>
        <Button type="button" onClick={handleContinue} className="bg-havn-navy text-white hover:bg-havn-navy-light">
          Continue
        </Button>
      </div>
    </div>
  );
}
