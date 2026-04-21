"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function checkBlockedEmail(
  email: string
): Promise<{ blocked: boolean }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("blocked_emails")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  return { blocked: !!data };
}
