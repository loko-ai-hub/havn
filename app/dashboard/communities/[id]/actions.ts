"use server";

import { generateText } from "ai";

import { BEST_MODEL } from "@/lib/ai-models";
import {
  CONTACT_FIELD_KEYS,
  type ContactType,
} from "@/lib/community-contact-mapping";
import { createAdminClient } from "@/lib/supabase/admin";

import { revalidatePath } from "next/cache";

import { requireDashboardOrg } from "../../_lib/require-dashboard-org";

export async function upsertCommunityContact(
  communityId: string,
  contactType: ContactType,
  data: {
    name: string | null;
    role: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  }
) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  // Verify the community belongs to this org
  const { data: community, error: commErr } = await admin
    .from("communities")
    .select("id")
    .eq("id", communityId)
    .eq("organization_id", organizationId)
    .single();

  if (commErr || !community) return { error: "Community not found." };

  const nowIso = new Date().toISOString();

  // 1. Write the contact-card row.
  const { error } = await admin
    .from("community_contacts")
    .upsert(
      {
        community_id: communityId,
        contact_type: contactType,
        name: data.name,
        role: data.role,
        address: data.address,
        phone: data.phone,
        email: data.email,
        updated_at: nowIso,
      },
      { onConflict: "community_id,contact_type" }
    );

  if (error) return { error: error.message };

  // 2. Mirror the same values into the merge-tag cache so document
  //    generation can use {{insurance_agent_name}} / {{management_contact_*}}
  //    etc. with `source='manual'` (which wins over OCR-sourced values
  //    on the next OCR pass). Non-empty fields are upserted; cleared
  //    fields delete their cache rows so OCR can refill them later.
  const keys = CONTACT_FIELD_KEYS[contactType];
  const fieldMap: { key: string; value: string | null }[] = [
    { key: keys.name, value: data.name },
    { key: keys.role, value: data.role },
    { key: keys.email, value: data.email },
    { key: keys.phone, value: data.phone },
    ...(keys.address ? [{ key: keys.address, value: data.address }] : []),
  ];

  const toUpsert = fieldMap
    .filter(
      (f): f is { key: string; value: string } =>
        typeof f.value === "string" && f.value.trim().length > 0
    )
    .map((f) => ({
      community_id: communityId,
      document_type: "_shared",
      field_key: f.key,
      field_value: f.value,
      source: "manual" as const,
      updated_at: nowIso,
    }));

  const toDeleteKeys = fieldMap
    .filter((f) => f.value === null || (typeof f.value === "string" && f.value.trim().length === 0))
    .map((f) => f.key);

  if (toUpsert.length > 0) {
    const { error: cacheErr } = await admin
      .from("community_field_cache")
      .upsert(toUpsert, { onConflict: "community_id,document_type,field_key" });
    if (cacheErr) {
      console.warn("[upsertCommunityContact] cache upsert failed:", cacheErr.message);
    }
  }

  if (toDeleteKeys.length > 0) {
    const { error: cacheDelErr } = await admin
      .from("community_field_cache")
      .delete()
      .eq("community_id", communityId)
      .eq("document_type", "_shared")
      .in("field_key", toDeleteKeys);
    if (cacheDelErr) {
      console.warn("[upsertCommunityContact] cache delete failed:", cacheDelErr.message);
    }
  }

  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}

// ─── Re-extract insurance agent from latest COI ─────────────────────────────

const INSURANCE_AGENT_PROMPT = `Extract the insurance agent / broker contact info from this Certificate of Insurance text. Return ONLY a JSON object with these fields (use null for any field not clearly present):

{
  "insurance_agent_name": "the broker / producer / agent listed as the contact (NOT the underwriting carrier)",
  "insurance_agent_company": "the brokerage / agency that placed the policy (distinct from the underwriting carrier)",
  "insurance_agent_email": "agent's email",
  "insurance_agent_phone": "agent's phone number",
  "insurance_agent_address": "agent's mailing address"
}`;

function safeParseAgentJson(value: string): Record<string, unknown> {
  try {
    const stripped = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function rerunInsuranceAgentExtraction(communityId: string) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  // Verify ownership
  const { data: community, error: commErr } = await admin
    .from("communities")
    .select("id")
    .eq("id", communityId)
    .eq("organization_id", organizationId)
    .single();
  if (commErr || !community) return { error: "Community not found." };

  // Find the latest non-archived Insurance Certificate doc for this community.
  const { data: doc } = await admin
    .from("community_documents")
    .select("id, original_filename, storage_path_txt")
    .eq("community_id", communityId)
    .eq("document_category", "Insurance Certificate")
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) {
    return {
      error: "No Insurance Certificate on file for this community. Upload a COI first.",
    };
  }
  if (!doc.storage_path_txt) {
    return { error: "OCR text isn't available for the latest COI." };
  }

  // Pull the OCR text we already saved at upload time. No need to re-run
  // Document AI — we just want Claude to re-extract with the agent prompt.
  const { data: textBlob, error: dlErr } = await admin.storage
    .from("community-documents")
    .download(doc.storage_path_txt as string);
  if (dlErr || !textBlob) {
    return { error: dlErr?.message ?? "Couldn't read OCR text." };
  }
  const rawText = await textBlob.text();

  let extractedFields: Record<string, unknown> = {};
  try {
    const { text } = await generateText({
      model: BEST_MODEL,
      system: INSURANCE_AGENT_PROMPT,
      prompt: `Document text:\n\n${rawText.slice(0, 60000)}`,
      abortSignal: AbortSignal.timeout(60_000),
    });
    extractedFields = safeParseAgentJson(text ?? "");
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Claude call failed.",
    };
  }

  const pick = (k: string): string | null => {
    const v = extractedFields[k];
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };

  const extractedAgent = {
    name: pick("insurance_agent_name"),
    role: pick("insurance_agent_company"),
    address: pick("insurance_agent_address"),
    phone: pick("insurance_agent_phone"),
    email: pick("insurance_agent_email"),
  };

  const hasAnything = Object.values(extractedAgent).some((v) => v !== null);
  if (!hasAnything) {
    return {
      error: "Couldn't find any insurance agent info in the COI text.",
      extractedFields,
    };
  }

  // Mirror the route's autofill: fill empty fields, never clobber manual
  // entries on community_contacts. Also write to the merge-tag cache.
  const nowIso = new Date().toISOString();

  const { data: existing } = await admin
    .from("community_contacts")
    .select("name, role, address, phone, email")
    .eq("community_id", communityId)
    .eq("contact_type", "insurance_agent")
    .maybeSingle();

  const merged = {
    community_id: communityId,
    contact_type: "insurance_agent" as const,
    name: existing?.name || extractedAgent.name,
    role: existing?.role || extractedAgent.role,
    address: existing?.address || extractedAgent.address,
    phone: existing?.phone || extractedAgent.phone,
    email: existing?.email || extractedAgent.email,
    updated_at: nowIso,
  };

  const { error: upsertErr } = await admin
    .from("community_contacts")
    .upsert(merged, { onConflict: "community_id,contact_type" });
  if (upsertErr) return { error: upsertErr.message };

  // Field cache (source='ocr' so manual entries still win on later edits).
  const keys = CONTACT_FIELD_KEYS.insurance_agent;
  const cacheRows = [
    { key: keys.name, value: extractedAgent.name },
    { key: keys.role, value: extractedAgent.role },
    keys.address ? { key: keys.address, value: extractedAgent.address } : null,
    { key: keys.phone, value: extractedAgent.phone },
    { key: keys.email, value: extractedAgent.email },
  ]
    .filter((r): r is { key: string; value: string | null } => r !== null)
    .filter((r): r is { key: string; value: string } => r.value !== null)
    .map((r) => ({
      community_id: communityId,
      document_type: "_shared",
      field_key: r.key,
      field_value: r.value,
      source: "ocr" as const,
      source_document_id: doc.id as string,
      updated_at: nowIso,
    }));

  if (cacheRows.length > 0) {
    const { error: cacheErr } = await admin
      .from("community_field_cache")
      .upsert(cacheRows, { onConflict: "community_id,document_type,field_key" });
    if (cacheErr) {
      console.warn(
        "[rerunInsuranceAgentExtraction] cache upsert failed:",
        cacheErr.message
      );
    }
  }

  revalidatePath(`/dashboard/communities/${communityId}`);
  return {
    ok: true,
    sourceFilename: (doc.original_filename as string | null) ?? null,
    extracted: extractedAgent,
  };
}
