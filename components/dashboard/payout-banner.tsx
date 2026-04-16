"use client";

import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function PayoutBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-foreground">
          Payments are live on your portal, but payouts are on hold until you connect a bank account.{" "}
          <Link
            href="/dashboard/settings/stripe"
            className="font-medium text-destructive transition-colors hover:text-destructive/80"
          >
            Connect now →
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}
