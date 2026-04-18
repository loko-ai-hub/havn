import { NextResponse } from "next/server";

import { processDocumentOCR } from "@/lib/ocr-pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { toTitleCase } from "@/lib/utils";

export const maxDuration = 300;

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
};

function resolveCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Exact match
  if ((VALID_CATEGORIES as readonly string[]).includes(trimmed)) return trimmed;
  // Alias match (case-insensitive)
  const lower = trimmed.toLowerCase();
  if (CATEGORY_ALIASES[lower]) return CATEGORY_ALIASES[lower];
  // Partial containment fallback
  for (const cat of VALID_CATEGORIES) {
    if (lower.includes(cat.toLowerCase()) || cat.toLowerCase().includes(lower)) return cat;
  }
  return null;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    const communityId = String(formData.get("communityId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file uploaded." }, { status: 400 });
    }

    if (!communityId || !organizationId || !category) {
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

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const originalPath = `community-documents/${communityId}/${timestamp}_${safeName}`;

    const { data: inserted, error: insertError } = await admin
      .from("community_documents")
      .insert({
        community_id: communityId,
        organization_id: organizationId,
        original_filename: file.name,
        document_category: category,
        ocr_status: "pending",
        storage_path_pdf: originalPath,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return NextResponse.json(
        { success: false, error: insertError?.message ?? "Could not create document record." },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

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

    const pipelineResult = await processDocumentOCR(
      fileBuffer,
      file.type,
      communityId,
      organizationId,
      file.name,
      category
    );

    if (!pipelineResult.success) {
      await admin
        .from("community_documents")
        .update({ ocr_status: "failed" })
        .eq("id", inserted.id);

      return NextResponse.json(
        { success: false, error: pipelineResult.error ?? "OCR processing failed." },
        { status: 500 }
      );
    }

    // Resolve the final category using fuzzy normalization
    console.log("[DOC_PROCESS] inferredCategory raw:", pipelineResult.inferredCategory);
    const resolved = resolveCategory(pipelineResult.inferredCategory);
    console.log("[DOC_PROCESS] resolved:", resolved);
    const isUnknown = !resolved || resolved === "Other" || resolved === "Unknown";
    const finalCategory = isUnknown ? "Other" : resolved;

    // Fetch community name for auto-renaming
    const { data: communityRow } = await admin
      .from("communities")
      .select("legal_name")
      .eq("id", communityId)
      .single();
    const communityName = (communityRow?.legal_name as string | undefined) ?? "";

    // Finalize the document record server-side (admin client bypasses RLS)
    const finalUpdate: Record<string, string> = { document_category: finalCategory };
    if (!isUnknown) {
      const fields = pipelineResult.extractedFields ?? {};
      const documentTitle = typeof fields.document_title === "string" ? fields.document_title.trim() : null;

      if (finalCategory === "Meeting Minutes") {
        // Special rename: MM/DD/YYYY - [Type] Meeting Minutes
        const rawDate = typeof fields.meeting_date === "string" ? fields.meeting_date : null;
        const meetingType = typeof fields.meeting_type === "string" ? fields.meeting_type.trim() : null;

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

        finalUpdate.original_filename = datePart ? `${datePart} - ${typeLabel}` : typeLabel;
      } else if (documentTitle && communityName) {
        // Use Claude's descriptive title: "Amendment to Pet Policy - River Rock Hoa"
        finalUpdate.original_filename = `${toTitleCase(documentTitle)} - ${toTitleCase(communityName)}`;
      } else if (documentTitle) {
        finalUpdate.original_filename = toTitleCase(documentTitle);
      } else if (communityName) {
        // Fallback to generic category name
        finalUpdate.original_filename = `${finalCategory} - ${toTitleCase(communityName)}`;
      }
    }
    await admin
      .from("community_documents")
      .update(finalUpdate)
      .eq("id", inserted.id);

    return NextResponse.json({
      success: true,
      documentId: inserted.id,
      inferredCategory: pipelineResult.inferredCategory ?? null,
      finalCategory,
      wasUnknown: isUnknown,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
