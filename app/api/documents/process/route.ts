import { NextResponse } from "next/server";

import { processDocumentOCR } from "@/lib/ocr-pipeline";
import { createAdminClient } from "@/lib/supabase/admin";

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
        mime_type: file.type,
        file_size_bytes: file.size,
        storage_path_original: originalPath,
        ocr_status: "pending",
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

    return NextResponse.json({ success: true, documentId: inserted.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
