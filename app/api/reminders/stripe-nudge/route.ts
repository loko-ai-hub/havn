import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendStripeConnectNudgeEmail } from "@/lib/resend";

type OrgRow = {
  id: string;
  name: string | null;
  support_email: string | null;
  created_at: string;
};

function utcYmd(iso: string): string {
  return iso.slice(0, 10);
}

function isOrgCreatedOnCalendarDayBefore(iso: string, daysAgo: number): boolean {
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return false;
  const boundary = new Date();
  boundary.setUTCHours(0, 0, 0, 0);
  boundary.setUTCDate(boundary.getUTCDate() - daysAgo);
  return utcYmd(created.toISOString()) === utcYmd(boundary.toISOString());
}

export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, support_email, created_at")
    .eq("stripe_onboarding_complete", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (orgs ?? []).filter((o) => {
    const row = o as OrgRow;
    return (
      isOrgCreatedOnCalendarDayBefore(row.created_at, 3) ||
      isOrgCreatedOnCalendarDayBefore(row.created_at, 7)
    );
  });

  let sent = 0;
  for (const raw of candidates) {
    const org = raw as OrgRow;
    const email = org.support_email?.trim();
    if (!email) continue;
    try {
      await sendStripeConnectNudgeEmail({
        to: email,
        orgName: org.name?.trim() || "there",
      });
      sent += 1;
    } catch {
      // continue other orgs
    }
  }

  return NextResponse.json({ sent });
}
