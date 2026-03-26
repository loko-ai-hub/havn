import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";

function portalDisplayName(slug: string): string {
  const parts = slug.split(/[-_]+/).filter(Boolean);
  if (parts.length === 0) return slug;
  return parts
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const REQUIRED_ITEMS = [
  "Property address",
  "Estimated closing date",
  "Payment method",
] as const;

const AFTER_SUBMIT_ITEMS = [
  "Documents are delivered by email",
  "A Havn account is created to track your order",
] as const;

export function RequesterPortalLanding({
  slug,
  startOrderHref,
  loading = false,
}: {
  slug: string;
  startOrderHref: string;
  loading?: boolean;
}) {
  const communityName = portalDisplayName(slug);

  if (loading) {
    return (
      <div className="relative overflow-hidden">
        <div className="relative mx-auto max-w-2xl px-6 py-14 md:py-20">
          <div className="flex flex-col text-center">
            <div className="mx-auto h-3 w-36 animate-pulse rounded bg-muted" />
            <div className="mx-auto mt-3 h-10 w-80 animate-pulse rounded bg-muted" />
            <div className="mx-auto mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
          </div>

          <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
            <div className="rounded-xl border border-border bg-havn-surface/40 p-4">
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-56 animate-pulse rounded bg-muted" />
                <div className="h-3 w-52 animate-pulse rounded bg-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted" />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-havn-surface/40 p-4">
              <div className="h-4 w-52 animate-pulse rounded bg-muted" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-44 animate-pulse rounded bg-muted" />
                <div className="h-3 w-60 animate-pulse rounded bg-muted" />
              </div>
            </div>

            <div className="mt-6 h-11 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(217,179,106,0.18),transparent)]"
      />
      <div className="relative mx-auto max-w-2xl px-6 py-14 md:py-20">
        <div className="flex flex-col text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-havn-navy-muted">
            {communityName}
          </p>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-havn-navy md:text-4xl">
            Order Association Documents
          </h1>
          <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
            Request HOA and association documents for your closing or refinance.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <div className="rounded-xl border border-border bg-havn-surface/40 p-4 text-left">
            <p className="text-sm font-medium text-foreground">
              This process takes about 5 minutes. You&apos;ll need:
            </p>
            <ul className="mt-3 space-y-2">
              {REQUIRED_ITEMS.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-havn-navy" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-havn-surface/40 p-4 text-left">
            <p className="text-sm font-medium text-foreground">
              After you submit your request:
            </p>
            <ul className="mt-3 space-y-2">
              {AFTER_SUBMIT_ITEMS.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-havn-navy" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 space-y-3">
            <Link
              href={startOrderHref}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-havn-navy px-4 text-sm font-medium text-white transition-colors hover:bg-havn-navy-light hover:text-white"
            >
              Get Started
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <div className="relative py-1 text-center">
              <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
              <span className="relative bg-card px-2 text-xs text-muted-foreground">or</span>
            </div>
            <Link
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <LogIn className="h-4 w-4" />
              Already have a Havn account? Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
