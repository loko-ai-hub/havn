// Graduated community ↔ property ↔ owner match resolver. Takes the
// extracted context from a form and walks down the hierarchy: community
// first, then unit, then owner. Each level cascades: even community-only
// match unlocks community-level merge-tag fills.

import {
  matchCommunityFromText,
  type CommunityMatchInput,
} from "@/lib/community-matcher";
import { createAdminClient } from "@/lib/supabase/admin";

import type { ExtractedFormContext } from "@/lib/extract-form-context";

export type MatchLevel =
  | "community_unit_owner"
  | "community_unit"
  | "community"
  | "none";

export type MatchConfidence = "high" | "medium" | "low" | "unknown";

export type OrderPropertyMatch = {
  communityId: string | null;
  unitId: string | null;
  level: MatchLevel;
  confidence: MatchConfidence;
  reasoning: string;
};

const STREET_NORMALIZE_REGEX = /[^a-z0-9 ]+/g;

function normalizeStreet(s: string): string {
  return s
    .toLowerCase()
    .replace(STREET_NORMALIZE_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

function ownerOverlap(unitOwners: string[], extracted: string[]): number {
  if (extracted.length === 0) return 0;
  const extractedTokens = new Set<string>();
  for (const e of extracted) tokenSet(e).forEach((t) => extractedTokens.add(t));
  let hits = 0;
  for (const o of unitOwners) {
    for (const t of tokenSet(o)) {
      if (extractedTokens.has(t)) hits++;
    }
  }
  return hits;
}

function lowerOf(c: { high: number; medium: number; low: number }): MatchConfidence {
  if (c.high === 3) return "high";
  if (c.high + c.medium >= 2 && c.low === 0) return "medium";
  if (c.high + c.medium + c.low > 0) return "low";
  return "unknown";
}

export async function matchOrderProperty(input: {
  context: ExtractedFormContext;
  organizationId: string;
}): Promise<OrderPropertyMatch> {
  const { context, organizationId } = input;
  const admin = createAdminClient();
  const reasonParts: string[] = [];

  // 1. Community — defer to the existing matcher. Use the extracted
  //    association name if available; fall back to a more loosely-built
  //    haystack so the matcher's heuristic still has something to chew on.
  const { data: orgCommunities } = await admin
    .from("communities")
    .select("id, legal_name")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  const candidates: CommunityMatchInput[] = ((orgCommunities ?? []) as Array<{
    id: string;
    legal_name: string;
  }>).map((c) => ({ id: c.id, legal_name: c.legal_name }));

  const haystack = [
    context.associationName,
    context.propertyAddress,
    context.parcel,
    ...(context.ownerNames ?? []),
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n");

  const communityMatch = await matchCommunityFromText(haystack, candidates);
  if (!communityMatch.communityId) {
    return {
      communityId: null,
      unitId: null,
      level: "none",
      confidence: "unknown",
      reasoning: "No community matched the extracted text.",
    };
  }
  reasonParts.push(`Community: ${communityMatch.confidence} confidence (${communityMatch.source}).`);
  const communityId = communityMatch.communityId;

  // 2. Unit — case-insensitive street prefix lookup against community_units.
  let unitId: string | null = null;
  let unitMatchKind: "high" | "medium" | "low" | "none" = "none";
  let ownerMatchKind: "high" | "medium" | "low" | "none" = "none";

  if (context.propertyAddress) {
    const propLower = normalizeStreet(context.propertyAddress);
    const { data: units } = await admin
      .from("community_units")
      .select("id, property_street, owner_names")
      .eq("community_id", communityId);
    const unitRows = ((units ?? []) as Array<{
      id: string;
      property_street: string | null;
      owner_names: string[] | null;
    }>).filter((u) => u.property_street);

    // Prefer exact street match; fall back to "extracted street starts with"
    // unit.street so something like "10004 12th Dr SE Everett WA 98208" still
    // matches the unit row "10004 12th Dr SE".
    const exactHits = unitRows.filter(
      (u) => normalizeStreet(u.property_street!) === propLower
    );
    const prefixHits =
      exactHits.length > 0
        ? exactHits
        : unitRows.filter((u) => {
            const norm = normalizeStreet(u.property_street!);
            return propLower.startsWith(norm) && norm.length >= 6;
          });

    if (prefixHits.length === 1) {
      unitId = prefixHits[0].id;
      unitMatchKind = exactHits.length === 1 ? "high" : "medium";
      reasonParts.push(
        `Unit: ${unitMatchKind} confidence (${exactHits.length === 1 ? "exact" : "prefix"} street match).`
      );

      // 3. Owner — token overlap on the matched unit's owner_names.
      if (context.ownerNames.length > 0 && prefixHits[0].owner_names) {
        const overlap = ownerOverlap(prefixHits[0].owner_names, context.ownerNames);
        if (overlap >= 2) {
          ownerMatchKind = "high";
          reasonParts.push(`Owner: high confidence (${overlap} name tokens overlap).`);
        } else if (overlap === 1) {
          ownerMatchKind = "medium";
          reasonParts.push(`Owner: medium confidence (1 name token overlap).`);
        } else {
          ownerMatchKind = "low";
          reasonParts.push(`Owner: low confidence (no overlap with unit's owner names).`);
        }
      } else {
        reasonParts.push(`Owner: no name extracted from doc, unit accepted by address alone.`);
      }
    } else if (prefixHits.length > 1) {
      reasonParts.push(
        `Unit: ambiguous (${prefixHits.length} units share that street). Manual selection needed.`
      );
    } else {
      reasonParts.push(`Unit: no match — extracted address didn't hit any unit street in this community's roster.`);
    }
  } else {
    reasonParts.push(`Unit: no property address extracted from doc.`);
  }

  // Cascade level + confidence.
  let level: MatchLevel;
  if (unitId && ownerMatchKind !== "none" && ownerMatchKind !== "low") {
    level = "community_unit_owner";
  } else if (unitId) {
    level = "community_unit";
  } else {
    level = "community";
  }

  // Compose overall confidence as the lowest of the matched components.
  const counts = { high: 0, medium: 0, low: 0 };
  const tally = (k: "high" | "medium" | "low" | "none" | "unknown" | "high" | "medium" | "low") => {
    if (k === "high") counts.high++;
    else if (k === "medium") counts.medium++;
    else if (k === "low") counts.low++;
  };
  tally(communityMatch.confidence);
  if (level === "community_unit" || level === "community_unit_owner") tally(unitMatchKind);
  if (level === "community_unit_owner") tally(ownerMatchKind);

  return {
    communityId,
    unitId,
    level,
    confidence: lowerOf(counts),
    reasoning: reasonParts.join(" "),
  };
}
