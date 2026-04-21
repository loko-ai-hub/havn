import { NextResponse } from "next/server";

import { runLegalChecks } from "@/lib/legal-check";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const singleState = url.searchParams.get("state") || null;

  const { results } = await runLegalChecks(singleState);

  return NextResponse.json({
    checked: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
