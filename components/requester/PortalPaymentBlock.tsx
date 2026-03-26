"use client";

import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/portal-data";

export default function PortalPaymentBlock({
  total,
  onPay,
}: {
  total: number;
  onPay: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm font-medium text-foreground">Payment</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Secure checkout is mocked for now.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-havn-surface/60 px-3 py-2">
        <span className="text-sm text-muted-foreground">Amount due</span>
        <span className="text-lg font-semibold text-foreground">
          {formatCurrency(total)}
        </span>
      </div>
      <Button
        type="button"
        onClick={onPay}
        className="mt-4 w-full bg-havn-navy text-white hover:bg-havn-navy-light"
      >
        <CreditCard className="mr-2 h-4 w-4" />
        Pay now
      </Button>
    </div>
  );
}
