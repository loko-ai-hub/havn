import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Shield } from "lucide-react";

function portalDisplayName(slug: string): string {
  const parts = slug.split(/[-_]+/).filter(Boolean);
  if (parts.length === 0) return slug;
  return parts
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const ORDER_TYPES = [
  "Resale certificates & disclosure packages",
  "Lender questionnaires",
  "Certificate updates",
  "Demand / payoff letters",
  "Estoppel letters",
  "Governing documents",
] as const;

export function RequesterPortalLanding({
  slug,
  startOrderHref,
}: {
  slug: string;
  startOrderHref: string;
}) {
  const communityName = portalDisplayName(slug);

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(217,179,106,0.18),transparent)]"
      />
      <div className="relative mx-auto max-w-2xl px-6 py-14 md:py-20">
        <div className="flex flex-col items-center text-center">
          {/* Community logo placeholder (Supabase logo_url later) */}
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-havn-gold/35 bg-card shadow-sm"
          >
            <Building2
              className="h-11 w-11 text-havn-navy-muted"
              strokeWidth={1.25}
              aria-hidden
            />
            <span className="sr-only">Community logo</span>
          </div>

          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-havn-navy-muted">
            Document requests
          </p>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-havn-navy md:text-4xl">
            {communityName}
          </h1>
          <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
            Request HOA and association documents for your closing or refinance.
            Pay securely and track status in one place.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <p className="text-sm font-medium text-foreground">
            What you can order here
          </p>
          <ul className="mt-4 space-y-3 text-left">
            {ORDER_TYPES.map((line) => (
              <li key={line} className="flex gap-3 text-sm text-muted-foreground">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-havn-gold"
                  aria-hidden
                />
                <span className="leading-snug text-foreground">{line}</span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Pricing and turnaround follow your community manager&apos;s schedule
            and applicable state limits. Rush options may be available at
            checkout.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={startOrderHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-havn-navy px-4 text-sm font-medium text-white transition-colors hover:bg-havn-navy-light hover:text-white"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="text-center text-[11px] text-muted-foreground sm:text-left">
              Next: confirm who is requesting (homeowner, agent, title, or
              lender).
            </p>
          </div>
        </div>

        {/* Havn partnership row */}
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-border pt-8 md:flex-row md:justify-center md:gap-6">
          <div className="flex items-center gap-2 text-havn-navy">
            <Shield className="h-4 w-4 text-havn-gold" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">Havn</span>
          </div>
          <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground md:text-left">
            Payments and compliance tooling powered by Havn. Your community team
            fulfills requests directly.
          </p>
        </div>
      </div>
    </div>
  );
}
