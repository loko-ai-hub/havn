import { generateText, Output } from "ai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { US_STATES } from "@/lib/us-states";

/* ── Schema ───────────────────────────────────────────────────────────── */

const LegalCheckItem = z.object({
  type: z.enum([
    "current_law",
    "recent_change",
    "pending_legislation",
    "action_needed",
  ]),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  statute_reference: z.string().nullable(),
  effective_date: z.string().nullable(),
  document_type: z.string().nullable(),
  category: z.enum(["fees", "timing", "requirements", "disclosure", "other"]).nullable(),
});

const LegalCheckResultSchema = z.object({
  summary: z.string(),
  changes_detected: z.boolean(),
  risk_level: z.enum(["low", "medium", "high"]),
  items: z.array(LegalCheckItem),
});

/* ── Types ────────────────────────────────────────────────────────────── */

type ServiceRow = {
  master_type_key: string;
  formal_name: string | null;
  pricing_cap: number | null;
  cap_type: string | null;
  rush_cap: number | null;
  no_rush: boolean;
  standard_turnaround: number | null;
  auto_refund_on_miss: boolean;
  statute: string | null;
};

export type CheckResult = { state: string; ok: boolean; error?: string };

/* ── Prompt ────────────────────────────────────────────────────────────── */

function buildPrompt(
  stateAbbr: string,
  stateName: string,
  services: ServiceRow[]
): string {
  const serviceLines = services
    .map((s) => {
      const cap =
        s.pricing_cap != null
          ? `$${s.pricing_cap} (${s.cap_type})`
          : "no fixed cap (actual cost)";
      const rush = s.no_rush
        ? "rush disabled"
        : s.rush_cap != null
        ? `rush cap $${s.rush_cap}`
        : "rush allowed, no cap";
      return `- ${s.formal_name || s.master_type_key}: cap=${cap}, turnaround=${s.standard_turnaround ?? "?"}d, ${rush}, auto-refund=${s.auto_refund_on_miss ? "yes" : "no"}, statute=${s.statute || "none"}`;
    })
    .join("\n");

  return `You are a regulatory compliance analyst for HOA/COA document management in the United States.

Analyze ${stateName} (${stateAbbr}) and produce a concise, actionable compliance report.

Current platform configuration for ${stateAbbr}:
${serviceLines || "(no services configured)"}

INSTRUCTIONS:
- Give a 1-2 sentence executive summary with overall risk level
- Group findings by document type (resale_certificate, lender_questionnaire, certificate_update, demand_letter, etc.)
- For each finding, categorize as: fees, timing, requirements, disclosure, or other
- Focus on what MATTERS: fee cap changes, turnaround deadline changes, new disclosure requirements, pending legislation that could affect pricing
- Keep it to 3-5 key items maximum — synthesize, don't enumerate every statute
- Only flag action_needed if the current configuration shown above is actually wrong or at risk
- If you are not aware of recent changes, say "No changes identified" — do not speculate
- Set changes_detected to true ONLY if there is something the operator should review or update

Each item must include document_type (which document it relates to, e.g. "resale_certificate") and category (fees/timing/requirements/disclosure/other).`;
}

/* ── Core check function ──────────────────────────────────────────────── */

export async function runLegalChecks(
  singleState?: string | null
): Promise<{ results: CheckResult[] }> {
  const admin = createAdminClient();
  const stateNameMap = new Map(US_STATES.map((s) => [s.abbr, s.name]));

  let query = admin
    .from("state_fee_limits")
    .select(
      "state, master_type_key, formal_name, pricing_cap, cap_type, rush_cap, no_rush, standard_turnaround, auto_refund_on_miss, statute"
    )
    .eq("state_enabled", true);

  if (singleState) {
    query = query.eq("state", singleState.toUpperCase());
  }

  const { data: rows, error: loadError } = await query.order("state");

  if (loadError) {
    return { results: [{ state: singleState ?? "ALL", ok: false, error: loadError.message }] };
  }

  const grouped = new Map<string, ServiceRow[]>();
  for (const row of rows ?? []) {
    const st = (row.state as string).toUpperCase();
    if (!grouped.has(st)) grouped.set(st, []);
    grouped.get(st)!.push(row as unknown as ServiceRow);
  }

  const states = [...grouped.keys()];
  if (states.length === 0) {
    return { results: [] };
  }

  const modelId = "anthropic/claude-opus-4.7";
  const results: CheckResult[] = [];

  for (const st of states) {
    const services = grouped.get(st)!;
    const stateName = stateNameMap.get(st) ?? st;

    try {
      const { output } = await generateText({
        model: modelId,
        output: Output.object({ schema: LegalCheckResultSchema }),
        system:
          "You are a legal compliance analyst. Respond with structured data only. Be factual and cite specific statutes. If uncertain, say so.",
        prompt: buildPrompt(st, stateName, services),
      });

      if (!output) {
        results.push({ state: st, ok: false, error: "No output from model" });
        continue;
      }

      const { error: insertError } = await admin
        .from("state_legal_checks")
        .insert({
          state: st,
          model_used: modelId,
          summary: output.summary,
          changes_detected: output.changes_detected,
          details: output.items,
        });

      if (insertError) {
        console.error(`[legal-check] Insert failed for ${st}:`, insertError.message);
        results.push({ state: st, ok: false, error: insertError.message });
      } else {
        results.push({ state: st, ok: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[legal-check] AI call failed for ${st}:`, msg);
      results.push({ state: st, ok: false, error: msg });
    }
  }

  return { results };
}
