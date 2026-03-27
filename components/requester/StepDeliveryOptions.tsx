"use client";

import { ArrowRight, CalendarIcon, Clock, Zap } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DELIVERY_OPTIONS, HOMEOWNER_DELIVERY_OPTIONS, formatCurrency, type RequesterType } from "@/lib/portal-data";
import { usePortalOrder } from "@/components/requester/RequesterPortalOrgContext";

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
  const { order, updateOrder } = usePortalOrder();
  const [deliveryType, setDeliveryType] = useState<string>(
    order.deliveryType || "standard"
  );
  const [closingDate, setClosingDate] = useState<Date | undefined>(
    order.closingDate ? new Date(order.closingDate) : undefined
  );
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isDateSelecting, setIsDateSelecting] = useState(false);

  const baseOptions =
    requesterType === "homeowner" ? HOMEOWNER_DELIVERY_OPTIONS : DELIVERY_OPTIONS;
  const standardOption = baseOptions.find((opt) => opt.id === "standard") ?? {
    id: "standard",
    label: "Standard",
    fee: 0,
  };
  const rushOption = baseOptions.find((opt) => opt.id === "rush") ?? {
    id: "rush",
    label: "Rush",
    fee: 75,
  };

  const addBusinessDays = (date: Date, days: number) => {
    const next = new Date(date);
    let remaining = days;
    while (remaining > 0) {
      next.setDate(next.getDate() + 1);
      const day = next.getDay();
      if (day !== 0 && day !== 6) remaining -= 1;
    }
    return next;
  };

  const standardReadyBy = addBusinessDays(new Date(), 5);
  const standardTooLate =
    Boolean(closingDate) && Boolean(closingDate && closingDate < standardReadyBy);

  const handleContinue = () => {
    if (!closingDate) {
      setError("Please select your targeted closing date.");
      return;
    }
    if (!deliveryType) {
      setError("Please choose a delivery option.");
      return;
    }
    setError(null);
    updateOrder({
      deliveryType,
      closingDate: closingDate ? closingDate.toISOString() : "",
    });
    router.push(`/r/${slug}/review`);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setIsDateSelecting(true);
    setClosingDate(date);
    updateOrder({ closingDate: date ? date.toISOString() : "" });
    if (date && date < standardReadyBy) {
      setDeliveryType("rush");
      updateOrder({ deliveryType: "rush" });
    }
    window.setTimeout(() => setIsDateSelecting(false), 180);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Delivery &amp; Timing</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Select how quickly you need your documents.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">When is your targeted closing date?</p>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger className="mt-3 inline-flex h-10 w-full items-center justify-start rounded-lg border border-border bg-white px-3 text-sm text-foreground transition-colors hover:bg-muted">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {closingDate ? format(closingDate, "PPP") : "Pick a date"}
            {calendarOpen && isDateSelecting ? (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                Selecting...
              </span>
            ) : null}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
            <Calendar
              className="pointer-events-auto"
              mode="single"
              selected={closingDate}
              onSelect={(date) => {
                handleDateSelect(date);
                setCalendarOpen(false);
              }}
              disabled={{ before: new Date() }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {standardTooLate ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Your targeted closing date is within the standard turnaround window. Rush has been selected to help meet your timeline.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            if (standardTooLate) return;
            setDeliveryType("standard");
            updateOrder({ deliveryType: "standard" });
            if (error) setError(null);
          }}
          disabled={standardTooLate}
          className={[
            "rounded-xl border-2 p-4 text-left transition-colors",
            deliveryType === "standard"
              ? "border-havn-success bg-havn-success/10"
              : "border-border bg-card hover:border-havn-navy/40",
            standardTooLate ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" style={{ color: deliveryType === "standard" ? primaryColor : "var(--muted-foreground)" }} />
              <span className="text-sm font-semibold text-foreground">{standardOption.label}</span>
            </div>
            <span className="text-sm text-foreground">{formatCurrency(standardOption.fee)}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            setDeliveryType("rush");
            updateOrder({ deliveryType: "rush" });
            if (error) setError(null);
          }}
          className={[
            "rounded-xl border-2 p-4 text-left transition-colors",
            deliveryType === "rush"
              ? "border-havn-success bg-havn-success/10"
              : "border-border bg-card hover:border-havn-navy/40",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: deliveryType === "rush" ? primaryColor : "var(--muted-foreground)" }} />
              <span className="text-sm font-semibold text-foreground">{rushOption.label}</span>
            </div>
            <span className="text-sm text-foreground">{formatCurrency(rushOption.fee)}</span>
          </div>
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 text-base"
          onClick={() => router.push(`/r/${slug}/addons`)}
        >
          Back
        </Button>
        <Button type="button" onClick={handleContinue} className="h-12 flex-1 bg-havn-navy text-base font-semibold text-white hover:bg-havn-navy-light">
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
