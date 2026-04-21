"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronDown, DollarSign, MapPin, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { US_STATES } from "@/lib/us-states";

import {
  configureDefaultFees,
  loadFees,
  saveFees,
  type FeeSaveRow,
} from "./actions";
import { DEFAULT_FEES, DOC_ROWS } from "./pricing-constants";
import { loadStateCaps } from "../../god-mode/actions";
import { loadEnabledStates } from "@/lib/enabled-states-action";

const PRICING_TIP_KEY = "havn_pricing_tip_dismissed";

type CapInfo = { pricing_cap: number | null; cap_type: string; statute: string };


type EditableFee = {
  master_type_key: FeeSaveRow["master_type_key"];
  base_fee: string;
  rush_same_day_fee: string | null;
  rush_next_day_fee: string | null;
  rush_3day_fee: string | null;
  standard_turnaround_days: string;
};

function toEditable(row: FeeSaveRow): EditableFee {
  return {
    master_type_key: row.master_type_key,
    base_fee: String(row.base_fee ?? 0),
    rush_same_day_fee: row.rush_same_day_fee == null ? null : String(row.rush_same_day_fee),
    rush_next_day_fee: row.rush_next_day_fee == null ? null : String(row.rush_next_day_fee),
    rush_3day_fee: row.rush_3day_fee == null ? null : String(row.rush_3day_fee),
    standard_turnaround_days: String(row.standard_turnaround_days ?? 10),
  };
}

function parseRequiredMoney(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function parseDays(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function CapBanner({ fee, capInfo }: { fee: number; capInfo: CapInfo | undefined }) {
  if (!capInfo) return null;
  if (capInfo.pricing_cap == null) {
    return <p className="mt-1 text-[11px] text-muted-foreground">Actual cost — no fixed cap.</p>;
  }
  const statute = capInfo.statute ? ` (${capInfo.statute})` : "";
  if (fee > capInfo.pricing_cap) {
    return <p className="mt-1 text-[11px] font-medium text-destructive">Exceeds cap of {formatMoney(capInfo.pricing_cap)}{statute}.</p>;
  }
  return <p className="mt-1 text-[11px] font-medium text-havn-success">Within cap of {formatMoney(capInfo.pricing_cap)}{statute}.</p>;
}

function MoneyInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
      <Input
        type="number"
        min={0}
        step="1"
        className="h-9 w-[110px] bg-background pl-6 tabular-nums"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function RushCell({ value, onEnable, onDisable, onChange, disabled }: {
  value: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  if (value === null) {
    return (
      <button type="button" className="text-xs text-havn-navy underline-offset-2 hover:underline disabled:opacity-40" disabled={disabled} onClick={onEnable}>
        Enable
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <MoneyInput value={value} onChange={onChange} disabled={disabled} />
      <button
        type="button"
        title="Disable this rush tier"
        disabled={disabled}
        onClick={onDisable}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// State selector with add-state dropdown
function StateSelector({
  selectedState,
  configuredStates,
  enabledStates,
  onSelect,
  onAdd,
  disabled,
}: {
  selectedState: string;
  configuredStates: string[];
  enabledStates: Set<string>;
  onSelect: (state: string) => void;
  onAdd: (state: string) => void;
  disabled: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const stateName = (abbr: string) => US_STATES.find((s) => s.abbr === abbr)?.name ?? abbr;

  const unconfiguredStates = US_STATES.filter(
    (s) => !configuredStates.includes(s.abbr) && enabledStates.has(s.abbr)
  ).filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.abbr.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Configured state tabs */}
      {configuredStates.map((abbr) => (
        <button
          key={abbr}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(abbr)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
            selectedState === abbr
              ? "border-havn-navy bg-havn-navy text-white"
              : "border-border bg-background text-foreground hover:bg-muted"
          }`}
        >
          <MapPin className="h-3 w-3" />
          {abbr}
          <span className="hidden sm:inline text-xs opacity-70">— {stateName(abbr)}</span>
        </button>
      ))}

      {/* Add state button */}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setAddOpen((o) => !o); setSearch(""); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add state
          <ChevronDown className="h-3 w-3" />
        </button>

        {addOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-background shadow-lg">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder="Search states…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-havn-navy/20"
              />
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {unconfiguredStates.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No states found</p>
              ) : (
                unconfiguredStates.map((s) => (
                  <button
                    key={s.abbr}
                    type="button"
                    onClick={() => {
                      onAdd(s.abbr);
                      setAddOpen(false);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
                  >
                    <span className="w-8 font-mono text-xs font-semibold text-muted-foreground">{s.abbr}</span>
                    {s.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPricingPage() {
  const [selectedState, setSelectedState] = useState("");
  const [configuredStates, setConfiguredStates] = useState<string[]>([]);
  const [orgPrimaryState, setOrgPrimaryState] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableFee[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [showTip, setShowTip] = useState(true);
  const [stateCaps, setStateCaps] = useState<Record<string, CapInfo>>({});
  const [enabledStates, setEnabledStates] = useState<Set<string>>(new Set());

  const fetchFees = useCallback(async (state: string) => {
    if (!state) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [result, capsResult] = await Promise.all([
        loadFees(state),
        loadStateCaps(state),
      ]);
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      if (!("error" in capsResult)) {
        setStateCaps(capsResult.caps);
      } else {
        setStateCaps({});
      }
      setConfiguredStates(result.configuredStates);
      setOrgPrimaryState(result.orgPrimaryState);
      if (!result.fees) {
        setRows(null);
        setLoading(false);
        return;
      }
      const map = new Map(result.fees.map((r) => [r.master_type_key, r]));
      const ordered: EditableFee[] = DOC_ROWS.map(({ key }) => {
        const r = map.get(key);
        if (r) return toEditable(r);
        return toEditable(DEFAULT_FEES.find((d) => d.master_type_key === key)!);
      });
      setRows(ordered);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load pricing data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: load state list from communities + enabled states, then auto-select first state
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [result, enabled] = await Promise.all([
          loadFees(""),
          loadEnabledStates(),
        ]);
        setEnabledStates(new Set(enabled));
        if ("error" in result) {
          setLoadError(result.error);
          setLoading(false);
          return;
        }
        setConfiguredStates(result.configuredStates);
        setOrgPrimaryState(result.orgPrimaryState);
        const autoSelect = result.configuredStates[0] ?? result.orgPrimaryState;
        if (autoSelect) {
          setSelectedState(autoSelect);
          await fetchFees(autoSelect);
        } else {
          setLoading(false);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load pricing.");
        setLoading(false);
      }
    };
    void init();
  }, [fetchFees]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(PRICING_TIP_KEY) === "1") setShowTip(false);
    } catch { /* ignore */ }
  }, []);

  const handleSelectState = (state: string) => {
    setSelectedState(state);
    setRows(null);
    void fetchFees(state);
  };

  const handleAddState = (state: string) => {
    if (!configuredStates.includes(state)) {
      setConfiguredStates((prev) => [...prev, state].sort());
    }
    handleSelectState(state);
  };

  function updateRow(index: number, patch: Partial<EditableFee>) {
    setRows((prev) => { if (!prev) return prev; const next = [...prev]; next[index] = { ...next[index], ...patch }; return next; });
  }

  const handleConfigureDefaults = () => {
    if (!selectedState) return;
    startTransition(async () => {
      const result = await configureDefaultFees(selectedState);
      if (result && "error" in result && result.error) { toast.error(result.error); return; }
      toast.success(`Default pricing configured for ${selectedState}.`);
      await fetchFees(selectedState);
    });
  };

  const handleSave = () => {
    if (!rows || !selectedState) return;
    const payload: FeeSaveRow[] = rows.map((e) => ({
      master_type_key: e.master_type_key,
      base_fee: parseRequiredMoney(e.base_fee),
      rush_same_day_fee: e.rush_same_day_fee == null ? null : parseRequiredMoney(e.rush_same_day_fee),
      rush_next_day_fee: e.rush_next_day_fee == null ? null : parseRequiredMoney(e.rush_next_day_fee),
      rush_3day_fee: e.rush_3day_fee == null ? null : parseRequiredMoney(e.rush_3day_fee),
      standard_turnaround_days: parseDays(e.standard_turnaround_days),
    }));
    startTransition(async () => {
      const result = await saveFees(payload, selectedState);
      if (result && "error" in result && result.error) { toast.error(result.error); return; }
      toast.success(`Pricing saved for ${selectedState}.`);
      await fetchFees(selectedState);
    });
  };

  const emptyState = !loading && selectedState && rows === null && !loadError;
  const noStateSelected = !loading && !selectedState && !loadError;
  const stateName = US_STATES.find((s) => s.abbr === selectedState)?.name ?? selectedState;

  return (
    <div className="space-y-6">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Pricing</h1>
          </div>
          {rows && selectedState && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={handleConfigureDefaults}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to defaults
              </button>
              <Button type="button" disabled={pending} onClick={handleSave}>
                {pending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          )}
        </div>

        {/* State selector row */}
        <div className="mt-3">
          <StateSelector
            selectedState={selectedState}
            configuredStates={configuredStates}
            enabledStates={enabledStates}
            onSelect={handleSelectState}
            onAdd={handleAddState}
            disabled={pending}
          />
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pricing…</p>
      ) : noStateSelected ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-havn-navy/10 mb-4">
            <MapPin className="h-6 w-6 text-havn-navy" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Select a state to start</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Use the <span className="font-medium">Add state</span> button above to configure pricing for each state you operate in.
          </p>
        </div>
      ) : emptyState ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-havn-navy/10 mb-4">
            <DollarSign className="h-6 w-6 text-havn-navy" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No pricing set for {stateName}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Start with sensible defaults, then adjust to match your management agreement and {selectedState} statutory caps.
          </p>
          <Button type="button" className="mt-6" disabled={pending} onClick={handleConfigureDefaults}>
            Configure {selectedState} Fees
          </Button>
        </div>
      ) : rows ? (
        <div className="space-y-4">
          {showTip && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-havn-amber/40 bg-havn-amber/10 px-4 py-3 text-sm text-foreground">
              <p>Prices shown are for <strong>{stateName}</strong>. Where state law sets a lower cap, Havn automatically enforces it at order time.</p>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                onClick={() => {
                  setShowTip(false);
                  try { localStorage.setItem(PRICING_TIP_KEY, "1"); } catch { /* ignore */ }
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className="border-border bg-havn-navy/5 hover:bg-havn-navy/5">
                  <TableHead className="text-havn-navy font-semibold">Document Type</TableHead>
                  <TableHead className="text-havn-navy font-semibold">Base Fee</TableHead>
                  <TableHead className="text-havn-navy font-semibold">Rush — Same Day</TableHead>
                  <TableHead className="text-havn-navy font-semibold">Rush — Next Day</TableHead>
                  <TableHead className="text-havn-navy font-semibold">Rush — 3 Day</TableHead>
                  <TableHead className="text-havn-navy font-semibold">Turnaround (days)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => {
                  const docRow = DOC_ROWS.find((d) => d.key === row.master_type_key);
                  return (
                    <TableRow key={row.master_type_key} className="border-border hover:bg-muted/30 align-top">
                      <TableCell className="py-4">
                        <p className="font-medium text-foreground">{docRow?.label ?? row.master_type_key}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{docRow?.description}</p>
                      </TableCell>
                      <TableCell className="py-4">
                        <MoneyInput
                          value={row.base_fee}
                          disabled={pending}
                          onChange={(v) => updateRow(i, { base_fee: v })}
                        />
                        <CapBanner fee={parseRequiredMoney(row.base_fee)} capInfo={stateCaps[row.master_type_key]} />
                      </TableCell>
                      <TableCell className="py-4">
                        <RushCell
                          value={row.rush_same_day_fee}
                          disabled={pending}
                          onEnable={() => updateRow(i, { rush_same_day_fee: "0" })}
                          onDisable={() => updateRow(i, { rush_same_day_fee: null })}
                          onChange={(v) => updateRow(i, { rush_same_day_fee: v })}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <RushCell
                          value={row.rush_next_day_fee}
                          disabled={pending}
                          onEnable={() => updateRow(i, { rush_next_day_fee: "0" })}
                          onDisable={() => updateRow(i, { rush_next_day_fee: null })}
                          onChange={(v) => updateRow(i, { rush_next_day_fee: v })}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <RushCell
                          value={row.rush_3day_fee}
                          disabled={pending}
                          onEnable={() => updateRow(i, { rush_3day_fee: "0" })}
                          onDisable={() => updateRow(i, { rush_3day_fee: null })}
                          onChange={(v) => updateRow(i, { rush_3day_fee: v })}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          className="h-9 w-[80px] bg-background tabular-nums"
                          value={row.standard_turnaround_days}
                          disabled={pending}
                          onChange={(e) => updateRow(i, { standard_turnaround_days: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Where state law sets a lower cap than your base fee, Havn automatically enforces it at order time.
          </p>
        </div>
      ) : null}
    </div>
  );
}
