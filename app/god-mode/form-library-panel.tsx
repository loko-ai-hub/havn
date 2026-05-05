"use client";

import { CheckCircle2, Clock, ExternalLink, FileQuestion } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import {
  listFormVariants,
  type FormVariantRow,
} from "./form-templates-actions";

/**
 * Cross-form curation surface. Lists every unique vendor form variant
 * Havn has ingested, joined with whether a canonical layout has been
 * saved. Forms without a saved template surface first — those need
 * staff attention. Each row deep-links to the latest order's review
 * page with the layout editor pre-enabled, so refining the layout +
 * saving as a template is one click away.
 */
export default function FormLibraryPanel() {
  const [rows, setRows] = useState<FormVariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listFormVariants();
        if (!cancelled) {
          setRows(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Form Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every vendor form variant Havn has ingested. Forms without a
          saved canonical layout surface first — open one to refine the
          AI&apos;s positioning and save as a template that benefits every
          future order of the same form.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No form variants ingested yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Form</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Orders</th>
                <th className="px-4 py-3 font-semibold">Latest ingest</th>
                <th className="px-4 py-3 font-semibold">Positioner</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.issuer ?? ""}|${r.formTitle ?? ""}`}
                  className="border-t border-border/60"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {r.formTitle ?? <span className="italic text-muted-foreground">Untitled form</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.issuer ?? "Unknown issuer"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.masterTypeKey ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge saved={r.templateSaved} />
                  </td>
                  <td className="px-4 py-3 text-center text-xs tabular-nums text-muted-foreground">
                    {r.orderCount}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.latestIngestAt
                      ? new Date(r.latestIngestAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <PositionerSummary telemetry={r.latestTelemetry} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.latestOrderId && (
                      <Link
                        href={`/dashboard/requests/${r.latestOrderId}/review?editLayout=1`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Refine
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ saved }: { saved: boolean }) {
  return saved ? (
    <span
      title="Canonical layout saved. Future orders for this form load it instantly."
      className="inline-flex items-center gap-1 rounded-md border border-havn-success/30 bg-havn-success/10 px-2 py-0.5 text-xs font-medium text-havn-success"
    >
      <CheckCircle2 className="h-3 w-3" />
      Template saved
    </span>
  ) : (
    <span
      title="No canonical layout yet. Refine the AI's positioning and save to make future orders perfect."
      className="inline-flex items-center gap-1 rounded-md border border-havn-amber/40 bg-havn-amber/10 px-2 py-0.5 text-xs font-medium text-havn-amber"
    >
      <Clock className="h-3 w-3" />
      Needs review
    </span>
  );
}

function PositionerSummary({
  telemetry,
}: {
  telemetry: Record<string, unknown> | null;
}) {
  if (!telemetry) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <FileQuestion className="h-3 w-3" />
        no telemetry
      </span>
    );
  }
  const t = telemetry as {
    cache_hit?: boolean;
    acroform_field_count?: number;
    vision_field_count?: number;
    form_parser_field_count?: number;
    synthesis_field_count?: number;
    total_layout_field_count?: number;
  };
  const winner = t.cache_hit
    ? "cache"
    : (t.acroform_field_count ?? 0) > 0
      ? "acroform"
      : (t.vision_field_count ?? 0) > 0
        ? "vision"
        : (t.form_parser_field_count ?? 0) > 0
          ? "form parser"
          : (t.synthesis_field_count ?? 0) > 0
            ? "synthesis"
            : "—";
  const winnerCls = cn(
    "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
    winner === "cache"
      ? "border-havn-success/30 bg-havn-success/10 text-havn-success"
      : winner === "acroform"
        ? "border-havn-navy/30 bg-havn-navy/10 text-havn-navy"
        : winner === "vision"
          ? "border-havn-amber/40 bg-havn-amber/10 text-havn-amber"
          : "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
  );
  return (
    <div className="space-y-0.5">
      <span className={winnerCls}>{winner}</span>
      <p className="text-[10px] text-muted-foreground">
        {t.total_layout_field_count ?? 0} fields total
      </p>
    </div>
  );
}
