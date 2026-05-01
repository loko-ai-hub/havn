"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractCommunityFromBuffer,
  type CcAndRExtractionResult,
} from "@/lib/cc-and-r-extractor";
import { geocodeAddress, type GeocodeResult } from "@/lib/geocoding";
import {
  sendConciergeConfirmation,
  sendConciergeImportRequest,
} from "@/lib/resend";

import { requireDashboardOrg } from "../_lib/require-dashboard-org";

export async function lookupAddress(query: string): Promise<GeocodeResult> {
  // Cheap auth gate — only signed-in operators can hit the geocoding API.
  await requireDashboardOrg();
  return geocodeAddress(query);
}

const CC_AND_R_MAX_BYTES = 20 * 1024 * 1024; // 20 MB cap

export async function extractCommunityFromGoverningDoc(input: {
  filename: string;
  mimeType: string;
  base64: string;
}): Promise<
  | { ok: true; extraction: CcAndRExtractionResult; pageCount: number }
  | { ok: false; error: string }
> {
  try {
    await requireDashboardOrg();

    const buffer = Buffer.from(input.base64, "base64");
    if (buffer.length === 0) {
      return { ok: false, error: "Empty file." };
    }
    if (buffer.length > CC_AND_R_MAX_BYTES) {
      return {
        ok: false,
        error: `File is ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Limit is 20MB.`,
      };
    }

    const { extraction, pageCount } = await extractCommunityFromBuffer(
      buffer,
      input.mimeType || "application/pdf"
    );
    return { ok: true, extraction, pageCount };
  } catch (err) {
    console.error("[extractCommunityFromGoverningDoc] failed:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not read this document. Try a different file or fill the fields manually.",
    };
  }
}

export async function addCommunity(
  orgId: string,
  data: {
    legal_name: string;
    city: string;
    state: string;
    zip: string;
    community_type: string;
    manager_name: string;
    unit_count: number;
  }
) {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) {
    return { error: "You cannot add communities for this organization." };
  }

  const admin = createAdminClient();

  const { error } = await admin.from("communities").insert({
    organization_id: orgId,
    legal_name: data.legal_name,
    city: data.city,
    state: data.state,
    zip: data.zip,
    community_type: data.community_type,
    manager_name: data.manager_name || null,
    unit_count: data.unit_count,
    status: "active",
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/communities");
  return { ok: true };
}

export async function bulkAddCommunities(
  orgId: string,
  rows: Array<{
    legal_name: string;
    city: string;
    state: string;
    zip: string;
    community_type: string;
    manager_name: string;
  }>
) {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) {
    return { error: "You cannot add communities for this organization." };
  }

  const admin = createAdminClient();

  const { error } = await admin.from("communities").insert(
    rows.map((r) => ({
      organization_id: orgId,
      legal_name: r.legal_name,
      city: r.city,
      state: r.state,
      zip: r.zip,
      community_type: r.community_type || "HOA",
      manager_name: r.manager_name || null,
      unit_count: 0,
      status: "active",
    }))
  );

  if (error) return { error: error.message };

  revalidatePath("/dashboard/communities");
  return { ok: true };
}

export async function archiveCommunity(id: string, status: "active" | "archived") {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: community, error: commErr } = await admin
    .from("communities")
    .select("id, organization_id")
    .eq("id", id)
    .single();

  if (commErr || !community) {
    return { error: "Community not found." };
  }

  if (community.organization_id !== organizationId) {
    return { error: "You cannot update this community." };
  }

  const { error } = await admin
    .from("communities")
    .update({ status })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/communities");
  return { ok: true };
}

// Per-file size cap: 8 MB. Resend total email size limit is 40 MB; capping per
// file keeps us under that even when several files are dropped at once.
const CONCIERGE_MAX_FILE_BYTES = 8 * 1024 * 1024;
const CONCIERGE_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export async function requestConciergeImport(input: {
  notes: string;
  files: { filename: string; mimeType: string; base64: string; size: number }[];
}): Promise<{ ok: true } | { error: string }> {
  try {
    const { organizationId, email, userName } = await requireDashboardOrg();
    const admin = createAdminClient();

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    if (orgError || !org) {
      return { error: "Could not load your organization." };
    }

    const totalBytes = input.files.reduce((sum, f) => sum + (f.size ?? 0), 0);
    if (totalBytes > CONCIERGE_MAX_TOTAL_BYTES) {
      return {
        error: `Total attachment size is ${(totalBytes / 1024 / 1024).toFixed(
          1
        )}MB. Please keep concierge uploads under 32MB total, or split into multiple requests.`,
      };
    }
    for (const f of input.files) {
      if (f.size > CONCIERGE_MAX_FILE_BYTES) {
        return {
          error: `${f.filename} is ${(f.size / 1024 / 1024).toFixed(
            1
          )}MB. Individual files must be under 8MB for concierge import.`,
        };
      }
    }

    await sendConciergeImportRequest({
      customerEmail: email,
      customerName: userName,
      orgName: (org.name as string) ?? "Unknown org",
      orgId: organizationId,
      notes: input.notes,
      attachments: input.files.map((f) => ({
        filename: f.filename,
        content: f.base64,
      })),
    });

    // Best-effort customer confirmation; failure here doesn't fail the request.
    try {
      await sendConciergeConfirmation({
        customerEmail: email,
        customerName: userName,
        orgName: (org.name as string) ?? "your organization",
      });
    } catch (err) {
      console.warn("[concierge] customer confirmation email failed:", err);
    }

    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not submit your request.",
    };
  }
}

