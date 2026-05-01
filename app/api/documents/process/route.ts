import { createHash } from "crypto";

import { NextResponse } from "next/server";

import {
  matchCommunityFromText,
  type Confidence as CommunityConfidence,
} from "@/lib/community-matcher";
import { processDocumentOCR } from "@/lib/ocr-pipeline";
import { extractTextFromBuffer } from "@/lib/pdf-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { toTitleCase } from "@/lib/utils";

export const maxDuration = 600;

// Categories that auto-archive prior active rows when a fresh upload completes
// OCR successfully. Annual/periodic docs where "most recent" is the current
// version (budgets, financials, reserves, insurance). Other categories (CC&Rs,
// Bylaws, Meeting Minutes, etc.) accumulate independent rows.
const AUTO_ARCHIVE_CATEGORIES = new Set<string>([
  "Budget",
  "Financial Reports",
  "Reserve Study",
  "Insurance Certificate",
]);

// Pull a 4-digit year from a value if it looks like a calendar year. Used for
// year-aware archival of annual/periodic docs.
function parseYearFromString(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  const y = parseInt(m[0], 10);
  if (y < 1990 || y > 2100) return null;
  return y;
}

function extractDocumentYear(
  fields: Record<string, unknown>,
  category: string
): number | null {
  // Budget / Financial Reports: prefer fiscal year end.
  if (category === "Budget" || category === "Financial Reports") {
    const fy = parseYearFromString(fields.fiscal_year_end);
    if (fy) return fy;
  }
  // Insurance: policy effective / expiry year.
  if (category === "Insurance Certificate") {
    const exp = parseYearFromString(fields.insurance_expiry_date);
    if (exp) return exp;
  }
  // Meeting Minutes: meeting date — not in AUTO_ARCHIVE list today, but year
  // gets stored anyway for future filters / sorting.
  if (category === "Meeting Minutes") {
    const md = parseYearFromString(fields.meeting_date);
    if (md) return md;
  }
  // Title fallback ("2027 Annual Budget", "2024 Reserve Study", etc.)
  const titleYear = parseYearFromString(fields.document_title);
  if (titleYear) return titleYear;
  return null;
}

// ─── Category resolution ──────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  "CC&Rs / Declaration",
  "Bylaws",
  "Amendments",
  "Articles of Incorporation",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
  "Meeting Minutes",
  "Rules & Regulations",
  "Site Plan / Map",
  "FHA/VA Certification",
  "Management Agreement",
  "Other",
  "Unknown",
] as const;

// Common variations Claude might return that don't exactly match our labels
const CATEGORY_ALIASES: Record<string, string> = {
  "certificate of insurance": "Insurance Certificate",
  "insurance certificate": "Insurance Certificate",
  "coi": "Insurance Certificate",
  "acord certificate": "Insurance Certificate",
  "declaration": "CC&Rs / Declaration",
  "cc&rs": "CC&Rs / Declaration",
  "ccrs": "CC&Rs / Declaration",
  "covenants": "CC&Rs / Declaration",
  "covenants conditions and restrictions": "CC&Rs / Declaration",
  "reserve study": "Reserve Study",
  "reserve analysis": "Reserve Study",
  "reserve fund study": "Reserve Study",
  "financial statements": "Financial Reports",
  "financial report": "Financial Reports",
  "annual financial report": "Financial Reports",
  "audit report": "Financial Reports",
  "rules and regulations": "Rules & Regulations",
  "rules & regulations": "Rules & Regulations",
  "community rules": "Rules & Regulations",
  "meeting minutes": "Meeting Minutes",
  "board minutes": "Meeting Minutes",
  "annual meeting minutes": "Meeting Minutes",
  "annual budget": "Budget",
  "operating budget": "Budget",
  "amendment": "Amendments",
  "restated bylaws": "Bylaws",
  "articles of incorporation": "Articles of Incorporation",
  "article of incorporation": "Articles of Incorporation",
  "articles of incorporation of": "Articles of Incorporation",
  "articles": "Articles of Incorporation",
  "incorporation": "Articles of Incorporation",
  "certificate of formation": "Articles of Incorporation",
  "certificate of incorporation": "Articles of Incorporation",
  "articles of organization": "Articles of Incorporation",
  "articles of association": "Articles of Incorporation",
  "site plan": "Site Plan / Map",
  "site plan / map": "Site Plan / Map",
  "plot plan": "Site Plan / Map",
  "plat map": "Site Plan / Map",
  "plat": "Site Plan / Map",
  "community map": "Site Plan / Map",
  "property map": "Site Plan / Map",
  "floor plan": "Site Plan / Map",
  "map": "Site Plan / Map",
  "fha/va certification": "FHA/VA Certification",
  "fha certification": "FHA/VA Certification",
  "va certification": "FHA/VA Certification",
  "fha approval": "FHA/VA Certification",
  "hud approval": "FHA/VA Certification",
  "condo approval": "FHA/VA Certification",
  "fha condo approval": "FHA/VA Certification",
  "management agreement": "Management Agreement",
  "management contract": "Management Agreement",
  "property management agreement": "Management Agreement",
  "service agreement": "Management Agreement",
  "management services agreement": "Management Agreement",
  // Verbatim category names that Claude is instructed to return
  // (`CATEGORY_PROMPT` in lib/ocr-pipeline.ts uses these long-form labels).
  // Keep this block in sync with that prompt.
  "declaration and amendments": "CC&Rs / Declaration",
  "bylaws and amendments": "Bylaws",
  "current operating budget": "Budget",
  "most recent balance sheet and income/expense statement": "Financial Reports",
  "balance sheet and income/expense statement": "Financial Reports",
  "balance sheet and income statement": "Financial Reports",
  "reserve study (most recent) – attachment supplements but does not substitute for the (1)(m) disclosure on the face of the certificate":
    "Reserve Study",
  "reserve study (most recent)": "Reserve Study",
  "meeting minutes (most recent annual and board)": "Meeting Minutes",
  "wucioa buyer notice (for rcw 64.90.640 communities)": "Other",
  "wucioa buyer notice": "Other",
};

function resolveCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Exact match
  if ((VALID_CATEGORIES as readonly string[]).includes(trimmed)) return trimmed;
  // Alias match (case-insensitive)
  const lower = trimmed.toLowerCase();
  if (CATEGORY_ALIASES[lower]) return CATEGORY_ALIASES[lower];

  // Substring-alias scan: try every alias key and see if it appears in the
  // input. Pick the longest matching alias (most specific). This catches
  // cases like Claude returning "declaration & amendments" or some variation
  // we didn't anticipate verbatim — "declaration" still hits.
  let aliasHit: { key: string; cat: string } | null = null;
  for (const [key, cat] of Object.entries(CATEGORY_ALIASES)) {
    if (lower.includes(key) && (!aliasHit || key.length > aliasHit.key.length)) {
      aliasHit = { key, cat };
    }
  }
  if (aliasHit) return aliasHit.cat;

  // Last-resort partial containment against canonical names.
  // Sort by length descending so longer / more specific category names win
  // before short ones like "Amendments" steal a match.
  const sorted = [...VALID_CATEGORIES].sort((a, b) => b.length - a.length);
  for (const cat of sorted) {
    const c = cat.toLowerCase();
    if (lower.includes(c) || c.includes(lower)) return cat;
  }
  return null;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    let communityId = String(formData.get("communityId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const batchId = String(formData.get("batchId") ?? "").trim() || null;
    // Optional: when set, archive this row before running the dedup check.
    // Used by the bulk-upload "Replace existing" button so a known duplicate
    // still gets re-uploaded as the current version.
    const replaceDocumentId = String(formData.get("replaceDocumentId") ?? "").trim() || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file uploaded." }, { status: 400 });
    }

    if (!organizationId || !category) {
      return NextResponse.json(
        { success: false, error: "Missing required metadata." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File exceeds 20MB max size." },
        { status: 400 }
      );
    }

    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Only PDF and DOCX are supported." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Read the file once and reuse the buffer for hashing, text extraction,
    // upload, and the background OCR pass. file.arrayBuffer() can technically
    // be called more than once but each call re-reads the underlying stream,
    // so consolidating to one read keeps cold-start memory predictable.
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // If the client didn't pre-resolve the community (e.g. bulk upload from
    // /dashboard/documents where the filename gave no signal), use text
    // extraction + Claude to figure it out before inserting.
    let communityMatchConfidence: CommunityConfidence | null = null;
    if (!communityId) {
      const { rawText } = await extractTextFromBuffer(fileBuffer, file.type);
      if (!rawText.trim()) {
        return NextResponse.json(
          {
            success: false,
            needsCommunity: true,
            error:
              "We couldn't read text from this document. Pick the community manually and try again.",
          },
          { status: 200 }
        );
      }
      const { data: orgCommunities } = await admin
        .from("communities")
        .select("id, legal_name")
        .eq("organization_id", organizationId)
        .eq("status", "active");
      const candidates = (orgCommunities ?? []).map((c) => ({
        id: c.id as string,
        legal_name: c.legal_name as string,
      }));
      const match = await matchCommunityFromText(rawText, candidates);
      if (match.communityId && (match.confidence === "high" || match.confidence === "medium")) {
        communityId = match.communityId;
        communityMatchConfidence = match.confidence;
      } else {
        return NextResponse.json(
          {
            success: false,
            needsCommunity: true,
            error:
              "We couldn't confidently match this document to a community. Pick one manually and try again.",
            matchConfidence: match.confidence,
          },
          { status: 200 }
        );
      }
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const originalPath = `community-documents/${communityId}/${timestamp}_${safeName}`;

    // Honor an explicit replace request before the dedup check so the prior
    // doc's hash doesn't block this upload. Scoped to the same community for
    // safety.
    if (replaceDocumentId) {
      const { error: archiveError } = await admin
        .from("community_documents")
        .update({ archived: true })
        .eq("id", replaceDocumentId)
        .eq("community_id", communityId);
      if (archiveError) {
        console.warn(
          "[DOC_PROCESS] replace target archive failed:",
          archiveError.message
        );
      }
    }

    // Compute a content hash so we can dedup against previously uploaded copies
    // of this exact file in the same community. Active (non-archived) hits get
    // skipped server-side and surfaced back to the client as "duplicate".
    const sha256Hash = createHash("sha256").update(fileBuffer).digest("hex");

    const { data: dupRow } = await admin
      .from("community_documents")
      .select("id, original_filename, document_category")
      .eq("community_id", communityId)
      .eq("sha256_hash", sha256Hash)
      .eq("archived", false)
      .maybeSingle();

    if (dupRow) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        existingDocumentId: (dupRow as { id: string }).id,
        existingFilename:
          (dupRow as { original_filename: string | null }).original_filename ?? null,
        existingCategory:
          (dupRow as { document_category: string | null }).document_category ?? null,
        error: "Already on file for this community.",
      });
    }

    const insertPayload: Record<string, unknown> = {
      community_id: communityId,
      organization_id: organizationId,
      original_filename: file.name,
      document_category: category,
      ocr_status: "pending",
      storage_path_pdf: originalPath,
      sha256_hash: sha256Hash,
    };
    if (batchId) insertPayload.bulk_upload_batch_id = batchId;

    const { data: inserted, error: insertError } = await admin
      .from("community_documents")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return NextResponse.json(
        { success: false, error: insertError?.message ?? "Could not create document record." },
        { status: 500 }
      );
    }

    const uploadRes = await admin.storage
      .from("community-documents")
      .upload(originalPath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadRes.error) {
      await admin
        .from("community_documents")
        .update({ ocr_status: "failed" })
        .eq("id", inserted.id);

      return NextResponse.json(
        { success: false, error: uploadRes.error.message },
        { status: 500 }
      );
    }

    await admin
      .from("community_documents")
      .update({ ocr_status: "processing" })
      .eq("id", inserted.id);

    const documentId = inserted.id as string;
    const finalizedCommunityId = communityId;

    // OCR + Claude classification + auto-rename run inline so each upload's
    // response carries the final state. The client can then sequentially
    // process files with visible per-file completion (no async background
    // handoff via after()). Per-call timeouts on Document AI / Claude bound
    // the request so a hung upstream rejects cleanly into the catch below.
    let finalCategory: string | null = null;
    let finalOcrStatus: "complete" | "failed" = "failed";
    let inferredCategory: string | undefined;
    let pipelineErrorMessage: string | undefined;

    try {
      const pipelineResult = await processDocumentOCR(
        fileBuffer,
        file.type,
        finalizedCommunityId,
        organizationId,
        file.name,
        category,
        documentId
      );

      if (!pipelineResult.success) {
        await admin
          .from("community_documents")
          .update({ ocr_status: "failed" })
          .eq("id", documentId);
        pipelineErrorMessage = pipelineResult.error;
      } else {
        const resolved = resolveCategory(pipelineResult.inferredCategory);
        const isUnknown = !resolved || resolved === "Other" || resolved === "Unknown";
        // If Claude failed (e.g. AI-Gateway 402 / rate limit / timeout), preserve
        // the user's filename-guessed category instead of clobbering it to
        // "Other". The original category came in via the form's `category` field.
        // Internal-only signal, not surfaced to the client.
        if (pipelineResult.classifierFailed) {
          console.warn(
            `[DOC_PROCESS] classifier unavailable, preserving filename guess "${category}" for ${documentId}: ${pipelineResult.classifierError}`
          );
          finalCategory = category;
        } else {
          finalCategory = isUnknown ? "Other" : resolved!;
        }
        inferredCategory = pipelineResult.inferredCategory;

        const { data: communityRow } = await admin
          .from("communities")
          .select("legal_name")
          .eq("id", finalizedCommunityId)
          .single();
        const communityName = (communityRow?.legal_name as string | undefined) ?? "";

        const finalUpdate: Record<string, string | number> = {
          document_category: finalCategory,
          ocr_status: "complete",
        };
        if (!isUnknown) {
          const fields = pipelineResult.extractedFields ?? {};
          const documentTitle =
            typeof fields.document_title === "string" ? fields.document_title.trim() : null;

          if (finalCategory === "Meeting Minutes") {
            const rawDate =
              typeof fields.meeting_date === "string" ? fields.meeting_date : null;
            const meetingType =
              typeof fields.meeting_type === "string" ? fields.meeting_type.trim() : null;

            let datePart = "";
            if (rawDate) {
              const d = new Date(rawDate);
              if (!isNaN(d.getTime())) {
                const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
                const dd = String(d.getUTCDate()).padStart(2, "0");
                const yyyy = d.getUTCFullYear();
                datePart = `${mm}/${dd}/${yyyy}`;
              }
            }

            const typeLabel =
              meetingType && meetingType.toLowerCase() !== "regular"
                ? `${toTitleCase(meetingType)} Meeting Minutes`
                : "Meeting Minutes";

            finalUpdate.original_filename = datePart
              ? `${datePart} - ${typeLabel}`
              : typeLabel;
          } else if (documentTitle && communityName) {
            finalUpdate.original_filename = `${toTitleCase(documentTitle)} - ${toTitleCase(communityName)}`;
          } else if (documentTitle) {
            finalUpdate.original_filename = toTitleCase(documentTitle);
          } else if (communityName) {
            finalUpdate.original_filename = `${finalCategory} - ${toTitleCase(communityName)}`;
          }
        }
        // Year-aware: stash the parsed document_year onto the row so future
        // archive comparisons are O(1) instead of needing to re-parse JSON.
        const newDocYear = extractDocumentYear(
          pipelineResult.extractedFields ?? {},
          finalCategory
        );
        if (newDocYear !== null) {
          finalUpdate.document_year = newDocYear;
        }

        await admin.from("community_documents").update(finalUpdate).eq("id", documentId);
        finalOcrStatus = "complete";

        // Annual / periodic categories (Budget, Financial Reports, Reserve
        // Study, Insurance Certificate) auto-archive prior active versions
        // for the same community when the new doc is more recent.
        if (AUTO_ARCHIVE_CATEGORIES.has(finalCategory)) {
          const { data: peers } = await admin
            .from("community_documents")
            .select("id, document_year")
            .eq("community_id", finalizedCommunityId)
            .eq("document_category", finalCategory)
            .eq("archived", false)
            .neq("id", documentId);

          const peerRows = (peers ?? []) as { id: string; document_year: number | null }[];

          if (newDocYear !== null) {
            const olderPeerIds = peerRows
              .filter((p) => p.document_year !== null && p.document_year < newDocYear)
              .map((p) => p.id);
            const newerPeers = peerRows.filter(
              (p) => p.document_year !== null && p.document_year > newDocYear
            );

            if (olderPeerIds.length > 0) {
              const { error: archiveError } = await admin
                .from("community_documents")
                .update({ archived: true })
                .in("id", olderPeerIds);
              if (archiveError) {
                console.warn(
                  "[DOC_PROCESS] auto-archive older peers failed:",
                  archiveError.message
                );
              }
            }

            if (newerPeers.length > 0) {
              await admin
                .from("community_documents")
                .update({ archived: true })
                .eq("id", documentId);
            }
          }
        }
      }
    } catch (err) {
      console.error("[DOC_PROCESS] OCR pipeline failed:", err);
      await admin
        .from("community_documents")
        .update({ ocr_status: "failed" })
        .eq("id", documentId);
      pipelineErrorMessage = err instanceof Error ? err.message : "OCR failed.";
    }

    return NextResponse.json({
      success: true,
      documentId,
      ocrStatus: finalOcrStatus,
      finalCategory,
      inferredCategory,
      ocrError: pipelineErrorMessage,
      autoMatchedCommunityId: communityMatchConfidence ? communityId : null,
      communityMatchConfidence,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
