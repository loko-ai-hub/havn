"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function RequesterPortalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-havn-navy-muted">
        Havn Portal
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-havn-navy">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        We&apos;re having trouble loading this portal. Please try refreshing the page.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button
          type="button"
          onClick={reset}
          className="bg-havn-navy text-white hover:bg-havn-navy-light"
        >
          Try again
        </Button>
        <Link
          href="mailto:support@havnhq.com"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}
