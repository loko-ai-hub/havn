"use client";

import {
  CheckCircle2,
  DollarSign,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/us-states";

import {
  applyDraftedStateConfig,
  generateStateServiceDraftAction,
} from "./actions";
import type {
  DraftedService,
  DraftedStateConfig,
} from "@/lib/state-service-onboarding";

type Stage = "idle" | "discovering" | "researching" | "pricing" | "done";

function currency(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function capLabel(cap: DraftedService["capType"], amount: number | null): string {
  if (cap === "fixed") return amount != null ? `Max ${currency(amount)} (statutory)` : "Fixed statutory cap";
  if (cap === "actual_cost") return "Actual/reasonable cost (no statutory max)";
  return "No statutory cap";
}

export default function StateServiceGenerator({
  onApplied,
}: {
  onApplied?: () => void;
}) {
  const [state, setState] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<DraftedStateConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const running = stage !== "idle" && stage !== "done";

  const handleGenerate = async () => {
    if (!state) {
      toast.error("Select a state first.");
      return;
    }
    setError(null);
    setDraft(null);
    setStage("discovering");

    // Soft stage ticker since the server action runs all three sequentially.
    const t1 = setTimeout(() => setStage("researching"), 12000);
    const t2 = setTimeout(() => setStage("pricing"), 45000);

    const toastId = toast.loading(`Researching ${state} services…`);
    try {
      const result = await generateStateServiceDraftAction({ state });
      if ("error" in result) {
        toast.error(result.error, { id: toastId });
        setError(result.error);
        setStage("idle");
        return;
      }
      setDraft(result);
      setStage("done");
      toast.success(
        `Drafted ${result.services.length} service${result.services.length === 1 ? "" : "s"} for ${state}.`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pipeline failed.", { id: toastId });
      setStage("idle");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  };

  const handleApply = async () => {
    if (!draft || draft.services.length === 0) {
      toast.error("Nothing to apply.");
      return;
    }
    setApplying(true);
    try {
      const result = await applyDraftedStateConfig({
        state: draft.state,
        services: draft.services,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Applied ${result.upserted} service${result.upserted === 1 ? "" : "s"} to ${draft.state}.`
      );
      onApplied?.();
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-havn-navy" />
        <h2 className="text-sm font-semibold text-foreground">
          AI state-service generator
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick a state. Agent 1 discovers which document services apply →
        Agent 2 deep-dives each service for formal name, cap, turnaround,
        auto-refund, and statute → Agent 3 recommends default pricing.
        Review below, then apply to the state config.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ssg-state" className="text-xs">State</Label>
          <select
            id="ssg-state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="mt-1 h-9 w-[180px] rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s.abbr} value={s.abbr}>
                {s.abbr} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={running || !state}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {running ? "Running pipeline…" : "Research services"}
        </Button>
      </div>

      {running && <PipelineProgress stage={stage} />}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {draft && <DraftView draft={draft} applying={applying} onApply={() => void handleApply()} />}
    </div>
  );
}

function PipelineProgress({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string; icon: typeof Sparkles }[] = [
    { id: "discovering", label: "Discovering services", icon: Search },
    { id: "researching", label: "Legal deep-dives", icon: Scale },
    { id: "pricing", label: "Pricing analysis", icon: DollarSign },
  ];
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const active = s.id === stage;
        return (
          <span
            key={s.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
              active
                ? "border-havn-navy/40 bg-havn-navy/5 text-havn-navy animate-pulse"
                : "border-border bg-background"
            )}
          >
            <Icon className="h-3 w-3" />
            {s.label}
            {i < steps.length - 1 ? " →" : ""}
          </span>
        );
      })}
    </div>
  );
}

function DraftView({
  draft,
  applying,
  onApply,
}: {
  draft: DraftedStateConfig;
  applying: boolean;
  onApply: () => void;
}) {
  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">
            {draft.stateName} — {draft.services.length} services
          </p>
          <p className="text-muted-foreground italic">{draft.discovery.summary}</p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onApply}
          disabled={applying || draft.services.length === 0}
          className="bg-havn-success text-white hover:bg-havn-success/90"
        >
          <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
          {applying ? "Applying…" : "Apply to state config"}
        </Button>
      </div>

      <div className="space-y-3">
        {draft.services.map((svc) => (
          <ServiceCard key={svc.masterTypeKey} service={svc} />
        ))}
      </div>

      {draft.pricing.summary && (
        <div className="rounded-md border border-border/60 bg-card p-2">
          <p className="font-semibold uppercase tracking-wider text-muted-foreground">
            Pricing rationale (all services)
          </p>
          <p className="mt-1 italic text-foreground">{draft.pricing.summary}</p>
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service }: { service: DraftedService }) {
  return (
    <div className="rounded-md border border-border/60 bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">
            {service.masterTypeKey}
          </p>
          <p className="font-semibold text-foreground">{service.formalName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Chip>{capLabel(service.capType, service.pricingCap)}</Chip>
          <Chip>{service.standardTurnaround}-day standard</Chip>
          {service.noRush ? (
            <Chip className="border-destructive/30 bg-destructive/10 text-destructive">
              Rush disallowed
            </Chip>
          ) : service.rushTriggerDays != null ? (
            <Chip>
              Rush ≤ {service.rushTriggerDays}d
            </Chip>
          ) : null}
          {service.rushCap != null && (
            <Chip>Rush cap {currency(service.rushCap)}</Chip>
          )}
          {service.autoRefundOnMiss && (
            <Chip
              className={cn(
                service.autoRefundRequiredByStatute
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-havn-amber/40 bg-havn-amber/10 text-havn-amber"
              )}
            >
              {service.autoRefundRequiredByStatute
                ? "Auto-refund (statutory)"
                : "Auto-refund (policy)"}
            </Chip>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Info label="Statute" value={service.statute || "—"} mono />
        <Info
          label="Recommended default"
          value={
            service.recommendedDefault != null
              ? currency(service.recommendedDefault)
              : "—"
          }
          bold
        />
        <Info
          label="Rush premium"
          value={service.rushPremium != null ? `+${currency(service.rushPremium)}` : "—"}
        />
        <Info
          label="Maximum allowable"
          value={
            service.capType === "fixed" && service.pricingCap != null
              ? currency(service.pricingCap)
              : "No statutory max"
          }
        />
        <Info
          label="Rush threshold"
          value={
            service.noRush
              ? "Rush disallowed"
              : service.rushTriggerDays != null
                ? `≤ ${service.rushTriggerDays} days to delivery`
                : "Not defined"
          }
        />
        <Info
          label="Auto-refund"
          value={
            service.autoRefundOnMiss
              ? service.autoRefundRequiredByStatute
                ? "Required by statute"
                : "Policy (not statutory)"
              : "No"
          }
        />
      </div>

      {service.rushDefinition && (
        <div className="mt-2 rounded-sm bg-muted/40 p-2 text-[11px] text-foreground">
          <span className="font-semibold">Rush definition: </span>
          {service.rushDefinition}
        </div>
      )}
      {service.autoRefundNote && (
        <div className="mt-2 rounded-sm bg-muted/40 p-2 text-[11px] text-foreground">
          <span className="font-semibold">Auto-refund: </span>
          {service.autoRefundNote}
        </div>
      )}
      {service.pricingReasoning && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Pricing: </span>
          {service.pricingReasoning}
        </div>
      )}
      {service.notes && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Notes: </span>
          {service.notes}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

function Info({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-foreground",
          mono && "font-mono text-[11px]",
          bold && "font-semibold"
        )}
      >
        {value}
      </p>
    </div>
  );
}
