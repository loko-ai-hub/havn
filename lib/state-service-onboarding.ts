/**
 * AI-assisted state-service onboarding.
 *
 * A 3-agent pipeline that drafts the `state_fee_limits` row set for a new
 * state based on actual statutory research + pricing analysis:
 *
 *   1. Discovery    — what document services apply in this state?
 *   2. Deep-dive    — for each discovered service, extract formal name,
 *                     cap type + amount, turnaround, auto-refund rules,
 *                     and statute citations.  (Runs in parallel per svc.)
 *   3. Pricing      — recommended default + optional rush premium for each
 *                     service, anchored to the statutory caps.
 *
 * Output is a `DraftedStateConfig` that mirrors the `StateServiceRow` DB
 * shape. God Mode shows the draft for review, then a separate step writes
 * it via the existing `saveStateConfig` action.
 */

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";
import { US_STATES } from "@/lib/us-states";

/* ── Master-type keys we can onboard ──────────────────────────────────── */

// `expedite` is intentionally excluded here — it's a rush add-on, not a
// standalone service. Every standalone service already captures its own
// `rushCap` / `rushPremium` / `rushTriggerDays` data.
const VALID_MASTER_TYPE_KEYS = [
  "resale_certificate",
  "lender_questionnaire",
  "certificate_update",
  "demand_letter",
  "estoppel_letter",
  "governing_documents",
] as const;

export type MasterTypeKey = (typeof VALID_MASTER_TYPE_KEYS)[number];

// Internal draft-only type. Maps to DB enum `fee_cap_type` via
// `capTypeForDb()` — DB only accepts `"fixed"` or `"actual_cost"`.
const VALID_CAP_TYPES = ["fixed", "actual_cost", "none"] as const;
export type CapType = (typeof VALID_CAP_TYPES)[number];

export function capTypeForDb(capType: CapType): "fixed" | "actual_cost" {
  return capType === "fixed" ? "fixed" : "actual_cost";
}

/* ── Agent 1: Discovery ──────────────────────────────────────────────── */

const RawServiceDiscovery = z.object({
  summary: z.string(),
  services: z.array(
    z.object({
      masterTypeKey: z.string(),
      rationale: z.string(),
      priority: z.string().optional(),
    })
  ),
});

export type DiscoveredService = {
  masterTypeKey: MasterTypeKey;
  rationale: string;
  priority: "critical" | "standard" | "optional";
};

export type ServiceDiscovery = {
  summary: string;
  services: DiscoveredService[];
};

function buildDiscoveryPrompt(stateAbbr: string, stateName: string): string {
  return `You are a regulatory-compliance expert advising Havn on which HOA/COA document services apply to ${stateName} (${stateAbbr}).

Havn offers the following master services:
- resale_certificate: the statutory resale/disclosure certificate due at sale
- lender_questionnaire: lender-facing association questionnaire for mortgage underwriting
- certificate_update: update/addendum to a previously issued certificate
- demand_letter: payoff / demand statement required at closing
- estoppel_letter: some states use this term instead of (or alongside) resale_certificate
- governing_documents: packaged governing documents delivery (some states charge separately)

For ${stateName} (${stateAbbr}), list ONLY the master services that are actually used. Each master_type_key must appear AT MOST ONCE — do not return the same key multiple times for different community types, chapters, or statute flavors. The next stage will consolidate ALL applicable statutes for that service into a single config that applies the TIGHTEST / most restrictive constraint (lowest cap, shortest turnaround, strictest rush rule) so the same row can safely serve every community in the state. Call out the multiple statute chapters in the rationale so the deep-dive stage knows which ones to consider.

Rush/expedite is NOT a standalone service; it is captured per-service in the next stage.

For each, give a short rationale citing the governing statute (or industry norm if statute is silent). Set priority:
- "critical" — legally required or overwhelmingly common
- "standard" — commonly offered but not strictly required
- "optional"  — sometimes offered but niche

Do NOT invent master type keys. Use only values from: ${VALID_MASTER_TYPE_KEYS.join(", ")}.

If the state uses an estoppel letter instead of a resale certificate, include estoppel_letter (and omit resale_certificate). If both apply as distinct services, include both.

Return structured data only.`;
}

export async function discoverStateServices(params: {
  state: string;
}): Promise<ServiceDiscovery> {
  const stateAbbr = params.state.toUpperCase();
  const stateName =
    US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawServiceDiscovery }),
    system:
      "You are a meticulous regulatory researcher. Respond only with structured data. Cite specific statutes when possible. Never invent master_type_keys outside the allowed set.",
    prompt: buildDiscoveryPrompt(stateAbbr, stateName),
  });

  if (!output) throw new Error(`Service discovery produced no output for ${stateAbbr}.`);

  const validKeys = VALID_MASTER_TYPE_KEYS as readonly string[];
  // Filter invalid keys, then dedupe by masterTypeKey — if the agent
  // returned the same service twice, keep the first and concatenate the
  // rationales so nothing is lost.
  const byKey = new Map<string, DiscoveredService>();
  for (const s of output.services) {
    if (!validKeys.includes(s.masterTypeKey)) continue;
    const key = s.masterTypeKey as MasterTypeKey;
    const priority: DiscoveredService["priority"] =
      s.priority === "critical" || s.priority === "standard" || s.priority === "optional"
        ? s.priority
        : "standard";
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        masterTypeKey: key,
        rationale: `${existing.rationale} · ${s.rationale}`,
        // Promote to the stricter priority if either entry is critical.
        priority: existing.priority === "critical" ? "critical" : priority,
      });
    } else {
      byKey.set(key, { masterTypeKey: key, rationale: s.rationale, priority });
    }
  }

  return {
    summary: output.summary,
    services: [...byKey.values()],
  };
}

/* ── Agent 2: Per-service deep dive ──────────────────────────────────── */

const RawServiceDeepDive = z.object({
  masterTypeKey: z.string(),
  formalName: z.string(),
  capType: z.string(),
  pricingCap: z.number().nullable().optional(),
  rushCap: z.number().nullable().optional(),
  noRush: z.boolean().optional(),
  standardTurnaround: z.number().optional(),
  autoRefundOnMiss: z.boolean().optional(),
  autoRefundOnMissRequiredByStatute: z.boolean().optional(),
  autoRefundNote: z.string().nullable().optional(),
  rushTriggerDays: z.number().nullable().optional(),
  rushDefinition: z.string().nullable().optional(),
  statute: z.string(),
  notes: z.string().nullable().optional(),
});

export type ServiceDeepDive = {
  masterTypeKey: MasterTypeKey;
  formalName: string;
  capType: CapType;
  pricingCap: number | null;
  rushCap: number | null;
  noRush: boolean;
  standardTurnaround: number;
  autoRefundOnMiss: boolean;
  /** True when the auto-refund rule is imposed by statute (not just vendor policy). */
  autoRefundRequiredByStatute: boolean;
  autoRefundNote: string;
  /**
   * Request-to-delivery turnaround (in days) at or below which an order is
   * considered rush. Null when the statute is silent — callers should fall
   * back to a common-practice threshold.
   */
  rushTriggerDays: number | null;
  /** Free-text description of how the state defines rush / expedite. */
  rushDefinition: string;
  statute: string;
  notes: string;
};

function buildDeepDivePrompt(
  stateAbbr: string,
  stateName: string,
  masterTypeKey: MasterTypeKey
): string {
  return `You are a regulatory-compliance attorney researching ${masterTypeKey.replaceAll("_", " ")} requirements in ${stateName} (${stateAbbr}).

This ${stateName} service may be governed by multiple statutes simultaneously (e.g., a condominium act for older communities, a WUCIOA-style act for newer ones, a separate HOA statute, etc.). Havn needs ONE consolidated configuration that is safe for every community the management company might serve. Therefore:

CONSOLIDATION RULE — when more than one statute applies, pick the TIGHTEST / most restrictive value for each field so the resulting config never violates any applicable statute:
- pricingCap: take the LOWEST cap across all applicable statutes (tightest price ceiling wins).
- rushCap: take the LOWEST rush cap.
- standardTurnaround: take the SHORTEST turnaround (fewest days).
- rushTriggerDays: take the LOWEST threshold (shortest request-to-delivery window that counts as rush).
- noRush: true if ANY applicable statute prohibits rush fees.
- autoRefundOnMiss: true if ANY applicable statute triggers auto-refund for missed turnaround.
- autoRefundOnMissRequiredByStatute: true if auto-refund is statutorily mandated under any applicable statute.
- capType: "fixed" if any applicable statute sets a fixed cap; otherwise "actual_cost" if any statute limits to reasonable/actual cost; otherwise "none".
- statute: cite EVERY applicable statute that informed these tightest-of values, separated by semicolons. Briefly note which value came from which statute when it matters.

Provide ONLY verifiable statutory or industry-standard detail — do NOT invent numbers. If every applicable statute is silent on a value, return null (for numbers), false (for booleans), or an empty string (for text).

Required fields:
- formalName: the exact legal name this document is known by in ${stateAbbr} (consolidate — e.g. "Resale Certificate" covering both Condo Act and WUCIOA flavors).
- capType: "fixed" / "actual_cost" / "none" per the consolidation rule above.
- pricingCap: if capType is "fixed", the TIGHTEST (lowest) maximum allowable fee in USD. null otherwise.
- rushCap: the TIGHTEST rush cap in USD. null if no statute caps rush or rush is disallowed.
- noRush: true if ANY applicable statute prohibits rush.
- standardTurnaround: the TIGHTEST (shortest) statutory turnaround in calendar days. Use 10 days as a fallback only if all applicable statutes are silent.
- rushTriggerDays: integer number of days — an order is "rush" when delivery is due at or below this. Take the tightest (lowest) across statutes; 3–5 days is a reasonable fallback.
- rushDefinition: short sentence describing the tightest rush window (e.g. "Delivery required within 3 business days — tightest of RCW 64.34.425(3) and RCW 64.90.640 timelines.").
- autoRefundOnMiss: true if ANY applicable statute mandates auto-refund on missed turnaround.
- autoRefundOnMissRequiredByStatute: true only if the refund rule is mandated by statute (not vendor policy).
- autoRefundNote: brief explanation citing the statute(s).
- statute: semicolon-separated list of ALL applicable statutes that informed this config, e.g. "RCW 64.34.425(3) (Condo Act); RCW 64.90.640 (WUCIOA)".
- notes: call out which statute yielded which tightest value, plus any material facts (penalty for delay, special exclusions, recent changes).

Return structured data only.`;
}

function normalizeDeepDive(
  raw: z.infer<typeof RawServiceDeepDive>
): ServiceDeepDive {
  const capTypeRaw = (raw.capType ?? "").toLowerCase().replace(/\s+/g, "_");
  // Accept both the new spelling and a couple of stale variants the model
  // sometimes produces ("actual", "reasonable") — all map to actual_cost.
  const capType: CapType =
    capTypeRaw === "fixed"
      ? "fixed"
      : capTypeRaw === "none"
        ? "none"
        : "actual_cost";

  const noRush = Boolean(raw.noRush);
  return {
    masterTypeKey: raw.masterTypeKey as MasterTypeKey,
    formalName: raw.formalName,
    capType,
    pricingCap:
      capType === "fixed" && typeof raw.pricingCap === "number"
        ? Math.max(0, Math.round(raw.pricingCap * 100) / 100)
        : null,
    rushCap:
      typeof raw.rushCap === "number"
        ? Math.max(0, Math.round(raw.rushCap * 100) / 100)
        : null,
    noRush,
    standardTurnaround: Math.max(
      1,
      Math.min(60, Math.round(raw.standardTurnaround ?? 10))
    ),
    autoRefundOnMiss: Boolean(raw.autoRefundOnMiss),
    autoRefundRequiredByStatute: Boolean(raw.autoRefundOnMissRequiredByStatute),
    autoRefundNote: raw.autoRefundNote ?? "",
    rushTriggerDays:
      noRush || typeof raw.rushTriggerDays !== "number"
        ? null
        : Math.max(1, Math.min(30, Math.round(raw.rushTriggerDays))),
    rushDefinition: noRush ? "" : (raw.rushDefinition ?? ""),
    statute: raw.statute,
    notes: raw.notes ?? "",
  };
}

export async function deepDiveService(params: {
  state: string;
  masterTypeKey: MasterTypeKey;
}): Promise<ServiceDeepDive> {
  const stateAbbr = params.state.toUpperCase();
  const stateName =
    US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawServiceDeepDive }),
    system:
      "You are a senior HOA/COA compliance attorney. Respond only with structured data. Cite specific statutes. Return null for unknown numeric values rather than guessing. capType must be one of: fixed, actual, none.",
    prompt: buildDeepDivePrompt(stateAbbr, stateName, params.masterTypeKey),
  });

  if (!output) {
    throw new Error(`Deep dive for ${params.masterTypeKey} in ${stateAbbr} produced no output.`);
  }

  return normalizeDeepDive({
    ...output,
    masterTypeKey: params.masterTypeKey,
  });
}

/* ── Agent 3: Pricing recommendation ─────────────────────────────────── */

const RawPricingRecommendation = z.object({
  summary: z.string(),
  recommendations: z.array(
    z.object({
      masterTypeKey: z.string(),
      recommendedDefault: z.number(),
      rushPremium: z.number().nullable().optional(),
      reasoning: z.string(),
    })
  ),
});

export type PricingRecommendation = {
  masterTypeKey: MasterTypeKey;
  recommendedDefault: number;
  rushPremium: number | null;
  reasoning: string;
};

export type PricingReport = {
  summary: string;
  recommendations: PricingRecommendation[];
};

function buildPricingPrompt(
  stateAbbr: string,
  stateName: string,
  deepDives: ServiceDeepDive[]
): string {
  const ddSummary = deepDives
    .map((d) => {
      const cap =
        d.capType === "fixed" && d.pricingCap != null
          ? `fixed statutory cap $${d.pricingCap.toFixed(2)}`
          : d.capType === "actual_cost"
            ? `"actual/reasonable cost" (no fixed cap)`
            : `no statutory cap`;
      const rush = d.noRush
        ? "rush disallowed"
        : d.rushCap != null
          ? `rush capped at $${d.rushCap.toFixed(2)}`
          : "rush allowed (no statutory cap)";
      return `- ${d.masterTypeKey} (${d.formalName}): ${cap}; ${rush}; ${d.standardTurnaround}-day standard; statute ${d.statute}`;
    })
    .join("\n");

  return `You are Havn's pricing analyst. Recommend default prices for each of the following services in ${stateName} (${stateAbbr}), based on statutory caps + prevailing market rates for HOA/COA management-company document services.

Services and statutory context:
${ddSummary}

Rules:
1. Each service's capType/cap already reflects the TIGHTEST statutory constraint across every applicable statute in ${stateAbbr}. recommendedDefault must never exceed that cap.
2. When no statutory cap exists ("actual_cost" or "none"), anchor to typical management-company rates for that service in that market (resale certificates typically $150–$350 in no-cap jurisdictions; lender questionnaires typically $100–$200; demand letters typically $50–$150; estoppel letters typically $200–$299 where capped).
3. rushPremium is the incremental add-on above the standard fee, not the total. It must never push the total fee above the statutory cap (pricingCap + rushPremium ≤ pricingCap when capped, or respect rushCap when provided). null when rush is disallowed or no common-practice premium exists.
4. reasoning must cite why you chose the number — statute reference, market-rate norm, or both — and note which statute's limit was the binding constraint when applicable.

Return structured data only.`;
}

export async function recommendPricing(params: {
  state: string;
  deepDives: ServiceDeepDive[];
}): Promise<PricingReport> {
  if (params.deepDives.length === 0) {
    return { summary: "No services to price.", recommendations: [] };
  }

  const stateAbbr = params.state.toUpperCase();
  const stateName =
    US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;

  const { output } = await generateText({
    model: BEST_MODEL,
    output: Output.object({ schema: RawPricingRecommendation }),
    system:
      "You are a pricing analyst. Respond only with structured data. Never recommend a default above the statutory cap. When no statute caps fees, anchor to prevailing market rates.",
    prompt: buildPricingPrompt(stateAbbr, stateName, params.deepDives),
  });

  if (!output) {
    throw new Error(`Pricing recommendation produced no output for ${stateAbbr}.`);
  }

  const validKeys = new Set<string>(params.deepDives.map((d) => d.masterTypeKey));
  const recommendations: PricingRecommendation[] = output.recommendations
    .filter((r) => validKeys.has(r.masterTypeKey))
    .map((r) => {
      const matchedDeep = params.deepDives.find((d) => d.masterTypeKey === r.masterTypeKey)!;
      const cap = matchedDeep.capType === "fixed" ? matchedDeep.pricingCap : null;
      const clampedDefault =
        cap != null
          ? Math.min(cap, Math.max(0, r.recommendedDefault))
          : Math.max(0, r.recommendedDefault);
      const rushClamped =
        typeof r.rushPremium === "number" && !matchedDeep.noRush
          ? matchedDeep.rushCap != null
            ? Math.min(matchedDeep.rushCap, Math.max(0, r.rushPremium))
            : Math.max(0, r.rushPremium)
          : null;
      return {
        masterTypeKey: r.masterTypeKey as MasterTypeKey,
        recommendedDefault: Math.round(clampedDefault * 100) / 100,
        rushPremium: rushClamped != null ? Math.round(rushClamped * 100) / 100 : null,
        reasoning: r.reasoning,
      };
    });

  return {
    summary: output.summary,
    recommendations,
  };
}

/* ── Draft shape for God Mode ────────────────────────────────────────── */

export type DraftedService = {
  masterTypeKey: MasterTypeKey;
  formalName: string;
  capType: CapType;
  /** Absolute maximum allowable fee (USD). Null when there's no statutory ceiling. */
  pricingCap: number | null;
  rushCap: number | null;
  noRush: boolean;
  standardTurnaround: number;
  autoRefundOnMiss: boolean;
  autoRefundRequiredByStatute: boolean;
  autoRefundNote: string;
  /** Orders below this many days to delivery are considered rush. */
  rushTriggerDays: number | null;
  rushDefinition: string;
  statute: string;
  recommendedDefault: number | null;
  rushPremium: number | null;
  rationale: string;
  pricingReasoning: string;
  notes: string;
};

export type DraftedStateConfig = {
  state: string;
  stateName: string;
  discovery: ServiceDiscovery;
  pricing: PricingReport;
  services: DraftedService[];
};

/* ── Orchestrator ────────────────────────────────────────────────────── */

/**
 * Three-stage pipeline: discover → deep-dive (parallel) → price. Returns
 * everything needed for a God Mode review + commit step.
 */
export async function generateStateServiceDraft(params: {
  state: string;
}): Promise<DraftedStateConfig> {
  const stateAbbr = params.state.toUpperCase();
  const stateName =
    US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr;

  // 1. Discover which services apply.
  const discovery = await discoverStateServices({ state: stateAbbr });
  if (discovery.services.length === 0) {
    return {
      state: stateAbbr,
      stateName,
      discovery,
      pricing: { summary: "No services to price.", recommendations: [] },
      services: [],
    };
  }

  // 2. Deep-dive each service in parallel.
  const deepDiveResults = await Promise.all(
    discovery.services.map((s) =>
      deepDiveService({ state: stateAbbr, masterTypeKey: s.masterTypeKey }).catch((err) => {
        console.error(`[state-service-onboarding] deep-dive failed for ${s.masterTypeKey}:`, err);
        return null;
      })
    )
  );
  const deepDives = deepDiveResults.filter((d): d is ServiceDeepDive => d != null);

  // 3. Price recommendations from the gathered statutory detail.
  const pricing = await recommendPricing({ state: stateAbbr, deepDives });

  // Merge everything into the draft shape.
  const rationaleByKey = new Map<string, string>();
  for (const s of discovery.services) rationaleByKey.set(s.masterTypeKey, s.rationale);
  const pricingByKey = new Map<string, PricingRecommendation>();
  for (const p of pricing.recommendations) pricingByKey.set(p.masterTypeKey, p);

  const services: DraftedService[] = deepDives.map((d) => {
    const price = pricingByKey.get(d.masterTypeKey);
    return {
      masterTypeKey: d.masterTypeKey,
      formalName: d.formalName,
      capType: d.capType,
      pricingCap: d.pricingCap,
      rushCap: d.rushCap,
      noRush: d.noRush,
      standardTurnaround: d.standardTurnaround,
      autoRefundOnMiss: d.autoRefundOnMiss,
      autoRefundRequiredByStatute: d.autoRefundRequiredByStatute,
      autoRefundNote: d.autoRefundNote,
      rushTriggerDays: d.rushTriggerDays,
      rushDefinition: d.rushDefinition,
      statute: d.statute,
      recommendedDefault: price?.recommendedDefault ?? null,
      rushPremium: price?.rushPremium ?? null,
      rationale: rationaleByKey.get(d.masterTypeKey) ?? "",
      pricingReasoning: price?.reasoning ?? "",
      notes: d.notes,
    };
  });

  return {
    state: stateAbbr,
    stateName,
    discovery,
    pricing,
    services,
  };
}
