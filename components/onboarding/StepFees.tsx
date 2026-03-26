"use client";

import { useState, useMemo } from "react";
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
  const [turnaround, setTurnaround] = useState("5");
  const [customDays, setCustomDays] = useState("");
  const [showPricingTip, setShowPricingTip] = useState(true);
  const [showMultiStateTip, setShowMultiStateTip] = useState(true);

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

  const primaryHasCap = RESALE_DEFS.some((l) => l.abbr === primaryState && l.capType === "fixed");

  return (
    <div className="flex h-full justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Set your fees</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure pricing for resale documents and turnaround options.
          </p>
          {showPricingTip && (
            <div className="relative mt-4 rounded-lg border border-accent bg-accent/20 px-4 py-3 pr-9">
              <button
                type="button"
                onClick={() => setShowPricingTip(false)}
                className="absolute top-2 right-2 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {primaryHasCap ? (
                  isSingleState ? (
                    <>
                      <span className="font-semibold text-foreground">Pricing tip:</span> Your
                      statutory cap is the legal ceiling - any fee at or below it is compliant.
                      That said, most management companies price{" "}
                      <span className="font-semibold text-foreground">10-20% below the cap</span>{" "}
                      to stay competitive and keep homeowner trust. You have full flexibility
                      within that range.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground">Pricing tip:</span> Your
                      statutory cap is the legal ceiling - any fee at or below it is compliant.
                      That said, most management companies price{" "}
                      <span className="font-semibold text-foreground">10-20% below the cap</span>{" "}
                      to stay competitive in multi-state markets. You have full flexibility within
                      that range.
                    </>
                  )
                ) : (
                  <>
                    <span className="font-semibold text-foreground">Pricing tip:</span> This state
                    has no fixed cap - fees must reflect your actual cost to produce the document.
                    Pricing significantly above your direct costs creates legal exposure. Our
                    default is benchmarked to typical market rates as a starting point.
                  </>
                )}
              </p>
            </div>
          )}
          {isMultiState && showMultiStateTip && (
            <div className="relative mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 pr-9">
              <button
                type="button"
                onClick={() => setShowMultiStateTip(false)}
                className="absolute top-2 right-2 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Multi-state pricing:</span> The
                fees you set here will apply as defaults across all your states. If you&apos;d like to
                set <span className="font-medium text-foreground">state-specific pricing</span>,
                you can do that after onboarding in the{" "}
                <span className="font-semibold text-foreground">Pricing</span> tab.
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
              id="resale"
              defs={RESALE_DEFS}
              fallbackLabel="Resale Certificate"
              value={resaleCertificate}
              onChange={setResaleCertificate}
              placeholder="275"
              modalTitle="Resale Certificate - State Limits"
              primaryState={primaryState}
              stateName={stateName}
              isSingleState={isSingleState}
              selectedStates={selectedStates}
              isMultiState={isMultiState}
            />

            <FeeField
              id="update"
              defs={UPDATE_DEFS}
              fallbackLabel="Resale Certificate Update"
              value={certificateUpdate}
              onChange={setCertificateUpdate}
              placeholder="100"
              modalTitle="Resale Certificate Update - State Limits"
              primaryState={primaryState}
              stateName={stateName}
              isSingleState={isSingleState}
              selectedStates={selectedStates}
              isMultiState={isMultiState}
            />

            <FeeField
              id="lender"
              defs={LENDER_DEFS}
              fallbackLabel="Lender Questionnaire"
              value={lenderQuestionnaire}
              onChange={setLenderQuestionnaire}
              placeholder="200"
              modalTitle="Lender Questionnaire - State Limits"
              primaryState={primaryState}
              stateName={stateName}
              isSingleState={isSingleState}
              selectedStates={selectedStates}
              isMultiState={isMultiState}
            />

            <FeeField
              id="demand"
              defs={DEMAND_DEFS}
              fallbackLabel="Demand Letter"
              value={demandLetter}
              onChange={setDemandLetter}
              placeholder="250"
              modalTitle="Demand Letter - State Limits"
              primaryState={primaryState}
              stateName={stateName}
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
                { value: "5", label: "5 business days", recommended: true },
                { value: "7", label: "7 business days" },
                {
                  value: "10",
                  label: "10 business days",
                  badge: "State minimum",
                  badgeTooltip:
                    "Many states set a statutory floor for standard delivery - typically 10 business days. Setting your turnaround at or above this ensures compliance across all your operating states.",
                },
                { value: "custom", label: "Custom" },
              ].map((opt) => (
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
                  {opt.recommended && (
                    <span className="ml-auto rounded-full bg-havn-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-havn-success">
                      Recommended
                    </span>
                  )}
                  {opt.badge && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-auto cursor-help rounded-full bg-accent/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {opt.badge}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[280px] text-xs">
                          {opt.badgeTooltip}
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
              ))}
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

            {isSingleState ? (
              <SingleStateBanner
                stateEntry={RUSH_DEFS.find((l) => l.abbr === primaryState)}
                stateName={stateName}
                primaryState={primaryState}
              />
            ) : (
              <MultiStateBanner defs={RUSH_DEFS} selectedStates={selectedStates} modalTitle="Rush Fees - State Limits" />
            )}

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
              showCutoff
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
  id,
  defs,
  fallbackLabel,
  value,
  onChange,
  placeholder,
  modalTitle,
  primaryState,
  stateName,
  isSingleState,
  selectedStates,
  isMultiState,
}: {
  id: string;
  defs: StateDocDef[];
  fallbackLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  modalTitle: string;
  primaryState: string;
  stateName: string;
  isSingleState: boolean;
  selectedStates: string[];
  isMultiState: boolean;
}) => {
  const stateEntry = defs.find((l) => l.abbr === primaryState);
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

      {isSingleState ? (
        <SingleStateBanner stateEntry={stateEntry} stateName={stateName} primaryState={primaryState} />
      ) : (
        <MultiStateBanner defs={defs} selectedStates={selectedStates} modalTitle={modalTitle} />
      )}
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
                    Orders placed after this time will be processed as the next tier. For example,
                    a same-day order placed after the cutoff becomes next-day.
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
