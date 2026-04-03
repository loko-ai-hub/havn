"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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

const DOC_ROWS: { key: FeeSaveRow["document_type"]; label: string }[] = [
  { key: "resale_certificate", label: "Resale Certificate" },
  { key: "certificate_update", label: "Certificate Update" },
  { key: "lender_questionnaire", label: "Lender Questionnaire" },
  { key: "demand_letter", label: "Demand Letter" },
];

type EditableFee = {
  document_type: FeeSaveRow["document_type"];
  base_fee: string;
  rush_same_day_fee: string | null;
  rush_next_day_fee: string | null;
  rush_3day_fee: string | null;
  standard_turnaround_days: string;
};

function toEditable(row: FeeSaveRow): EditableFee {
  return {
    document_type: row.document_type as EditableFee["document_type"],
    base_fee: String(row.base_fee ?? 0),
    rush_same_day_fee: row.rush_same_day_fee == null ? null : String(row.rush_same_day_fee),
    rush_next_day_fee: row.rush_next_day_fee == null ? null : String(row.rush_next_day_fee),
    rush_3day_fee: row.rush_3day_fee == null ? null : String(row.rush_3day_fee),
    standard_turnaround_days: String(row.standard_turnaround_days ?? 10),
  };
}

function parseRequiredMoney(s: string): number {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return n;
}

function parseDays(s: string): number {
  const n = Number.parseInt(s, 10);
  if (Number.isNaN(n) || n < 1) return 1;
  return n;
}

async function resolveOrgId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let orgId: string | null =
    typeof user.user_metadata?.organization_id === "string" ? user.user_metadata.organization_id : null;
  if (!orgId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    orgId = profile?.organization_id ?? null;
  }
  return orgId;
}

export default function DashboardPricingPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableFee[] | null>(null);
  const [pending, startTransition] = useTransition();

  const loadFees = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const supabase = createClient();
    const oid = await resolveOrgId(supabase);
    setOrgId(oid);
    if (!oid) {
      setLoadError("No organization linked to this account.");
      setRows(null);
      setLoading(false);
      return;
    }

    const keys = DOC_ROWS.map((r) => r.key);
    const { data, error } = await supabase
      .from("document_request_fees")
      .select(
        "document_type, base_fee, rush_same_day_fee, rush_next_day_fee, rush_3day_fee, standard_turnaround_days"
      )
      .eq("organization_id", oid)
      .in("document_type", keys);

    if (error) {
      setLoadError(error.message);
      setRows(null);
      setLoading(false);
      return;
    }

    const map = new Map((data ?? []).map((r) => [r.document_type as string, r]));
    const haveAll = keys.every((k) => map.has(k));

    if (!haveAll || (data?.length ?? 0) === 0) {
      setRows(null);
      setLoading(false);
      return;
    }

    const ordered: EditableFee[] = keys.map((key) => {
      const r = map.get(key)!;
      return toEditable({
        document_type: key,
        base_fee: Number(r.base_fee ?? 0),
        rush_same_day_fee: r.rush_same_day_fee as number | null,
        rush_next_day_fee: r.rush_next_day_fee as number | null,
        rush_3day_fee: r.rush_3day_fee as number | null,
        standard_turnaround_days: Number(r.standard_turnaround_days ?? 10),
      });
    });
    setRows(ordered);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFees();
  }, [loadFees]);

  const emptyState = useMemo(() => !loading && orgId && rows === null && !loadError, [loading, orgId, rows, loadError]);

  const handleConfigureDefaults = () => {
    if (!orgId) return;
    startTransition(async () => {
      const result = await configureDefaultFees(orgId!);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Default pricing configured.");
      await loadFees();
    });
  };

  const handleSave = () => {
    if (!orgId || !rows) return;
    const payload: FeeSaveRow[] = rows.map((e) => ({
      document_type: e.document_type,
      base_fee: parseRequiredMoney(e.base_fee),
      rush_same_day_fee: e.rush_same_day_fee == null ? null : parseRequiredMoney(e.rush_same_day_fee),
      rush_next_day_fee: e.rush_next_day_fee == null ? null : parseRequiredMoney(e.rush_next_day_fee),
      rush_3day_fee: e.rush_3day_fee == null ? null : parseRequiredMoney(e.rush_3day_fee),
      standard_turnaround_days: parseDays(e.standard_turnaround_days),
    }));

    startTransition(async () => {
      const result = await saveFees(orgId, payload);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Pricing saved.");
      await loadFees();
    });
  };

  function updateRow(index: number, patch: Partial<EditableFee>) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function RushCell({
    value,
    onEnable,
    onChange,
    disabled,
  }: {
    value: string | null;
    onEnable: () => void;
    onChange: (v: string) => void;
    disabled: boolean;
  }) {
    if (value === null) {
      return (
        <div className="flex min-w-[100px] items-center gap-2">
          <span className="text-muted-foreground">—</span>
          <Button type="button" variant="link" className="h-auto px-0 text-xs" disabled={disabled} onClick={onEnable}>
            Enable
          </Button>
        </div>
      );
    }
    return (
      <Input
        type="number"
        min={0}
        step="0.01"
        className="h-9 min-w-[100px] bg-background tabular-nums"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure document fees and turnaround for your portal.</p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pricing…</p>
      ) : emptyState ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-foreground">Set up your pricing</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            You haven&apos;t configured fees for this organization yet. Start with sensible defaults, then adjust
            to match your management agreement and state caps.
          </p>
          <Button type="button" className="mt-6" disabled={pending || !orgId} onClick={handleConfigureDefaults}>
            Configure Fees
          </Button>
        </div>
      ) : rows ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="border-border bg-havn-surface/30 hover:bg-havn-surface/30">
                  <TableHead className="text-muted-foreground">Document Type</TableHead>
                  <TableHead className="text-muted-foreground">Base Fee</TableHead>
                  <TableHead className="text-muted-foreground">Rush — Same Day</TableHead>
                  <TableHead className="text-muted-foreground">Rush — Next Day</TableHead>
                  <TableHead className="text-muted-foreground">Rush — 3 Day</TableHead>
                  <TableHead className="text-muted-foreground">Standard Turnaround (days)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={row.document_type} className="border-border hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">
                      {DOC_ROWS.find((d) => d.key === row.document_type)?.label ?? row.document_type}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9 w-[110px] bg-background tabular-nums"
                        value={row.base_fee}
                        disabled={pending}
                        onChange={(e) => updateRow(i, { base_fee: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <RushCell
                        value={row.rush_same_day_fee}
                        disabled={pending}
                        onEnable={() => updateRow(i, { rush_same_day_fee: "0" })}
                        onChange={(v) => updateRow(i, { rush_same_day_fee: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <RushCell
                        value={row.rush_next_day_fee}
                        disabled={pending}
                        onEnable={() => updateRow(i, { rush_next_day_fee: "0" })}
                        onChange={(v) => updateRow(i, { rush_next_day_fee: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <RushCell
                        value={row.rush_3day_fee}
                        disabled={pending}
                        onEnable={() => updateRow(i, { rush_3day_fee: "0" })}
                        onChange={(v) => updateRow(i, { rush_3day_fee: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="h-9 w-[100px] bg-background tabular-nums"
                        value={row.standard_turnaround_days}
                        disabled={pending}
                        onChange={(e) => updateRow(i, { standard_turnaround_days: e.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button type="button" disabled={pending} onClick={handleSave}>
            {pending ? "Saving…" : "Save Changes"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
