import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

// Sweeps `community_documents` rows that have been wedged in
// `ocr_status='processing'` (or `'pending'`) for too long. The OCR pipeline
// runs in Vercel's `after()` block; if the function instance dies mid-flight
// (cold restart, maxDuration breach, hung upstream API), the catch branch
// that would mark the row `failed` never runs and the row sits forever.
//
// This sweep marks anything older than STUCK_THRESHOLD_MINUTES as `failed`
// so the UI surfaces it as actionable.

const STUCK_THRESHOLD_MINUTES = 5;

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
  // when the env var is set. Match the pattern used by legal-check so the
  // scheduled invocations actually authenticate.
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const cutoffIso = new Date(
    Date.now() - STUCK_THRESHOLD_MINUTES * 60_000
  ).toISOString();

  console.log(
    `[cron/cleanup-stuck-docs] sweeping rows in pending/processing older than ${cutoffIso}`
  );

  const { data: stuck, error: selectError } = await admin
    .from("community_documents")
    .select("id, community_id, original_filename, created_at, ocr_status")
    .in("ocr_status", ["processing", "pending"])
    .lt("created_at", cutoffIso);

  if (selectError) {
    console.error(
      `[cron/cleanup-stuck-docs] select failed: ${selectError.message}`
    );
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const rows = stuck ?? [];
  if (rows.length === 0) {
    const elapsedMs = Date.now() - startedAt;
    console.log(`[cron/cleanup-stuck-docs] no stuck rows. elapsed=${elapsedMs}ms`);
    return NextResponse.json({ failed: 0, elapsedMs });
  }

  const ids = rows.map((r) => r.id as string);
  const { error: updateError } = await admin
    .from("community_documents")
    .update({ ocr_status: "failed" })
    .in("id", ids);

  if (updateError) {
    console.error(
      `[cron/cleanup-stuck-docs] update failed: ${updateError.message}`
    );
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[cron/cleanup-stuck-docs] marked ${rows.length} rows as failed. elapsed=${elapsedMs}ms`
  );

  return NextResponse.json({
    failed: rows.length,
    ids,
    elapsedMs,
  });
}
