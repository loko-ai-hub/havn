import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { US_STATES } from "@/lib/us-states";

/* ── Schema for Claude's structured response ──────────────────────────── */

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
});

const LegalCheckResult = z.object({
  summary: z.string(),
  changes_detected: z.boolean(),
  items: z.array(LegalCheckItem),
});

/* ── Build prompt for a state ─────────────────────────────────────────── */

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

function buildPrompt(
  stateAbbr: string,
  stateName: string,
  services: ServiceRow[]
): string {
  const serviceLines = services
    .map((s) => {
      const cap =
        s.pricing_cap != null ? `$${s.pricing_cap} (${s.cap_type})` : "no fixed cap (actual cost)";
      const rush = s.no_rush
        ? "rush disabled"
        : s.rush_cap != null
        ? `rush cap $${s.rush_cap}`
        : "rush allowed, no cap";
      return `- ${s.formal_name || s.master_type_key}: cap=${cap}, turnaround=${s.standard_turnaround ?? "?"}d, ${rush}, auto-refund=${s.auto_refund_on_miss ? "yes" : "no"}, statute=${s.statute || "none"}`;
    })
    .join("\n");

  return `You are a regulatory compliance analyst specializing in HOA and COA (Homeowners Association / Condominium Owners Association) law in the United States.

Analyze the current legal landscape for ${stateName} (${stateAbbr}) regarding HOA/COA document fees, requirements, and regulations.

Current configuration for ${stateAbbr}:
${serviceLines || "(no services configured)"}

Provide:
1. A brief 1-2 sentence summary of the regulatory status for this state
2. Any legislative changes in the last 12 months that affect HOA/COA document pricing, fee caps, turnaround requirements, or disclosure rules
3. Any pending or proposed legislation that could impact these areas
4. Whether any of the current configurations shown above may need updating based on current law
5. Specific action items if changes are needed

Focus on: resale certificates / disclosure packages, lender questionnaires, certificate updates, demand letters, estoppel letters, fee caps, statutory limits, rush delivery requirements, and auto-refund requirements.

Be specific about statute references and effective dates where possible. If you are not aware of recent changes for this state, say so clearly rather than speculating.`;
}

/* ── Cron handler ─────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const stateNameMap = new Map(US_STATES.map((s) => [s.abbr, s.name]));

  // Support ?state=WA for on-demand single-state checks from God Mode
  const url = new URL(req.url);
  const singleState = url.searchParams.get("state")?.toUpperCase() || null;

  // Load configured states
  let query = admin
    .from("state_fee_limits")
    .select(
      "state, master_type_key, formal_name, pricing_cap, cap_type, rush_cap, no_rush, standard_turnaround, auto_refund_on_miss, statute"
    )
    .eq("state_enabled", true);

  if (singleState) {
    query = query.eq("state", singleState);
  }

  const { data: rows, error: loadError } = await query.order("state");

  if (loadError) {
    console.error("[legal-check] Failed to load state configs:", loadError.message);
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  // Group by state
  const grouped = new Map<string, ServiceRow[]>();
  for (const row of rows ?? []) {
    const st = (row.state as string).toUpperCase();
    if (!grouped.has(st)) grouped.set(st, []);
    grouped.get(st)!.push(row as unknown as ServiceRow);
  }

  const states = [...grouped.keys()];
  if (states.length === 0) {
    return NextResponse.json({ message: "No states configured." });
  }

  const modelId = "anthropic/claude-opus-4.7";
  const results: Array<{ state: string; ok: boolean; error?: string }> = [];

  for (const st of states) {
    const services = grouped.get(st)!;
    const stateName = stateNameMap.get(st) ?? st;

    try {
      const { output } = await generateText({
        model: modelId,
        output: Output.object({ schema: LegalCheckResult }),
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

  return NextResponse.json({
    checked: states.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
