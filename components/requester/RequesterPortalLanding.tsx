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
  "The property address being sold",
  "Estimated closing date",
  "A payment method for processing fees",
] as const;

function hexWithAlpha(hex: string, alphaSuffix: string): string {
  const raw = hex.trim();
  if (!raw.startsWith("#")) return `#1B2B4B${alphaSuffix}`;
  if (raw.length === 7) return `${raw}${alphaSuffix}`;
  if (raw.length === 4) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}${alphaSuffix}`;
  }
  return `${raw}${alphaSuffix}`;
}

const AFTER_SUBMIT_ITEMS = [
  "Your completed report will be sent directly to your email",
  "You'll be able to create an account to track your request status in real time",
] as const;

export function RequesterPortalLanding({
  slug,
  startOrderHref,
  companyName,
  primaryColor,
  welcomeMessage,
  logoUrl,
  loading = false,
}: {
  slug: string;
  startOrderHref: string;
  companyName: string;
  primaryColor: string;
  welcomeMessage: string;
  logoUrl?: string | null;
  loading?: boolean;
}) {
  const communityName = companyName?.trim() || portalDisplayName(slug);

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
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${communityName} logo`}
              className="mx-auto h-20 w-20 rounded-full border border-border object-cover"
            />
          ) : (
            <p className="text-balance text-lg font-semibold tracking-tight text-havn-navy">{communityName}</p>
          )}
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-havn-navy md:text-4xl">
            Order Association Documents
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
            {welcomeMessage}
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
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Get Started
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p
              className="mt-3 text-center text-xs"
              style={{ color: hexWithAlpha(primaryColor, "99") }}
            >
              Takes less than 5 minutes · Secure payment
            </p>
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
        <p className="py-6 text-center text-xs text-muted-foreground">Powered by Havn</p>
      </div>
    </div>
  );
}
