"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FIELD_REGISTRY,
  getLifecycleTier,
  getTemplate,
  type FieldRegistryEntry,
  type DocumentTemplate,
} from "@/lib/document-templates";
import { RESALE_CERTIFICATE } from "@/lib/document-templates/resale-certificate";
import { LENDER_QUESTIONNAIRE } from "@/lib/document-templates/lender-questionnaire";
import { WA_RESALE_CERTIFICATE } from "@/lib/document-templates/wa-resale-certificate";
import {
  validateTemplate,
  type ValidationReport,
} from "@/lib/template-validator";
import {
  buildTemplateSource,
  generateReviewedStateTemplate,
  suggestStateTemplate,
  type StateOnboardingRun,
  type SuggestedStateTemplate,
  type SuggestStateTemplateParams,
} from "@/lib/state-onboarding";
import { generateDocumentPdf } from "@/lib/pdf-generator";
import {
  ingestExternalTemplate,
  type ExternalTemplateIngestion,
} from "@/lib/ingest-external-template";
import { getAllCommunityOcrFields } from "@/lib/community-data";
import { resolveAndPersistMergeTags } from "@/lib/resolve-merge-tags";

import { GOD_MODE_EMAILS } from "./constants";

/* ── Auth guard ───────────────────────────────────────────────────────── */

async function requireGodMode(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  if (!user || !GOD_MODE_EMAILS.includes(email)) {
    throw new Error("Forbidden");
  }
}

/* ── Template registry viewer ─────────────────────────────────────────── */

export type GodModeTemplateSummary = {
  key: string;
  title: string;
  state: string | null;
  documentType: string | null;
  statute: string | null;
  expirationDays: number | null;
  requiresSignature: boolean;
  lastUpdated: string | null;
  sections: string[];
  fieldCount: number;
  requiredFieldCount: number;
  hasCoverLetter: boolean;
  hasLegalLanguage: boolean;
  attachmentsEnabled: boolean;
  attachmentCategories: string[];
  validation: ValidationReport;
  fields: Array<{
    key: string;
    label: string;
    section: string;
    type: string;
    required: boolean;
    communityLevel: boolean;
    mergeTag: string;
    sources: string[];
    helpText?: string;
  }>;
};

function summarizeTemplate(template: DocumentTemplate): GodModeTemplateSummary {
  const validation = validateTemplate(template);
  return {
    key: template.key,
    title: template.title,
    state: template.state ?? null,
    documentType: template.documentType ?? null,
    statute: template.statute ?? null,
    expirationDays: template.expirationDays ?? null,
    requiresSignature: !!template.requiresSignature,
    lastUpdated: template.lastUpdated ?? null,
    sections: [...template.sections],
    fieldCount: template.fields.length,
    requiredFieldCount: template.fields.filter((f) => f.required).length,
    hasCoverLetter: !!template.coverLetter?.enabled,
    hasLegalLanguage: !!template.legalLanguage,
    attachmentsEnabled: !!template.attachments?.enabled,
    attachmentCategories: template.attachments?.categories ?? [],
    validation,
    fields: template.fields.map((f) => {
      const entry = (FIELD_REGISTRY as Record<string, FieldRegistryEntry>)[f.key];
      return {
        key: f.key,
        label: f.label,
        section: f.section,
        type: f.type,
        required: f.required,
        communityLevel: f.communityLevel,
        mergeTag: f.mergeTag ?? `{{${f.key}}}`,
        sources: entry?.sources ?? [],
        helpText: f.helpText,
      };
    }),
  };
}

export async function listTemplateRegistry(): Promise<{
  templates: GodModeTemplateSummary[];
  registrySize: number;
}> {
  await requireGodMode();
  const all: DocumentTemplate[] = [
    RESALE_CERTIFICATE,
    LENDER_QUESTIONNAIRE,
    WA_RESALE_CERTIFICATE,
  ];
  return {
    templates: all.map(summarizeTemplate),
    registrySize: Object.keys(FIELD_REGISTRY).length,
  };
}

/* ── Template health dashboard ────────────────────────────────────────── */

export type TemplateHealthIssue = {
  templateKey: string;
  state: string | null;
  severity: "error" | "warning";
  message: string;
  field?: string;
};

export type TemplateHealthReport = {
  totalTemplates: number;
  ok: boolean;
  errors: TemplateHealthIssue[];
  warnings: TemplateHealthIssue[];
  unusedRegistryKeys: string[];
  missingStateTemplates: Array<{ state: string; documentType: string }>;
  staleCommunities: Array<{
    communityId: string;
    communityName: string | null;
    lastOcrAt: string | null;
    daysStale: number;
  }>;
};

export async function runTemplateHealthCheck(): Promise<TemplateHealthReport> {
  await requireGodMode();
  const admin = createAdminClient();
  const templates: DocumentTemplate[] = [
    RESALE_CERTIFICATE,
    LENDER_QUESTIONNAIRE,
    WA_RESALE_CERTIFICATE,
  ];

  const errors: TemplateHealthIssue[] = [];
  const warnings: TemplateHealthIssue[] = [];
  for (const t of templates) {
    const report = validateTemplate(t);
    for (const e of report.errors) {
      errors.push({
        templateKey: e.templateKey,
        state: e.state ?? null,
        severity: "error",
        message: e.message,
        field: e.field,
      });
    }
    for (const w of report.warnings) {
      warnings.push({
        templateKey: w.templateKey,
        state: w.state ?? null,
        severity: "warning",
        message: w.message,
        field: w.field,
      });
    }
  }

  // Unused registry keys (not referenced by any template).
  const used = new Set<string>();
  for (const t of templates) for (const f of t.fields) used.add(f.key);
  const unusedRegistryKeys = Object.values(FIELD_REGISTRY)
    .filter((e) => !used.has(e.key) && e.sources.length > 0)
    .map((e) => e.key);

  // Missing state templates — states that are enabled and priced but lack
  // a state-specific template for their priced document types.
  const missingStateTemplates: Array<{ state: string; documentType: string }> = [];
  const { data: stateRows } = await admin
    .from("state_fee_limits")
    .select("state, master_type_key, state_enabled")
    .eq("state_enabled", true);
  for (const row of stateRows ?? []) {
    const state = row.state as string;
    const doc = row.master_type_key as string;
    const template = getTemplate(doc, state);
    // A generic template resolves state-less; flag when there's no state-specific match.
    if (template && template.state !== state) {
      missingStateTemplates.push({ state, documentType: doc });
    }
  }

  // Stale community OCR data — communities whose most recent complete OCR
  // is more than 180 days old.
  const STALE_DAYS = 180;
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  const { data: communities } = await admin
    .from("communities")
    .select("id, legal_name")
    .eq("status", "active");

  const staleCommunities: TemplateHealthReport["staleCommunities"] = [];
  for (const community of communities ?? []) {
    const { data: lastDoc } = await admin
      .from("community_documents")
      .select("created_at")
      .eq("community_id", community.id as string)
      .eq("ocr_status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = lastDoc?.created_at as string | undefined;
    if (!lastAt) continue;
    const lastMs = new Date(lastAt).getTime();
    if (lastMs < cutoff) {
      staleCommunities.push({
        communityId: community.id as string,
        communityName: (community.legal_name as string) ?? null,
        lastOcrAt: lastAt,
        daysStale: Math.floor((Date.now() - lastMs) / 86400000),
      });
    }
  }

  return {
    totalTemplates: templates.length,
    ok: errors.length === 0,
    errors,
    warnings,
    unusedRegistryKeys,
    missingStateTemplates,
    staleCommunities,
  };
}

/* ── Community selector + merge-tag data viewer ───────────────────────── */

export type GodModeOrgLite = {
  id: string;
  name: string;
  accountType: "management_company" | "self_managed" | null;
  isActive: boolean;
};

export async function listGodModeOrganizations(): Promise<GodModeOrgLite[]> {
  await requireGodMode();
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("id, name, account_type, is_active")
    .order("name")
    .limit(500);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "(unnamed)",
    accountType: (r.account_type as GodModeOrgLite["accountType"]) ?? null,
    isActive: (r.is_active as boolean | null) !== false,
  }));
}

export type GodModeCommunityLite = {
  id: string;
  name: string;
  state: string | null;
  organizationId: string | null;
  organizationName: string | null;
};

export async function listGodModeCommunities(): Promise<GodModeCommunityLite[]> {
  await requireGodMode();
  const admin = createAdminClient();
  const { data } = await admin
    .from("communities")
    .select("id, legal_name, state, organization_id, organization:organization_id(name)")
    .eq("status", "active")
    .order("legal_name")
    .limit(2000);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.legal_name as string) ?? "(unnamed)",
    state: (r.state as string | null) ?? null,
    organizationId: (r.organization_id as string | null) ?? null,
    organizationName:
      ((r.organization as { name?: string } | null)?.name as string | null) ?? null,
  }));
}

export type MergeTagValueRow = {
  key: string;
  mergeTag: string;
  label: string;
  type: string;
  communityLevel: boolean;
  /** Lifecycle tier from the registry (or default inferred from communityLevel). */
  lifecycleTier: "governing" | "onboarding" | "per_unit" | "per_order";
  sources: string[];
  resolvedValue: string | null;
  resolvedSource: "ocr" | "cache" | "manual" | null;
  /** Audit columns from the field-cache-tiers migration. */
  cachedTier: string | null;
  lastRefreshedAt: string | null;
  sourceEvent: string | null;
  documentType: string | null;
  updatedAt: string | null;
};

export async function getCommunityMergeTagValues(
  communityId: string
): Promise<{ rows: MergeTagValueRow[] } | { error: string }> {
  await requireGodMode();
  if (!communityId) return { error: "Missing communityId" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("community_field_cache")
    .select(
      "field_key, field_value, source, document_type, updated_at, lifecycle_tier, last_refreshed_at, source_event"
    )
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  // Merge cache rows keyed by field, preferring the most-recent write.
  const byKey = new Map<string, (typeof data)[number]>();
  for (const r of data ?? []) {
    const key = r.field_key as string;
    const prev = byKey.get(key);
    if (!prev || new Date(r.updated_at as string) > new Date(prev.updated_at as string)) {
      byKey.set(key, r);
    }
  }

  const rows: MergeTagValueRow[] = [];
  for (const entry of Object.values(FIELD_REGISTRY) as FieldRegistryEntry[]) {
    const cached = byKey.get(entry.key);
    const source = cached?.source as MergeTagValueRow["resolvedSource"] | undefined;
    rows.push({
      key: entry.key,
      mergeTag: entry.mergeTag,
      label: entry.label,
      type: entry.type,
      communityLevel: entry.communityLevel,
      lifecycleTier: getLifecycleTier(entry),
      sources: entry.sources,
      resolvedValue: (cached?.field_value as string | null) ?? null,
      resolvedSource: source ?? null,
      cachedTier: (cached?.lifecycle_tier as string | null) ?? null,
      lastRefreshedAt: (cached?.last_refreshed_at as string | null) ?? null,
      sourceEvent: (cached?.source_event as string | null) ?? null,
      documentType: (cached?.document_type as string | null) ?? null,
      updatedAt: (cached?.updated_at as string | null) ?? null,
    });
  }

  return { rows };
}

/* ── AI state onboarding (task 13) ────────────────────────────────────── */

export async function suggestStateTemplateAction(
  params: SuggestStateTemplateParams
): Promise<SuggestedStateTemplate | { error: string }> {
  await requireGodMode();
  try {
    return await suggestStateTemplate(params);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Suggestion failed",
    };
  }
}

/**
 * Three-agent pipeline: drafter → legal reviewer → revisor.
 *
 * Slower than a single `suggestStateTemplateAction` call (three sequential
 * Opus calls) but returns a reviewed + revised final draft plus the full
 * trace so staff can audit the AI's reasoning.
 */
export async function generateReviewedStateTemplateAction(
  params: SuggestStateTemplateParams
): Promise<StateOnboardingRun | { error: string }> {
  await requireGodMode();
  try {
    return await generateReviewedStateTemplate(params);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Reviewed suggestion failed",
    };
  }
}

/* ── Third-party template ingestion (task 14) ─────────────────────────── */

export async function ingestExternalTemplateAction(
  formText: string
): Promise<ExternalTemplateIngestion | { error: string }> {
  await requireGodMode();
  try {
    return await ingestExternalTemplate(formText);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Ingestion failed",
    };
  }
}

/* ── Source-code generator for AI suggestions ────────────────────────── */

export async function buildTemplateSourceAction(
  suggestion: SuggestedStateTemplate,
  state: string
): Promise<{ fileName: string; source: string }> {
  await requireGodMode();
  return buildTemplateSource(suggestion, state);
}

/* ── PDF preview ─────────────────────────────────────────────────────── */

/**
 * Render a sample PDF for a registered template using placeholder data,
 * so God Mode can show staff what the template produces without needing
 * a real order. Returns base64 so the client can open it as a blob URL.
 */
export async function previewTemplatePdfAction(
  masterTypeKey: string,
  state: string | null
): Promise<{ base64: string } | { error: string }> {
  await requireGodMode();
  const template = getTemplate(masterTypeKey, state);
  if (!template) return { error: "Template not found" };

  const sampleFields: Record<string, string | null> = {};
  for (const f of template.fields) {
    sampleFields[f.key] = sampleValueForField(f.key, f.type);
  }

  try {
    const bytes = await generateDocumentPdf(
      template,
      sampleFields,
      {
        orgName: "Sample Management Co.",
        generatedAt: new Date(),
        orderId: "preview0000",
        state: state ?? template.state ?? null,
        contactEmail: "manager@samplemanagement.example",
        contactPhone: "(555) 010-0100",
        mailingAddress: "123 Sample Way\nSeattle, WA 98101",
        accountType: "management_company",
      },
      template.requiresSignature
        ? {
            signerName: "Jane Sample",
            signerTitle: "Community Manager",
            signedAt: new Date(),
            signatureData: "click-to-sign",
          }
        : undefined
    );
    return { base64: Buffer.from(bytes).toString("base64") };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "PDF generation failed",
    };
  }
}

/* ── Refresh merge tag resolution for a community ─────────────────────── */

export type RefreshCommunityResult = {
  communityId: string;
  communityName: string | null;
  ocrDocsScanned: number;
  resolved: number;
  cached: number;
  preservedManual: number;
  unmapped: number;
  error: string | null;
};

async function refreshMergeTagsForCommunityInternal(params: {
  communityId: string;
  communityName?: string | null;
}): Promise<RefreshCommunityResult> {
  const admin = createAdminClient();
  const { count: ocrDocs } = await admin
    .from("community_documents")
    .select("id", { count: "exact", head: true })
    .eq("community_id", params.communityId)
    .eq("ocr_status", "complete")
    .not("storage_path_json", "is", null);

  const extracted = await getAllCommunityOcrFields(params.communityId);

  if (!extracted || Object.keys(extracted).length === 0) {
    return {
      communityId: params.communityId,
      communityName: params.communityName ?? null,
      ocrDocsScanned: ocrDocs ?? 0,
      resolved: 0,
      cached: 0,
      preservedManual: 0,
      unmapped: 0,
      error: null,
    };
  }

  try {
    const { resolution, persist } = await resolveAndPersistMergeTags(extracted, {
      communityId: params.communityId,
    });
    return {
      communityId: params.communityId,
      communityName: params.communityName ?? null,
      ocrDocsScanned: ocrDocs ?? 0,
      resolved: resolution.resolved.length,
      cached: persist.cached,
      preservedManual: persist.preservedManual,
      unmapped: resolution.unmapped.length,
      error: persist.errors.length > 0 ? persist.errors.join("; ") : null,
    };
  } catch (err) {
    return {
      communityId: params.communityId,
      communityName: params.communityName ?? null,
      ocrDocsScanned: ocrDocs ?? 0,
      resolved: 0,
      cached: 0,
      preservedManual: 0,
      unmapped: 0,
      error: err instanceof Error ? err.message : "Resolution failed",
    };
  }
}

/**
 * Re-runs the merge-tag resolver for a single community. Combines every
 * OCR'd community document's extracted JSON and hands it to the resolver.
 * Manual cache entries are preserved.
 */
export async function refreshCommunityMergeTagsAction(
  communityId: string
): Promise<RefreshCommunityResult | { error: string }> {
  await requireGodMode();
  if (!communityId) return { error: "Missing communityId" };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("communities")
    .select("legal_name")
    .eq("id", communityId)
    .maybeSingle();
  try {
    return await refreshMergeTagsForCommunityInternal({
      communityId,
      communityName: (row?.legal_name as string | null) ?? null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Refresh failed" };
  }
}

function sampleValueForField(key: string, type: string): string {
  // A small library of realistic placeholders keyed off common field names.
  const LIB: Record<string, string> = {
    association_name: "Sample Meadows HOA",
    association_type: "HOA",
    state: "WA",
    county: "King",
    total_units: "142",
    tax_id: "12-3456789",
    fiscal_year_end: "December 31",
    mailing_address: "123 Sample Way, Seattle, WA 98101",
    website: "https://samplemeadows.example",
    management_company: "Sample Management Co.",
    management_contact_name: "Jane Sample",
    management_contact_email: "manager@samplemanagement.example",
    management_contact_phone: "(555) 010-0100",
    monthly_assessment: "325",
    special_assessments: "None in the past 12 months.",
    reserve_fund_balance: "182500",
    outstanding_liens: "None on the subject unit.",
    pending_litigation: "None reported.",
    delinquency_rate: "2.1%",
    budget_deficit: "false",
    insurance_company: "Sample Insurance Co.",
    insurance_policy_number: "POL-123456",
    insurance_expiry: "2026-12-31",
    insurance_liability_amount: "5000000",
    fha_va_approved: "true",
    fidelity_bond: "true",
    pet_restrictions: "Two pets per unit, 35lb maximum; no breed restrictions.",
    rental_restrictions: "30-day minimum lease term; rental cap of 25%.",
    parking_restrictions: "Two assigned spaces per unit; guest parking for up to 72 hours.",
    property_address: "456 Sample Lane, Unit 7, Seattle, WA 98101",
    unit_number: "7",
    requester_name: "Pat Buyer",
    requester_email: "pat.buyer@example.com",
    closing_date: "2026-06-30",
  };

  if (LIB[key]) return LIB[key];
  switch (type) {
    case "currency":
      return "100";
    case "date":
      return "2026-01-01";
    case "boolean":
      return "false";
    case "textarea":
      return "Sample placeholder text.";
    default:
      return "Sample value";
  }
}
