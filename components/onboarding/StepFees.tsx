"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Info, ExternalLink, CheckCircle2, X } from "lucide-react";
import { US_STATES } from "@/lib/us-states";
import {
  RESALE_DEFS,
  DEMAND_DEFS,
  UPDATE_DEFS,
  LENDER_DEFS,
  RUSH_DEFS,
  filterByStates,
  type StateDocDef,
} from "@/lib/fee-data";

const STATE_FEE_CAPS: Record<string, { resale?: number; update?: number; rush?: string; statute?: string }> = {
  WA: { resale: 275, update: 100, rush: "3 business days", statute: "RCW 64.90.640" },
  CA: { resale: 300, statute: "Civil Code §5600" },
  TX: { resale: 375, statute: "Tex. Prop. Code §207.006" },
  FL: { resale: 250, statute: "Fla. Stat. §720.30851" },
  CO: { resale: 300, statute: "C.R.S. §38-33.3-209.5" },
  VA: { resale: 350, statute: "Va. Code §55.1-1810" },
  AZ: { resale: 400, statute: "A.R.S. §33-1806" },
  NV: { resale: 250, statute: "NRS §116.4109" },
  NC: { resale: 250, statute: "N.C.G.S. §47F-3-102" },
  GA: { resale: 250, statute: "O.C.G.A. §44-3-101" },
};

interface StepFeesProps {
  primaryState: string;
  isMultiState: boolean;
  additionalStates: string[];
  onContinue: (data: FeesData) => void;
  isSubmitting?: boolean;
}

interface RushOption {
  enabled: boolean;
  fee: string;
  cutoff?: string;
}

export interface FeesData {
  resaleCertificate: string;
  certificateUpdate: string;
  lenderQuestionnaire: string;
  demandLetter: string;
  turnaround: string;
  rushSameDay: RushOption;
  rushNextDay: RushOption;
  rushThreeDay: RushOption;
}

function StatutoryCapBanner({
  stateAbbr,
  docKind,
  feeStr,
}: {
  stateAbbr: string;
  docKind: "resale" | "update" | "lender" | "demand";
  feeStr: string;
}) {
  const stateName = US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;
  if (!stateAbbr) return null;

  const caps = STATE_FEE_CAPS[stateAbbr];
  const fee = Number.parseFloat(feeStr.replace(/[^0-9.]/g, "")) || 0;
  const cap = docKind === "resale" ? caps?.resale : docKind === "update" ? caps?.update : undefined;

  if (!caps || cap == null) {
    return (
      <div className="rounded-md border border-border bg-havn-surface/40 px-3 py-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{stateName}</span> has no fixed cap. Fees must reflect actual
        cost
      </div>
    );
  }

  if (fee > cap) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
        Exceeds {stateName} cap of ${cap}
        {caps.statute ? ` (${caps.statute})` : ""}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-havn-success/40 bg-havn-success/15 px-3 py-2.5 text-xs text-emerald-950 dark:text-emerald-100">
      {stateName} cap: ${cap}. You&apos;re within the limit.
      {caps.statute ? ` (${caps.statute})` : ""}
    </div>
  );
}

const DollarInput = ({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <div className="flex h-11 items-center overflow-hidden rounded-md border border-border">
    <span className="flex h-full select-none items-center border-r border-border bg-havn-surface px-3 text-sm text-muted-foreground">
      $
    </span>
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      placeholder={placeholder}
      className="h-full flex-1 bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
    />
  </div>
);

const StepFees = ({
  primaryState,
  isMultiState,
  additionalStates,
  onContinue,
  isSubmitting = false,
}: StepFeesProps) => {
  const [resaleCertificate, setResaleCertificate] = useState("275");
  const [certificateUpdate, setCertificateUpdate] = useState("100");
  const [lenderQuestionnaire, setLenderQuestionnaire] = useState("200");
  const [demandLetter, setDemandLetter] = useState("250");
  const [turnaround, setTurnaround] = useState("10");
  const [customDays, setCustomDays] = useState("");
  // Tightest statutory turnaround across the states this org operates in, loaded
  // from state_fee_limits. Used to surface the "Recommended" badge dynamically.
  // If no data is found, recommendation falls back to 10 business days.
  const [recommendedDays, setRecommendedDays] = useState<string>("10");
  const [recommendationSource, setRecommendationSource] = useState<"default" | "state">(
    "default"
  );
  const [showPricingTip, setShowPricingTip] = useState(true);
  const [showMultiStateLegalBanner, setShowMultiStateLegalBanner] = useState(true);

  const [rushSameDay, setRushSameDay] = useState<RushOption>({
    enabled: false,
    fee: "",
    cutoff: "14:00",
  });
  const [rushNextDay, setRushNextDay] = useState<RushOption>({
    enabled: false,
    fee: "",
    cutoff: "14:00",
  });
  const [rushThreeDay, setRushThreeDay] = useState<RushOption>({
    enabled: false,
    fee: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onContinue({
      resaleCertificate,
      certificateUpdate,
      lenderQuestionnaire,
      demandLetter,
      turnaround: turnaround === "custom" ? customDays || "10" : turnaround,
      rushSameDay,
      rushNextDay,
      rushThreeDay,
    });
  };

  const stateName = US_STATES.find((s) => s.abbr === primaryState)?.name ?? primaryState;
  const isSingleState = !isMultiState;

  const selectedStates = useMemo(
    () => [primaryState, ...additionalStates].filter(Boolean),
    [primaryState, additionalStates]
  );

  // Pull the tightest statutory turnaround across the operating states so the
  // recommended default reflects real law when we have it. Fallback: 10 days.
  useEffect(() => {
    if (selectedStates.length === 0) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("state_fee_limits")
        .select("standard_turnaround, state")
        .in("state", selectedStates)
        .not("standard_turnaround", "is", null);

      if (!data || data.length === 0) {
        setRecommendedDays("10");
        setRecommendationSource("default");
        setTurnaround((current) => (current === "10" || current === "5" ? "10" : current));
        return;
      }

      const tightest = Math.min(
        ...data.map((r) => Number(r.standard_turnaround)).filter((n) => Number.isFinite(n) && n > 0)
      );
      if (!Number.isFinite(tightest) || tightest <= 0) {
        setRecommendedDays("10");
        setRecommendationSource("default");
        return;
      }
      const resolved = String(tightest);
      setRecommendedDays(resolved);
      setRecommendationSource("state");
      setTurnaround((current) => (current === "10" || current === "5" ? resolved : current));
    })();
  }, [selectedStates]);

  return (
    <div className="flex h-full justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Set your fees</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure pricing for resale documents and turnaround options.
          </p>
          {showPricingTip && (
            <div className="relative mt-4 rounded-lg border border-havn-cyan/30 bg-havn-cyan/10 px-4 py-3 pr-20">
              <button
                type="button"
                onClick={() => setShowPricingTip(false)}
                className="absolute top-2 right-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Dismiss
              </button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span aria-hidden>💡 </span>
                <span className="font-semibold text-foreground">Pricing tip:</span> Most management
                companies in {stateName} charge between $200–$
                {Math.min(300, STATE_FEE_CAPS[primaryState]?.resale ?? 300)} for resale
                certificates. Setting competitive prices helps ensure requesters complete their
                orders.
              </p>
            </div>
          )}
          {isMultiState && showMultiStateLegalBanner && (
            <div className="relative mt-3 rounded-lg border border-havn-amber/40 bg-havn-amber/15 px-4 py-3 pr-9">
              <button
                type="button"
                onClick={() => setShowMultiStateLegalBanner(false)}
                className="absolute top-2 right-2 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-havn-amber/25 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="text-xs leading-relaxed text-foreground">
                Your fees apply across all states. Where state law sets a lower cap, we&apos;ll
                automatically enforce it. Your fee won&apos;t exceed the legal limit in any state.
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <section className="space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Base Fees
            </h2>

            <FeeField
              docKind="resale"
              id="resale"
              defs={RESALE_DEFS}
              fallbackLabel="Resale Certificate"
              value={resaleCertificate}
              onChange={setResaleCertificate}
              placeholder="275"
              modalTitle="Resale Certificate - State Limits"
              primaryState={primaryState}
              isSingleState={isSingleState}
              selectedStates={selectedStates}
              isMultiState={isMultiState}
            />

            <FeeField
              docKind="update"
              id="update"
              defs={UPDATE_DEFS}
              fallbackLabel="Resale Certificate Update"
              value={certificateUpdate}
              onChange={setCertificateUpdate}
              placeholder="100"
              modalTitle="Resale Certificate Update - State Limits"
              primaryState={primaryState}
              isSingleState={isSingleState}
              selectedStates={selectedStates}
              isMultiState={isMultiState}
            />

            <FeeField
              docKind="lender"
              id="lender"
              defs={LENDER_DEFS}
              fallbackLabel="Lender Questionnaire"
              value={lenderQuestionnaire}
              onChange={setLenderQuestionnaire}
              placeholder="200"
              modalTitle="Lender Questionnaire - State Limits"
              primaryState={primaryState}
              isSingleState={isSingleState}
              selectedStates={selectedStates}
              isMultiState={isMultiState}
            />

            <FeeField
              docKind="demand"
              id="demand"
              defs={DEMAND_DEFS}
              fallbackLabel="Demand Letter"
              value={demandLetter}
              onChange={setDemandLetter}
              placeholder="250"
              modalTitle="Demand Letter - State Limits"
              primaryState={primaryState}
              isSingleState={isSingleState}
              selectedStates={selectedStates}
              isMultiState={isMultiState}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Standard Turnaround
            </h2>

            <RadioGroup
              value={turnaround}
              onValueChange={(v) => {
                setTurnaround(v);
                if (v !== "custom") setCustomDays("");
              }}
              className="space-y-2"
            >
              {[
                { value: "3", label: "3 business days" },
                { value: "5", label: "5 business days" },
                { value: "7", label: "7 business days" },
                { value: "10", label: "10 business days" },
                { value: "custom", label: "Custom" },
              ].map((opt) => {
                const isRecommended = opt.value === recommendedDays;
                const recommendedTooltip =
                  recommendationSource === "state"
                    ? `Suggested based on the statutory turnaround data we have on file for your state${selectedStates.length > 1 ? "s" : ""}. You can pick a shorter turnaround to promise faster delivery.`
                    : "Default safe recommendation. Most states allow up to 10 business days for standard delivery. You can pick a shorter turnaround if you want to promise faster delivery.";
                return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    turnaround === opt.value
                      ? "border-foreground bg-havn-surface/60"
                      : "border-border hover:bg-havn-surface/30"
                  }`}
                >
                  <RadioGroupItem value={opt.value} id={`turnaround-${opt.value}`} />
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  {isRecommended && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-auto cursor-help rounded-full bg-havn-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-havn-success">
                            Recommended
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[280px] text-xs">
                          {recommendedTooltip}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {opt.value === "custom" && turnaround === "custom" && (
                    <div className="ml-auto flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={customDays}
                        onChange={(e) =>
                          setCustomDays(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))
                        }
                        placeholder="10"
                        className="h-8 w-16 rounded-md border border-border bg-background px-2 text-center text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        business days
                      </span>
                    </div>
                  )}
                </label>
                );
              })}
            </RadioGroup>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rush Options
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional - offer faster delivery for an additional fee
              </p>
            </div>

            <RushStatutoryBanner selectedStates={selectedStates} />

            <RushOptionRow
              id="same-day"
              label="Same day"
              option={rushSameDay}
              onChange={setRushSameDay}
              showCutoff
            />

            <RushOptionRow
              id="next-day"
              label="Next day"
              option={rushNextDay}
              onChange={setRushNextDay}
            />

            <RushOptionRow
              id="three-day"
              label="3-day express"
              option={rushThreeDay}
              onChange={setRushThreeDay}
            />
          </section>

          <div className="rounded-lg border border-border bg-havn-surface/40 px-4 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Looking for add-ons?</span> Once
              you finish setup, you can configure pricing for additional documents like{" "}
              <span className="font-medium text-foreground">Governing Documents</span>,{" "}
              <span className="font-medium text-foreground">Insurance COI</span>, and more in the{" "}
              <span className="font-semibold text-foreground">Pricing</span> tab.
            </p>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? "Saving..." : "Continue"}
            {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
};

const FIELD_TOOLTIPS: Record<string, string> = {
  resale:
    "The primary disclosure package required for most property transfers, detailing the association's financial health, assessments, and compliance status.",
  update:
    "An expedited update to a previously issued Resale Certificate, typically requested when the original has expired or the transaction timeline has changed.",
  lender:
    "A standardized questionnaire used by lenders during the loan underwriting process to assess the financial health and compliance of the association.",
  demand:
    "A formal letter sent to a homeowner detailing outstanding balances, fees, or fines owed to the association - often required before or during a property transfer.",
};

const MULTI_STATE_NAMING_TOOLTIP =
  "Some states use different names for this document (e.g. \"Resale Disclosure\" or \"Estoppel Certificate\"). We'll automatically map your pricing to the correct document name in each state.";

const FeeField = ({
  docKind,
  id,
  defs,
  fallbackLabel,
  value,
  onChange,
  placeholder,
  modalTitle,
  primaryState,
  isSingleState,
  selectedStates,
  isMultiState,
}: {
  docKind: "resale" | "update" | "lender" | "demand";
  id: string;
  defs: StateDocDef[];
  fallbackLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  modalTitle: string;
  primaryState: string;
  isSingleState: boolean;
  selectedStates: string[];
  isMultiState: boolean;
}) => {
  const label = fallbackLabel;

  const tooltip = FIELD_TOOLTIPS[id];
  const hasVariantNames =
    isMultiState &&
    defs.some((d) => selectedStates.includes(d.abbr) && d.localName !== fallbackLabel);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        {tooltip && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {hasVariantNames && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Auto-mapped
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[280px] text-xs">
                {MULTI_STATE_NAMING_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <DollarInput id={id} value={value} onChange={onChange} placeholder={placeholder} />

      <StatutoryCapBanner stateAbbr={primaryState} docKind={docKind} feeStr={value} />

      {!isSingleState ? (
        <MultiStateBanner defs={defs} selectedStates={selectedStates} modalTitle={modalTitle} />
      ) : null}
    </div>
  );
};

const SingleStateBanner = ({
  stateEntry,
  stateName,
  primaryState,
}: {
  stateEntry: StateDocDef | undefined;
  stateName: string;
  primaryState: string;
}) => {
  if (!primaryState) return null;

  const hasLimit = stateEntry?.capType === "fixed" && stateEntry?.limit != null;

  return (
    <div className="rounded-md border border-border bg-havn-surface/40 px-3 py-2.5">
      <div className="flex items-start gap-2">
        {hasLimit ? (
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-havn-success" />
        )}
        <div className="text-xs">
          {hasLimit ? (
            <>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{stateName}</span> caps{" "}
                <span className="font-medium">{stateEntry.localName.toLowerCase()}</span> at{" "}
                <span className="font-semibold text-foreground">{stateEntry.limit}</span>
                {stateEntry.deliveryDays && (
                  <>
                    {" "}
                    · rush period:{" "}
                    <span className="font-medium text-foreground">{stateEntry.deliveryDays}</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-muted-foreground">
                {stateEntry.statute}. Your fee will be automatically capped if it exceeds this
                limit.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{stateName}</span> has no fixed cap on{" "}
              <span className="font-medium">
                {stateEntry?.localName?.toLowerCase() ?? "this document"}
              </span>{" "}
              - fees must reflect actual cost.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const MultiStateBanner = ({
  defs,
  selectedStates,
  modalTitle,
}: {
  defs: StateDocDef[];
  selectedStates: string[];
  modalTitle: string;
}) => {
  const filtered = filterByStates(defs, selectedStates);

  if (filtered.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-havn-surface/40 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="space-y-1.5 text-xs">
          <p className="font-medium text-foreground">
            {filtered.map((s) => `${s.abbr} ${s.limit ?? "actual cost"}`).join(" · ")}
          </p>
          <p className="text-muted-foreground">
            Your fee will automatically cap to each state&apos;s statutory limit where applicable.
          </p>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 transition-colors hover:text-muted-foreground"
              >
                View state limits
                <ExternalLink className="h-3 w-3" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{modalTitle}</DialogTitle>
              </DialogHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead>Local Name</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead>Rush Period</TableHead>
                    <TableHead>Statute</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.abbr}>
                      <TableCell className="font-medium">{s.state}</TableCell>
                      <TableCell className="text-sm">{s.localName}</TableCell>
                      <TableCell>
                        {s.limit ? s.limit : <span className="text-muted-foreground">Actual cost</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.deliveryDays ?? <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.statute}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

type RushBannerRow = {
  state: string;
  rush_threshold_days: number | null;
  rush_definition_note: string | null;
  rush_max_fee: number | null;
  rush_cap: number | null;
  no_rush: boolean | null;
};

const RushStatutoryBanner = ({ selectedStates }: { selectedStates: string[] }) => {
  const [rows, setRows] = useState<RushBannerRow[] | null>(null);

  useEffect(() => {
    if (selectedStates.length === 0) {
      setRows([]);
      return;
    }
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("state_fee_limits")
        .select("state, rush_threshold_days, rush_definition_note, rush_max_fee, rush_cap, no_rush")
        .in("state", selectedStates);
      const byState = new Map<string, RushBannerRow>();
      for (const r of (data ?? []) as RushBannerRow[]) {
        if (!byState.has(r.state)) byState.set(r.state, r);
      }
      setRows(Array.from(byState.values()));
    })();
  }, [selectedStates]);

  if (!rows) return null;

  const first = rows[0];
  const multi = rows.length > 1;
  const noRushStates = rows.filter((r) => r.no_rush);
  const capRows = rows.filter((r) => (r.rush_max_fee ?? r.rush_cap) != null);
  const threshold = first?.rush_threshold_days ?? null;
  const note = first?.rush_definition_note ?? null;

  return (
    <div className="rounded-md border border-border bg-havn-surface/40 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          {noRushStates.length > 0 ? (
            <p>
              <span className="font-medium text-foreground">
                {noRushStates.map((r) => r.state).join(", ")}
              </span>{" "}
              prohibit rush service by statute. Double-check before offering a rush option there.
            </p>
          ) : capRows.length > 0 ? (
            <p>
              Rush fee cap in effect for{" "}
              <span className="font-medium text-foreground">
                {capRows
                  .map(
                    (r) =>
                      `${r.state} ($${Number(r.rush_max_fee ?? r.rush_cap).toFixed(0)})`,
                  )
                  .join(", ")}
              </span>
              . Elsewhere, rush fees aren&rsquo;t capped. Set whatever premium reflects the
              service your team delivers.
            </p>
          ) : (
            <p>
              Rush fees aren&rsquo;t capped by statute{multi ? " in the states you selected" : ""}{" "}
              . Set whatever premium reflects the service your team delivers.
            </p>
          )}
          {!multi && (threshold || note) && (
            <p className="mt-1">
              {threshold && (
                <>
                  Rush in <span className="font-medium text-foreground">{first.state}</span> =
                  delivery within{" "}
                  <span className="font-semibold text-foreground">{threshold} business days</span>
                  {note ? ". " : "."}
                </>
              )}
              {note && <span>{note}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const RushOptionRow = ({
  id,
  label,
  option,
  onChange,
  showCutoff,
}: {
  id: string;
  label: string;
  option: RushOption;
  onChange: (o: RushOption) => void;
  showCutoff?: boolean;
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={option.enabled}
        onCheckedChange={(checked) => onChange({ ...option, enabled: checked === true })}
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">
        {label}
      </Label>
    </div>

    {option.enabled && (
      <div className="ml-7 flex items-center gap-3">
        <div className="flex-1 space-y-1">
          <span className="text-xs text-muted-foreground">Additional fee</span>
          <DollarInput
            id={`${id}-fee`}
            value={option.fee}
            onChange={(v) => onChange({ ...option, fee: v })}
            placeholder="0"
          />
        </div>
        {showCutoff && (
          <div className="w-32 space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Cutoff time</span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Orders placed after this time will be processed as the next tier
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="time"
              value={option.cutoff ?? "14:00"}
              onChange={(e) => onChange({ ...option, cutoff: e.target.value })}
              className="h-11 border-border bg-background text-foreground"
            />
          </div>
        )}
      </div>
    )}
  </div>
);

export default StepFees;
