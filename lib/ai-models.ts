/**
 * Single source of truth for the top-tier Anthropic model Havn uses for
 * critical reasoning tasks (merge tag resolution, legal checks, template
 * ingestion, state onboarding).
 *
 * When a new Claude model ships, update this constant — every call site
 * picks up the new model automatically. Do NOT hardcode model IDs elsewhere.
 */
export const BEST_MODEL = "anthropic/claude-opus-4.7" as const;

export type BestModel = typeof BEST_MODEL;
