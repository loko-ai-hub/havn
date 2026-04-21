"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import resend, { RESEND_FROM_EMAIL } from "../../../lib/resend";
import { createAdminClient } from "../../../lib/supabase/admin";
import { requireDashboardOrg } from "../_lib/require-dashboard-org";

export async function updatePortalSettings(
  orgId: string,
  fields: { brand_color: string; portal_tagline: string }
) {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) {
    return { error: "You cannot update this organization." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      brand_color: fields.brand_color,
      portal_tagline: fields.portal_tagline,
    })
    .eq("id", orgId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function updateCompanyInfo(
  orgId: string,
  fields: { support_phone: string; city: string; state: string; zip: string }
) {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) return { error: "Access denied." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      support_phone: fields.support_phone || null,
      city: fields.city || null,
      state: fields.state || null,
      zip: fields.zip || null,
    })
    .eq("id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export type TeamMember = {
  id: string;
  email: string;
  role: string;
  full_name: string;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: string;
  created_at: string | null;
};

export async function getOrgTeam(
  orgId: string
): Promise<{ members: TeamMember[]; invites: PendingInvite[] } | { error: string }> {
  const { organizationId } = await requireDashboardOrg();
  if (organizationId !== orgId) return { error: "Access denied." };

  const admin = createAdminClient();

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("organization_id", orgId);

  if (profilesError) return { error: profilesError.message };

  const profileList = (profiles ?? []) as Array<{ id: string; role: string }>;
  const roleMap = new Map(profileList.map((p) => [p.id, p.role]));

  const userResults = await Promise.all(
    profileList.map((p) => admin.auth.admin.getUserById(p.id))
  );

  const members: TeamMember[] = userResults
    .filter((r) => !r.error && r.data.user)
    .map((r) => {
      const u = r.data.user!;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const fullName =
        String(meta.full_name ?? meta.name ?? "").trim() ||
        u.email?.split("@")[0] ||
        "";
      return {
        id: u.id,
        email: u.email ?? "",
        role: roleMap.get(u.id) ?? "staff",
        full_name: fullName,
      };
    });

  const { data: invites } = await admin
    .from("invitations")
    .select("id, email, role, created_at")
    .eq("organization_id", orgId)
    .eq("accepted", false);

  return {
    members,
    invites: (invites ?? []) as PendingInvite[],
  };
}

export async function sendTeamInvitation(orgId: string, email: string, role: string) {
  const { organizationId, userId } = await requireDashboardOrg();
  if (organizationId !== orgId) return { error: "Access denied." };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("invitations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (existing) return { error: "An invitation for this email already exists." };

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await admin.from("invitations").insert({
    organization_id: orgId,
    email: email.toLowerCase(),
    role,
    invited_by: userId,
    token,
    expires_at: expiresAt,
  });

  if (insertError) return { error: insertError.message };

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://havnhq.com";
  const acceptUrl = `${baseUrl}/accept-invite?token=${token}`;

  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: "You've been invited to join Havn",
        html: `
          <p>You've been invited to join your organization on Havn as a <strong>${role.replace(/_/g, " ")}</strong>.</p>
          <p style="margin:24px 0;">
            <a href="${acceptUrl}" style="display:inline-block;background:#0f172a;color:#f8f5f0;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Accept Invitation</a>
          </p>
          <p style="color:#888;font-size:12px;">Or copy this link: ${acceptUrl}</p>
          <p style="color:#888;font-size:12px;">This invitation expires in 7 days.</p>
          <p>— Havn</p>
        `,
      });
    } catch (err) {
      console.error("Invite email failed:", err);
    }
  }

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function revokeTeamInvitation(inviteId: string) {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: invite, error: fetchError } = await admin
    .from("invitations")
    .select("id, organization_id")
    .eq("id", inviteId)
    .single();

  if (fetchError || !invite || invite.organization_id !== organizationId) {
    return { error: "Invitation not found or access denied." };
  }

  const { error: deleteError } = await admin.from("invitations").delete().eq("id", inviteId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}
