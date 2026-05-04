// Registry-driven fill of `document_orders.draft_fields` from data Havn
// already has on file. Honors the match level — community-only matches
// only fill community-level fields; full match unlocks unit + owner data.
//
// Source priority per registry key (first non-null wins):
//   1. Existing manual entry on `document_orders.draft_fields` — never
//      overwrite something staff has typed.
//   2. Per-unit data from `community_units` (when level lets us) — owner
//      names/email/phone, property/mailing address parts.
//   3. Per-org data from `organizations` (management company name, support
//      contact, mailing address parts).
//   4. Per-community data from `community_field_cache` (the merge-tag cache
//      populated by OCR + manual edits on the contact card).

import { createAdminClient } from "@/lib/supabase/admin";
import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
} from "@/lib/document-templates/field-registry";

import type { MatchLevel } from "@/lib/match-order-property";

export type HydrationResult = {
  /** The merged draft_fields object that should be written back. */
  filled: Record<string, unknown>;
  /** Keys that were filled this pass (excluding ones already on draft). */
  newlyFilledKeys: string[];
  /** Coverage summary for the staff toast. */
  coverage: {
    requested: number;
    filled: number;
    skippedNoSource: string[];
    skippedAlreadyFilled: string[];
  };
};

type UnitRow = {
  id: string;
  property_street: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  owner_names: string[] | null;
  primary_email: string | null;
  phone: string | null;
};

type OrgRow = {
  name: string | null;
  support_email: string | null;
  support_phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type CacheRow = { field_key: string; field_value: string | null };

// Registry keys whose value comes from the matched community_units row.
// When level isn't community_unit / community_unit_owner, these are skipped.
const UNIT_LEVEL_KEYS = new Set<string>([
  "owner_name",
  "owner_full_names",
  "owner_email",
  "owner_phone",
  "owner_mailing_street",
  "owner_mailing_city",
  "owner_mailing_state",
  "owner_mailing_zip",
  "property_address",
  "property_city",
  "property_state",
  "property_zip",
]);

// Registry keys whose value comes from the org row directly (not the cache).
const ORG_LEVEL_KEYS = new Set<string>([
  "management_company",
  "management_contact_email",
  "management_contact_phone",
]);

function unitValueFor(key: string, unit: UnitRow | null): unknown {
  if (!unit) return null;
  switch (key) {
    case "owner_name":
      return unit.owner_names?.[0] ?? null;
    case "owner_full_names":
      return (unit.owner_names ?? []).filter(Boolean).join(" & ") || null;
    case "owner_email":
      return unit.primary_email;
    case "owner_phone":
      return unit.phone;
    case "owner_mailing_street":
      return unit.mailing_street;
    case "owner_mailing_city":
      return unit.mailing_city;
    case "owner_mailing_state":
      return unit.mailing_state;
    case "owner_mailing_zip":
      return unit.mailing_zip;
    case "property_address":
      return unit.property_street;
    case "property_city":
      return unit.property_city;
    case "property_state":
      return unit.property_state;
    case "property_zip":
      return unit.property_zip;
    default:
      return null;
  }
}

function orgValueFor(key: string, org: OrgRow | null): unknown {
  if (!org) return null;
  switch (key) {
    case "management_company":
      return org.name;
    case "management_contact_email":
      return org.support_email;
    case "management_contact_phone":
      return org.support_phone;
    default:
      return null;
  }
}

export async function hydrateDraftFields(input: {
  orderId: string;
  level: MatchLevel;
  detectedFields: { registryKey: string }[];
}): Promise<HydrationResult> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("document_orders")
    .select(
      "id, organization_id, community_id, community_unit_id, draft_fields"
    )
    .eq("id", input.orderId)
    .single();

  if (!order) {
    return {
      filled: {},
      newlyFilledKeys: [],
      coverage: {
        requested: input.detectedFields.length,
        filled: 0,
        skippedNoSource: [],
        skippedAlreadyFilled: [],
      },
    };
  }

  const orderRow = order as {
    organization_id: string;
    community_id: string | null;
    community_unit_id: string | null;
    draft_fields: Record<string, unknown> | null;
  };
  const draft: Record<string, unknown> = { ...(orderRow.draft_fields ?? {}) };

  // Pull the once-per-call data sources.
  const [orgRes, unitRes, cacheRes] = await Promise.all([
    admin
      .from("organizations")
      .select("name, support_email, support_phone, street, city, state, zip")
      .eq("id", orderRow.organization_id)
      .single(),
    orderRow.community_unit_id
      ? admin
          .from("community_units")
          .select(
            "id, property_street, property_city, property_state, property_zip, mailing_street, mailing_city, mailing_state, mailing_zip, owner_names, primary_email, phone"
          )
          .eq("id", orderRow.community_unit_id)
          .single()
      : Promise.resolve({ data: null }),
    orderRow.community_id
      ? admin
          .from("community_field_cache")
          .select("field_key, field_value")
          .eq("community_id", orderRow.community_id)
          .eq("document_type", "_shared")
      : Promise.resolve({ data: [] }),
  ]);

  const org = (orgRes.data as OrgRow | null) ?? null;
  const unit = (unitRes.data as UnitRow | null) ?? null;
  const cacheMap = new Map<string, string>();
  for (const row of (cacheRes.data ?? []) as CacheRow[]) {
    if (row.field_value && row.field_value.trim().length > 0) {
      cacheMap.set(row.field_key, row.field_value);
    }
  }

  const allowUnitFields =
    input.level === "community_unit" || input.level === "community_unit_owner";
  // Owner-specific subset within unit-level fields. Only fill these on full match.
  const OWNER_ONLY = new Set<string>([
    "owner_name",
    "owner_full_names",
    "owner_email",
    "owner_phone",
    "owner_mailing_street",
    "owner_mailing_city",
    "owner_mailing_state",
    "owner_mailing_zip",
  ]);

  const newlyFilled: string[] = [];
  const skippedNoSource: string[] = [];
  const skippedAlreadyFilled: string[] = [];
  const seen = new Set<string>();

  for (const f of input.detectedFields) {
    const key = f.registryKey;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = FIELD_REGISTRY[key as keyof typeof FIELD_REGISTRY] as
      | FieldRegistryEntry
      | undefined;
    if (!entry) {
      skippedNoSource.push(key);
      continue;
    }
    if (
      key in draft &&
      draft[key] !== null &&
      draft[key] !== undefined &&
      draft[key] !== ""
    ) {
      skippedAlreadyFilled.push(key);
      continue;
    }

    let value: unknown = null;

    if (UNIT_LEVEL_KEYS.has(key)) {
      if (!allowUnitFields) {
        skippedNoSource.push(key);
        continue;
      }
      if (OWNER_ONLY.has(key) && input.level !== "community_unit_owner") {
        skippedNoSource.push(key);
        continue;
      }
      value = unitValueFor(key, unit);
    } else if (ORG_LEVEL_KEYS.has(key)) {
      value = orgValueFor(key, org);
      if (value == null) {
        // Fall back to the cache for management_* fields if the org row
        // doesn't have it (e.g., when contact card was edited but org row
        // wasn't touched).
        value = cacheMap.get(key) ?? null;
      }
    } else if (entry.communityLevel) {
      value = cacheMap.get(key) ?? null;
    } else {
      // Order-context field with no auto-source today (account_paid_through,
      // etc.) — staff fills manually.
      skippedNoSource.push(key);
      continue;
    }

    if (value == null || value === "") {
      skippedNoSource.push(key);
      continue;
    }

    draft[key] = value;
    newlyFilled.push(key);
  }

  // Persist the merged draft.
  if (newlyFilled.length > 0) {
    await admin
      .from("document_orders")
      .update({ draft_fields: draft })
      .eq("id", input.orderId);
  }

  return {
    filled: draft,
    newlyFilledKeys: newlyFilled,
    coverage: {
      requested: input.detectedFields.length,
      filled: newlyFilled.length,
      skippedNoSource,
      skippedAlreadyFilled,
    },
  };
}
