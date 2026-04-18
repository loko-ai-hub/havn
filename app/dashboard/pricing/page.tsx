"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { DollarSign, RotateCcw, X } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";

import { configureDefaultFees, saveFees, type FeeSaveRow } from "./actions";

const PRICING_TIP_KEY = "havn_pricing_tip_dismissed";

const STATE_FEE_CAPS: Record<string, { resale?: number; update?: number; statute?: string }> = {
  WA: { resale: 275, update: 100, statute: "RCW 64.90.640" },
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

const DOC_ROWS: { key: FeeSaveRow["master_type_key"]; label: string; description: string }[] = [
  { key: "resale_certificate", label: "Resale Certificate", description: "Full HOA disclosure packet" },
  { key: "certificate_update", label: "Certificate Update", description: "Update to a prior certificate" },
  { key: "lender_questionnaire", label: "Lender Questionnaire", description: "Lender/mortgage info package" },
  { key: "demand_letter", label: "Demand Letter", description: "Account balance demand statement" },
];

type EditableFee = {
  master_type_key: FeeSaveRow["master_type_key"];
  base_fee: string;
  rush_same_day_fee: string | null;
  rush_next_day_fee: string | null;
  rush_3day_fee: string | null;
  standard_turnaround_days: string;
};

const DEFAULT_FEES: FeeSaveRow[] = [
  { master_type_key: "resale_certificate",  base_fee: 250, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "certificate_update",  base_fee: 75,  rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "lender_questionnaire",base_fee: 150, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "demand_letter",       base_fee: 100, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
];

function toEditable(row: FeeSaveRow): EditableFee {
  return {
    master_type_key: row.master_type_key as EditableFee["master_type_key"],
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

function CapBanner({ state, documentType, fee }: { state: string; documentType: string; fee: number }) {
  const st = state.trim().toUpperCase();
  if (!st) return <p className="mt-1 text-[11px] text-muted-foreground">Set your state in Settings to see statutory guidance.</p>;

  const caps = STATE_FEE_CAPS[st];
  if (!caps) return <p className="mt-1 text-[11px] text-muted-foreground">{st}: fees must reflect actual cost.</p>;

  const capAmount = documentType === "resale_certificate" ? caps.resale : documentType === "certificate_update" ? caps.update : undefined;
  if (capAmount == null) return <p className="mt-1 text-[11px] text-muted-foreground">No fixed cap for this type in {st}.</p>;

  const statute = caps.statute ? ` (${caps.statute})` : "";
  if (fee > capAmount) {
    return <p className="mt-1 text-[11px] font-medium text-destructive">Exceeds {st} cap of {formatMoney(capAmount)}{statute}.</p>;
  }
  return <p className="mt-1 text-[11px] font-medium text-havn-success">Within {st} cap of {formatMoney(capAmount)}{statute}.</p>;
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

async function resolveOrgId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let orgId: string | null = typeof user.user_metadata?.organization_id === "string" ? user.user_metadata.organization_id : null;
  if (!orgId) {
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    orgId = profile?.organization_id ?? null;
  }
  return orgId;
}

export default function DashboardPricingPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgState, setOrgState] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableFee[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [showTip, setShowTip] = useState(true);

  const loadFees = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const supabase = createClient();
    const oid = await resolveOrgId(supabase);
    setOrgId(oid);
    if (!oid) {
      setLoadError("No organization linked to this account.");
      setLoading(false);
      return;
    }

    const [orgRes, feesRes] = await Promise.all([
      supabase.from("organizations").select("state").eq("id", oid).single(),
      supabase.from("document_request_fees")
        .select("master_type_key, base_fee, rush_same_day_fee, rush_next_day_fee, rush_3day_fee, standard_turnaround_days")
        .eq("organization_id", oid)
        .in("master_type_key", DOC_ROWS.map((r) => r.key)),
    ]);

    setOrgState(typeof orgRes.data?.state === "string" ? orgRes.data.state : "");

    if (feesRes.error) {
      setLoadError(feesRes.error.message);
      setLoading(false);
      return;
    }

    const map = new Map((feesRes.data ?? []).map((r) => [r.master_type_key as string, r]));

    // If no fees at all, show empty state
    if (map.size === 0) {
      setRows(null);
      setLoading(false);
      return;
    }

    // Merge DB rows with defaults for any missing doc types
    const ordered: EditableFee[] = DOC_ROWS.map(({ key }) => {
      const r = map.get(key);
      if (r) {
        return toEditable({
          master_type_key: key,
          base_fee: Number(r.base_fee ?? 0),
          rush_same_day_fee: r.rush_same_day_fee as number | null,
          rush_next_day_fee: r.rush_next_day_fee as number | null,
          rush_3day_fee: r.rush_3day_fee as number | null,
          standard_turnaround_days: Number(r.standard_turnaround_days ?? 10),
        });
      }
      // Fall back to defaults for missing doc types
      const def = DEFAULT_FEES.find((d) => d.master_type_key === key)!;
      return toEditable(def);
    });

    setRows(ordered);
    setLoading(false);
  }, []);

  useEffect(() => { void loadFees(); }, [loadFees]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(PRICING_TIP_KEY) === "1") setShowTip(false);
    } catch { /* ignore */ }
  }, []);

  const emptyState = useMemo(() => !loading && orgId && rows === null && !loadError, [loading, orgId, rows, loadError]);

  function updateRow(index: number, patch: Partial<EditableFee>) {
    setRows((prev) => { if (!prev) return prev; const next = [...prev]; next[index] = { ...next[index], ...patch }; return next; });
  }

  const handleConfigureDefaults = () => {
    if (!orgId) return;
    startTransition(async () => {
      const result = await configureDefaultFees(orgId!);
      if (result && "error" in result && result.error) { toast.error(result.error); return; }
      toast.success("Default pricing configured.");
      await loadFees();
    });
  };

  const handleSave = () => {
    if (!orgId || !rows) return;
    const payload: FeeSaveRow[] = rows.map((e) => ({
      master_type_key: e.master_type_key,
      base_fee: parseRequiredMoney(e.base_fee),
      rush_same_day_fee: e.rush_same_day_fee == null ? null : parseRequiredMoney(e.rush_same_day_fee),
      rush_next_day_fee: e.rush_next_day_fee == null ? null : parseRequiredMoney(e.rush_next_day_fee),
      rush_3day_fee: e.rush_3day_fee == null ? null : parseRequiredMoney(e.rush_3day_fee),
      standard_turnaround_days: parseDays(e.standard_turnaround_days),
    }));
    startTransition(async () => {
      const result = await saveFees(orgId, payload);
      if (result && "error" in result && result.error) { toast.error(result.error); return; }
      toast.success("Pricing saved.");
      await loadFees();
    });
  };

  return (
    <div className="space-y-6">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Pricing</h1>
          </div>
          {rows && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending || !orgId}
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
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pricing…</p>
      ) : emptyState ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-havn-navy/10 mb-4">
            <DollarSign className="h-6 w-6 text-havn-navy" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Set up your pricing</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            You haven&apos;t configured fees yet. Start with sensible defaults, then adjust to match your management agreement and state caps.
          </p>
          <Button type="button" className="mt-6" disabled={pending || !orgId} onClick={handleConfigureDefaults}>
            Configure Fees
          </Button>
        </div>
      ) : rows ? (
        <div className="space-y-4">
          {showTip && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-havn-amber/40 bg-havn-amber/10 px-4 py-3 text-sm text-foreground">
              <p>Most management companies in {orgState.trim() || "your state"} charge $200–$300 for resale certificates.</p>
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
                        <CapBanner state={orgState} documentType={row.master_type_key} fee={parseRequiredMoney(row.base_fee)} />
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
