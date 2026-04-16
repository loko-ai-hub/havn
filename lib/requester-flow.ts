/**
 * Requester-facing portal flow. Public routes live under `/r/[slug]` where `slug`
 * matches `organizations.portal_slug`. No Supabase wiring yet — path helpers only.
 */

export type RequesterLinearStepId =
  | "landing"
  | "role"
  | "property"
  | "documents"
  | "addons"
  | "delivery"
  | "info"
  | "review"
  | "payment"
  | "confirmation";

export type RequesterFlowStepId = RequesterLinearStepId | "track";

export type RequesterFlowStep = {
  id: RequesterFlowStepId;
  /** UI label for placeholders */
  screenName: string;
  /**
   * Path segment after `/r/[slug]/`. Empty string = landing (`/r/[slug]` only).
   * Not used for `track` (see `trackSegment`).
   */
  segment: string;
};

/** Ordered steps for the main checkout flow (excludes track). */
export const REQUESTER_FLOW_STEP_ORDER: readonly RequesterLinearStepId[] = [
  "landing",
  "role",
  "info",
  "property",
  "documents",
  "delivery",
  "addons",
  "review",
  "payment",
  "confirmation",
] as const;

/** Full metadata: order matches {@link REQUESTER_FLOW_STEP_ORDER}, plus track. */
export const REQUESTER_FLOW_STEPS: readonly RequesterFlowStep[] = [
  { id: "landing", screenName: "Portal landing", segment: "" },
  { id: "role", screenName: "Role selection", segment: "role" },
  { id: "property", screenName: "Property address", segment: "property" },
  { id: "documents", screenName: "Document selection", segment: "documents" },
  { id: "addons", screenName: "Add-ons", segment: "addons" },
  { id: "delivery", screenName: "Delivery speed", segment: "delivery" },
  { id: "info", screenName: "Your information", segment: "info" },
  { id: "review", screenName: "Review & Pay", segment: "review" },
  { id: "payment", screenName: "Payment", segment: "payment" },
  { id: "confirmation", screenName: "Order confirmed", segment: "confirmation" },
  { id: "track", screenName: "Order tracking", segment: "track" },
] as const;

/** Stub order id for placeholder navigation from confirmation → track. */
export const REQUESTER_PLACEHOLDER_ORDER_ID = "demo-order";

export function requesterPortalPath(slug: string, segment: string): string {
  const safe = encodeURIComponent(slug);
  const base = `/r/${safe}`;
  return segment ? `${base}/${segment}` : base;
}

export function requesterTrackPath(slug: string, orderId: string): string {
  return `${requesterPortalPath(slug, "track")}/${encodeURIComponent(orderId)}`;
}

function pathForLinearStep(slug: string, step: RequesterLinearStepId): string {
  if (step === "landing") return requesterPortalPath(slug, "");
  return requesterPortalPath(slug, step);
}

/**
 * Href for the primary action on each step (linear flow, then track, then back to landing).
 */
export function getContinueHref(slug: string, current: RequesterFlowStepId): string {
  if (current === "track") {
    return requesterPortalPath(slug, "");
  }
  if (current === "confirmation") {
    return requesterTrackPath(slug, REQUESTER_PLACEHOLDER_ORDER_ID);
  }
  const idx = REQUESTER_FLOW_STEP_ORDER.indexOf(current);
  if (idx < 0 || idx >= REQUESTER_FLOW_STEP_ORDER.length - 1) {
    return requesterPortalPath(slug, "");
  }
  const next = REQUESTER_FLOW_STEP_ORDER[idx + 1];
  return pathForLinearStep(slug, next);
}
