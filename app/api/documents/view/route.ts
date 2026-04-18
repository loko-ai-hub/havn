import { type NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const docId = searchParams.get("docId");
  const type = searchParams.get("type") ?? "pdf";

  if (!docId || !["pdf", "txt", "json"].includes(type)) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }

  // Verify the caller is authenticated
  const serverSupabase = await createClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch document record
  const { data: doc, error: docError } = await admin
    .from("community_documents")
    .select("storage_path_pdf, storage_path_txt, storage_path_json, organization_id, original_filename")
    .eq("id", docId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  // Verify user belongs to the same organization
  const orgId =
    typeof user.user_metadata?.organization_id === "string"
      ? user.user_metadata.organization_id
      : null;

  const resolvedOrgId = orgId ?? (await (async () => {
    const { data } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    return (data?.organization_id as string | undefined) ?? null;
  })());

  if (!resolvedOrgId || resolvedOrgId !== doc.organization_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const pathMap: Record<string, string | null> = {
    pdf: doc.storage_path_pdf as string | null,
    txt: doc.storage_path_txt as string | null,
    json: doc.storage_path_json as string | null,
  };

  const storagePath = pathMap[type];
  if (!storagePath) {
    return NextResponse.json({ error: "File not available yet." }, { status: 404 });
  }

  const { data: fileData, error: storageError } = await admin.storage
    .from("community-documents")
    .download(storagePath);

  if (storageError || !fileData) {
    return NextResponse.json(
      { error: storageError?.message ?? "Failed to fetch file." },
      { status: 500 }
    );
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const filename = doc.original_filename
    ? `${doc.original_filename}.${type}`
    : `document.${type}`;

  return new Response(arrayBuffer, {
    headers: {
      "Content-Type": CONTENT_TYPES[type],
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
