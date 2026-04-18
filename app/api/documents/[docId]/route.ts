import { type NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;

  // Auth check
  const serverSupabase = await createClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as {
    action: "archive" | "move";
    category?: string;
  };

  const admin = createAdminClient();

  // Verify the document belongs to the user's org
  const orgId =
    typeof user.user_metadata?.organization_id === "string"
      ? user.user_metadata.organization_id
      : await (async () => {
          const { data } = await admin
            .from("profiles")
            .select("organization_id")
            .eq("id", user.id)
            .single();
          return (data?.organization_id as string | undefined) ?? null;
        })();

  if (!orgId) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { data: doc } = await admin
    .from("community_documents")
    .select("organization_id")
    .eq("id", docId)
    .single();

  if (!doc || doc.organization_id !== orgId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (body.action === "archive") {
    const { error } = await admin
      .from("community_documents")
      .update({ archived: true })
      .eq("id", docId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === "move") {
    if (!body.category) {
      return NextResponse.json({ error: "Missing category." }, { status: 400 });
    }
    const { error } = await admin
      .from("community_documents")
      .update({ document_category: body.category })
      .eq("id", docId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
