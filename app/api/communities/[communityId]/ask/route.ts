import { NextResponse } from "next/server";

import { getLatestSonnetModel } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are an expert HOA/COA document analyst for a property management platform. You have been given the full text of all governing documents for a specific community association.

Answer the question accurately and concisely based only on the provided documents. Cite which document your answer comes from (e.g., "According to the Bylaws..." or "Per the CC&Rs..."). If the answer is not found in the documents, say so clearly. Use plain language — avoid legalese when possible.`;

const MAX_CONTEXT_CHARS = 600_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> }
) {
  try {
    const { communityId } = await params;

    // ── Auth check ────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // ── Resolve org ID ────────────────────────────────────────────────────────
    let orgId: string | null =
      typeof user.user_metadata?.organization_id === "string"
        ? user.user_metadata.organization_id
        : null;

    if (!orgId) {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      orgId = (profile?.organization_id as string | undefined) ?? null;
    }

    if (!orgId) {
      return NextResponse.json({ error: "no_org" }, { status: 403 });
    }

    // ── Verify community belongs to the user's org ────────────────────────────
    const admin = createAdminClient();
    const { data: community, error: communityError } = await admin
      .from("communities")
      .select("id, organization_id")
      .eq("id", communityId)
      .eq("organization_id", orgId)
      .single();

    if (communityError || !community) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // ── Parse request body ────────────────────────────────────────────────────
    const body = (await request.json()) as { question?: string };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "missing_question" }, { status: 400 });
    }

    // ── Fetch processed documents ─────────────────────────────────────────────
    const { data: docs, error: docsError } = await admin
      .from("community_documents")
      .select("id, document_category, original_filename, storage_path_txt")
      .eq("community_id", communityId)
      .eq("ocr_status", "complete")
      .eq("archived", false)
      .not("storage_path_txt", "is", null);

    if (docsError) {
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (!docs || docs.length === 0) {
      return NextResponse.json({ error: "no_docs" }, { status: 200 });
    }

    // ── Download all txt files in parallel ────────────────────────────────────
    const downloadResults = await Promise.all(
      docs.map(async (doc) => {
        try {
          const { data, error } = await admin.storage
            .from("community-documents")
            .download(doc.storage_path_txt as string);
          if (error || !data) return null;
          const text = await data.text();
          return {
            category: (doc.document_category as string | null) ?? "Unknown",
            filename: (doc.original_filename as string | null) ?? "Document",
            text,
          };
        } catch {
          return null;
        }
      })
    );

    // ── Build context string ──────────────────────────────────────────────────
    const contextParts: string[] = [];
    let totalChars = 0;

    for (const result of downloadResults) {
      if (!result) continue;
      const chunk = `=== ${result.category}: ${result.filename} ===\n${result.text}`;
      if (totalChars + chunk.length > MAX_CONTEXT_CHARS) {
        // Truncate this chunk to fit within the cap
        const remaining = MAX_CONTEXT_CHARS - totalChars;
        if (remaining > 500) {
          contextParts.push(chunk.slice(0, remaining));
        }
        break;
      }
      contextParts.push(chunk);
      totalChars += chunk.length;
    }

    if (contextParts.length === 0) {
      return NextResponse.json({ error: "no_docs" }, { status: 200 });
    }

    const context = contextParts.join("\n\n");

    // ── Call Anthropic with streaming ─────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "no_api_key" }, { status: 500 });
    }

    const model = process.env.ANTHROPIC_MODEL ?? (await getLatestSonnetModel());

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Here are the community documents:\n\n${context}\n\n---\n\nQuestion: ${question}`,
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("[ASK] Anthropic error:", anthropicResponse.status, errText);
      return NextResponse.json({ error: "anthropic_error" }, { status: 500 });
    }

    // ── Forward the raw SSE stream to the client ──────────────────────────────
    return new Response(anthropicResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    console.error("[ASK] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
