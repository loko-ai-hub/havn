"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type InviteDetails = {
  id: string;
  email: string;
  role: string;
  org_name: string;
  organization_id: string;
};

export async function getInviteDetails(
  token: string
): Promise<InviteDetails | { error: string }> {
  if (!token) return { error: "No invitation token provided." };

  const admin = createAdminClient();

  const { data: invite, error } = await admin
    .from("invitations")
    .select("id, email, role, organization_id, accepted_at, expires_at, token")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[accept-invite] Query error:", error.message);
    return { error: `Invitation lookup failed: ${error.message}` };
  }
  if (!invite) {
    // Try to find by checking if any invitations exist at all
    const { count } = await admin.from("invitations").select("id", { count: "exact", head: true });
    console.error("[accept-invite] Token not found:", token, "Total invitations:", count);
    return { error: "Invitation not found or has expired." };
  }
  if (invite.accepted_at) return { error: "This invitation has already been accepted." };
  if (invite.expires_at && new Date(invite.expires_at as string) < new Date()) {
    return {
      error:
        "This invitation has expired. Ask your organization admin to send a new one.",
    };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", invite.organization_id)
    .single();

  return {
    id: invite.id as string,
    email: invite.email as string,
    role: invite.role as string,
    org_name: (org?.name as string | null) ?? "your organization",
    organization_id: invite.organization_id as string,
  };
}

export async function acceptInvite(
  token: string,
  data: { firstName: string; lastName: string; password: string }
): Promise<{ ok: true; email: string } | { error: string }> {
  if (!token) return { error: "No invitation token." };

  const admin = createAdminClient();

  const { data: invite, error: fetchError } = await admin
    .from("invitations")
    .select("id, email, role, organization_id, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (fetchError || !invite) return { error: "Invitation not found." };
  if (invite.accepted_at) return { error: "This invitation has already been accepted." };
  if (invite.expires_at && new Date(invite.expires_at as string) < new Date()) {
    return { error: "This invitation has expired." };
  }

  const email = invite.email as string;
  const orgId = invite.organization_id as string;
  const role = invite.role as string;
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  const { data: userData, error: createError } = await admin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      organization_id: orgId,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
    },
  });

  if (createError) {
    if (
      createError.message.toLowerCase().includes("already registered") ||
      createError.message.toLowerCase().includes("already exists") ||
      createError.message.toLowerCase().includes("duplicate")
    ) {
      return {
        error:
          "An account with this email already exists. Please log in at /login to access your dashboard.",
      };
    }
    return { error: createError.message };
  }

  const userId = userData.user.id;

  // The DB trigger creates a profiles row on auth.users insert.
  // We upsert to set organization_id and role correctly.
  await admin
    .from("profiles")
    .upsert({ id: userId, organization_id: orgId, role }, { onConflict: "id" });

  // Mark invite as accepted
  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id as string);

  return { ok: true, email };
}
