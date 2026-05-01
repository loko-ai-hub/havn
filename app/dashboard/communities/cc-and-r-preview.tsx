"use client";

import { Sparkles } from "lucide-react";
import type { CcAndRExtractionResult } from "@/lib/cc-and-r-extractor";

const CONFIDENCE_BADGE: Record<
  "high" | "medium" | "low" | "not_found",
  { label: string; className: string }
> = {
  high: {
    label: "Confirmed",
    className: "bg-havn-success/15 text-havn-success",
  },
  medium: {
    label: "Verify",
    className: "bg-havn-amber/15 text-havn-amber",
  },
  low: {
    label: "Best guess",
    className: "bg-havn-amber/15 text-havn-amber",
  },
  not_found: {
    label: "Not found",
    className: "bg-muted text-muted-foreground",
  },
};

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low" | "not_found";
}) {
  const cfg = CONFIDENCE_BADGE[confidence];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

function formatDollars(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CcAndRPreview({
  extraction,
}: {
  extraction: CcAndRExtractionResult;
}) {
  const monthly = extraction.monthly_assessment_dollars;
  const annual = extraction.annual_dues_dollars;
  const founded = extraction.year_founded;
  const governing = extraction.governing_body_name;
  const board = extraction.board_positions ?? [];
  const restrictions = extraction.key_restrictions_summary?.trim();

  const hasAny =
    monthly?.value != null ||
    annual?.value != null ||
    founded?.value != null ||
    governing?.value ||
    board.length > 0 ||
    restrictions;

  if (!hasAny) return null;

  return (
    <div className="rounded-lg border border-havn-cyan/30 bg-havn-cyan/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-havn-cyan-deep" />
        <p className="text-sm font-semibold text-foreground">
          Also found in your CC&amp;R
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        We pulled these out of your governing documents. Verify the &ldquo;Verify&rdquo; or
        &ldquo;Best guess&rdquo; values; they may need a second look.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {monthly?.value != null && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Monthly assessment</p>
              <p className="font-medium text-foreground">{formatDollars(monthly.value)}</p>
            </div>
            <ConfidenceBadge confidence={monthly.confidence} />
          </div>
        )}
        {annual?.value != null && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Annual dues</p>
              <p className="font-medium text-foreground">{formatDollars(annual.value)}</p>
            </div>
            <ConfidenceBadge confidence={annual.confidence} />
          </div>
        )}
        {founded?.value != null && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Year founded</p>
              <p className="font-medium text-foreground">{founded.value}</p>
            </div>
            <ConfidenceBadge confidence={founded.confidence} />
          </div>
        )}
        {governing?.value && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Governing body</p>
              <p className="font-medium text-foreground">{governing.value}</p>
            </div>
            <ConfidenceBadge confidence={governing.confidence} />
          </div>
        )}
      </div>

      {board.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">Board positions</p>
          <ul className="mt-1 space-y-0.5">
            {board.map((b, idx) => (
              <li key={`${b.title}-${idx}`} className="text-foreground">
                <span className="font-medium">{b.title}</span>
                {b.name ? <span className="text-muted-foreground"> — {b.name}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {restrictions && (
        <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">Key restrictions</p>
          <p className="mt-1 leading-relaxed text-foreground">{restrictions}</p>
        </div>
      )}
    </div>
  );
}
