"use client";

import { ChevronDown, Mail, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { DashboardSectionCard } from "../_lib/dashboard-section-card";
import {
  getOrgTeam,
  revokeTeamInvitation,
  sendTeamInvitation,
  updateCompanyInfo,
  updatePortalSettings,
} from "./actions";
import type { PendingInvite, TeamMember } from "./actions";
import {
  checkStripeOnboardingStatus,
  createStripeConnectLink,
  getStripeBankLast4,
} from "./stripe/actions";

type OrgRow = {
  id: string;
  name: string | null;
  support_email: string | null;
  support_phone: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  brand_color: string | null;
  portal_tagline: string | null;
  logo_url: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
};

function splitName(meta: Record<string, unknown>): { first: string; last: string } {
  const first =
    (typeof meta.first_name === "string" && meta.first_name) ||
    (typeof meta.given_name === "string" && meta.given_name) ||
    "";
  const last =
    (typeof meta.last_name === "string" && meta.last_name) ||
    (typeof meta.family_name === "string" && meta.family_name) ||
    "";
  if (first || last) return { first, last };
  const full =
    (typeof meta.full_name === "string" && meta.full_name) || (typeof meta.name === "string" && meta.name) || "";
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function resolveOrgId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let orgId: string | null =
    typeof user.user_metadata?.organization_id === "string" ? user.user_metadata.organization_id : null;
  if (!orgId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    orgId = profile?.organization_id ?? null;
  }
  return orgId;
}

function Disclosure({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
      >
        {title}
        <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-border px-4 py-4">{children}</div> : null}
    </div>
  );
}

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function memberInitials(fullName: string, email: string): string {
  const name = fullName.trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

export default function DashboardSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [metaFirst, setMetaFirst] = useState("");
  const [metaLast, setMetaLast] = useState("");
  const [metaPhone, setMetaPhone] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSms, setNotifSms] = useState(false);

  const [website, setWebsite] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateAbbr, setStateAbbr] = useState("");
  const [zip, setZip] = useState("");
  const [billingDifferent, setBillingDifferent] = useState(false);

  const [brandColor, setBrandColor] = useState("#0f172a");
  const [portalTagline, setPortalTagline] = useState("");

  const [userDisplayName, setUserDisplayName] = useState("");

  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeComplete, setStripeComplete] = useState<boolean | null>(null);
  const [stripeConnectLoading, setStripeConnectLoading] = useState(false);
  const [stripeBankLast4, setStripeBankLast4] = useState<string | null>(null);
  const stripeReturnHandled = useRef(false);

  // Team & invitations
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");
  const [inviting, setInviting] = useState(false);

  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);

  const [pendingPortal, startPortalTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    setUserEmail(user.email ?? "");
    const meta = user.user_metadata ?? {};
    const { first, last } = splitName(meta as Record<string, unknown>);
    setMetaFirst(first);
    setMetaLast(last);
    setMetaPhone(typeof meta.phone === "string" ? meta.phone : "");
    const dn =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      user.email?.split("@")[0] ||
      "Team member";
    setUserDisplayName(dn);

    const oid = await resolveOrgId(supabase);
    setOrgId(oid);
    if (!oid) {
      setStripeAccountId(null);
      setStripeComplete(null);
      setLoading(false);
      return;
    }

    const [orgRes, teamRes] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id, name, support_email, support_phone, city, state, zip, brand_color, portal_tagline, logo_url, stripe_account_id, stripe_onboarding_complete"
        )
        .eq("id", oid)
        .single(),
      getOrgTeam(oid),
    ]);

    if (!orgRes.error && orgRes.data) {
      const o = orgRes.data as OrgRow;
      setOfficePhone(o.support_phone ?? "");
      setCity(o.city ?? "");
      setStateAbbr(o.state ?? "");
      setZip(o.zip ?? "");
      setBrandColor(o.brand_color && o.brand_color.length > 0 ? o.brand_color : "#0f172a");
      setPortalTagline(o.portal_tagline ?? "");
      setStripeAccountId(o.stripe_account_id);
      setStripeComplete(o.stripe_onboarding_complete);
    } else {
      setStripeAccountId(null);
      setStripeComplete(null);
    }

    if (teamRes && "members" in teamRes) {
      setMembers(teamRes.members);
      setInvites(teamRes.invites);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!orgId || stripeComplete !== true) {
      setStripeBankLast4(null);
      return;
    }
    void getStripeBankLast4(orgId).then((res) => {
      if (res && "last4" in res && res.last4) {
        setStripeBankLast4(res.last4);
      } else {
        setStripeBankLast4(null);
      }
    });
  }, [orgId, stripeComplete]);

  useEffect(() => {
    if (typeof window === "undefined" || !orgId || stripeReturnHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get("stripe");
    if (stripe === "success") {
      stripeReturnHandled.current = true;
      void (async () => {
        await checkStripeOnboardingStatus(orgId);
        toast.success("Stripe account connected successfully!");
        router.replace("/dashboard/settings");
        await load();
      })();
    } else if (stripe === "refresh") {
      stripeReturnHandled.current = true;
      toast.error("Stripe onboarding incomplete — please try again");
      router.replace("/dashboard/settings");
    }
  }, [orgId, router, load]);

  const handleStripeConnect = () => {
    if (!orgId) return;
    setStripeConnectLoading(true);
    void (async () => {
      try {
        const result = await createStripeConnectLink(orgId);
        if (result && "error" in result) {
          toast.error(result.error);
          return;
        }
        if (result && "url" in result) {
          window.location.href = result.url;
        }
      } finally {
        setStripeConnectLoading(false);
      }
    })();
  };

  const handleCompanySave = async () => {
    if (!orgId) return;
    setSavingCompany(true);
    try {
      const result = await updateCompanyInfo(orgId, {
        support_phone: officePhone,
        city,
        state: stateAbbr,
        zip,
      });
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Company info saved.");
    } finally {
      setSavingCompany(false);
    }
  };

  const handlePersonalSave = async () => {
    setSavingPersonal(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: metaFirst,
          last_name: metaLast,
          phone: metaPhone,
          full_name: `${metaFirst} ${metaLast}`.trim(),
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Profile updated.");
    } finally {
      setSavingPersonal(false);
    }
  };

  const handlePortalSave = () => {
    if (!orgId) return;
    startPortalTransition(async () => {
      const result = await updatePortalSettings(orgId, {
        brand_color: brandColor,
        portal_tagline: portalTagline,
      });
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Portal settings updated.");
      await load();
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Password update request sent (UI preview only).");
  };

  const handleSendInvite = async () => {
    if (!orgId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const result = await sendTeamInvitation(orgId, inviteEmail.trim(), inviteRole);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitation sent.");
      setShowInviteForm(false);
      setInviteEmail("");
      setInviteRole("admin");
      await load();
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    const result = await revokeTeamInvitation(inviteId);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Invitation revoked.");
    await load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your profile, company, and portal.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
        <DashboardSectionCard title="Your Info">
          <div className="flex flex-col gap-6 sm:flex-row">
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-xs text-muted-foreground"
              aria-hidden
            >
              Photo
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-first">First name</Label>
                <Input id="settings-first" value={metaFirst} onChange={(e) => setMetaFirst(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-last">Last name</Label>
                <Input id="settings-last" value={metaLast} onChange={(e) => setMetaLast(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-phone">Phone</Label>
                <Input id="settings-phone" value={metaPhone} onChange={(e) => setMetaPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-email">Email</Label>
                <Input id="settings-email" value={userEmail} readOnly className="bg-muted/50 text-muted-foreground" />
              </div>
            </div>
          </div>
          <Button
            type="button"
            disabled={savingPersonal}
            onClick={() => void handlePersonalSave()}
            className="mt-2"
          >
            {savingPersonal ? "Saving…" : "Save profile"}
          </Button>
          <div className="space-y-3 pt-2">
            <Disclosure title="Change password">
              <form onSubmit={handlePasswordSubmit} className="grid gap-3 sm:max-w-sm">
                <div className="space-y-2">
                  <Label htmlFor="pw-current">Current password</Label>
                  <Input id="pw-current" type="password" autoComplete="current-password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-next">New password</Label>
                  <Input id="pw-next" type="password" autoComplete="new-password" />
                </div>
                <Button type="submit">Update password</Button>
              </form>
            </Disclosure>
            <Disclosure title="Notification preferences">
              <div className="space-y-4">
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <Checkbox checked={notifEmail} onCheckedChange={(c) => setNotifEmail(Boolean(c))} />
                  Email notifications for new requests
                </label>
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <Checkbox checked={notifSms} onCheckedChange={(c) => setNotifSms(Boolean(c))} />
                  SMS alerts for urgent updates
                </label>
              </div>
            </Disclosure>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard title="Company Information">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="co-website">Website</Label>
              <Input
                id="co-website"
                placeholder="https://"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-phone">Office phone</Label>
              <Input id="co-phone" value={officePhone} onChange={(e) => setOfficePhone(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="co-street">Street address</Label>
              <Input id="co-street" value={street} onChange={(e) => setStreet(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-city">City</Label>
              <Input id="co-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-state">State</Label>
              <Input id="co-state" value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-zip">ZIP</Label>
              <Input id="co-zip" value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-foreground">
            <Checkbox checked={billingDifferent} onCheckedChange={(c) => setBillingDifferent(Boolean(c))} />
            Billing address is different
          </label>
          <Button type="button" disabled={savingCompany || !orgId} onClick={() => void handleCompanySave()}>
            {savingCompany ? "Saving…" : "Save company info"}
          </Button>
        </DashboardSectionCard>

        <DashboardSectionCard title="Portal Customization">
          <div className="space-y-2">
            <Label htmlFor="portal-logo">Logo</Label>
            <Input id="portal-logo" type="file" accept="image/*" className="cursor-pointer bg-background" />
            <p className="text-xs text-muted-foreground">Logo upload will connect to storage in a later release.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="portal-color">Brand color</Label>
              <div className="flex gap-2">
                <input
                  id="portal-color"
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-border bg-background p-1"
                />
                <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="portal-tagline">Portal tagline</Label>
              <Textarea
                id="portal-tagline"
                rows={3}
                value={portalTagline}
                onChange={(e) => setPortalTagline(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" disabled={pendingPortal || !orgId} onClick={handlePortalSave}>
            {pendingPortal ? "Saving…" : "Save portal settings"}
          </Button>
        </DashboardSectionCard>

        <DashboardSectionCard title="Roles">
          <ul className="space-y-4 text-sm">
            <li>
              <p className="font-semibold text-foreground">Company Super Admin</p>
              <p className="mt-1 text-muted-foreground">
                Full access to billing, pricing, portal branding, users, and every community. Typically the account
                owner.
              </p>
            </li>
            <li>
              <p className="font-semibold text-foreground">Admin</p>
              <p className="mt-1 text-muted-foreground">
                Manages requests, documents, and team access. Can invite users and adjust operational settings.
              </p>
            </li>
            <li>
              <p className="font-semibold text-foreground">Manager</p>
              <p className="mt-1 text-muted-foreground">
                Oversees assigned communities and request fulfillment. Limited access to org-wide configuration.
              </p>
            </li>
            <li>
              <p className="font-semibold text-foreground">Staff</p>
              <p className="mt-1 text-muted-foreground">
                Works incoming orders and uploads documents. Read-only on sensitive company settings.
              </p>
            </li>
          </ul>
        </DashboardSectionCard>

        <DashboardSectionCard title="Users">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {members.length} team member{members.length !== 1 ? "s" : ""}
              {invites.length > 0 ? ` · ${invites.length} pending` : ""}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowInviteForm(true);
                setInviteEmail("");
                setInviteRole("admin");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/80"
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </button>
          </div>

          {/* Inline invite form */}
          {showInviteForm && (
            <div className="rounded-xl border-2 border-dashed border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Invite New User
                </p>
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@yourcompany.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="admin">Admin</option>
                  <option value="property_manager">Property Manager</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={inviting || !inviteEmail.trim()}
                  onClick={() => void handleSendInvite()}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/80 disabled:opacity-50"
                >
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Active team members */}
          {members.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              {members.map((member) => {
                const initials = memberInitials(member.full_name, member.email);
                const isOwner = member.role === "owner";
                return (
                  <div key={member.id} className="flex items-center justify-between px-5 py-4 gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-havn-surface text-sm font-semibold text-foreground">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {member.full_name || member.email}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {roleLabel(member.role)}
                      </span>
                      {!isOwner && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => toast.info("User removal coming soon.")}
                          aria-label="Remove user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending invitations */}
          {invites.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Pending invitations
              </p>
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                {invites.map((invite) => {
                  const invitedDate = invite.created_at
                    ? new Date(invite.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : null;
                  return (
                    <div key={invite.id} className="flex items-center justify-between px-5 py-4 gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-sm font-semibold text-muted-foreground">
                          <Plus className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{invite.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {roleLabel(invite.role)}
                            {invitedDate ? ` · Invited ${invitedDate}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex rounded-full border border-havn-amber/40 bg-havn-amber/15 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                          Pending
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => void handleRevokeInvite(invite.id)}
                          aria-label="Revoke invitation"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {members.length === 0 && invites.length === 0 && (
            <p className="text-sm text-muted-foreground">No team members found.</p>
          )}
        </DashboardSectionCard>

        <DashboardSectionCard title="Payments">
          {!stripeAccountId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect Stripe to receive payouts from completed document orders.
              </p>
              <Button
                type="button"
                disabled={stripeConnectLoading || !orgId}
                onClick={handleStripeConnect}
              >
                {stripeConnectLoading ? "Creating link…" : "Connect bank account"}
              </Button>
            </div>
          ) : stripeComplete !== true ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-havn-amber/40 bg-havn-amber/15 px-4 py-3 text-sm text-foreground">
                <p className="font-semibold">Finish Stripe onboarding</p>
                <p className="mt-1 text-muted-foreground">
                  Your Connect account is created but onboarding isn&apos;t complete. Use the button below to resume
                  setup in Stripe.
                </p>
              </div>
              <Button
                type="button"
                disabled={stripeConnectLoading || !orgId}
                onClick={handleStripeConnect}
              >
                {stripeConnectLoading ? "Opening Stripe…" : "Complete setup"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-havn-success/40 bg-havn-success/15 px-4 py-4 text-sm text-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-emerald-950 dark:text-emerald-100">You&apos;re all set</p>
                <span className="inline-flex rounded-full border border-havn-success/50 bg-havn-success/25 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                  Payouts enabled
                </span>
              </div>
              <p className="text-muted-foreground">
                {stripeBankLast4
                  ? `Connected · Bank account ending in ${stripeBankLast4}`
                  : "Connected — your payout account is linked with Stripe."}
              </p>
            </div>
          )}
        </DashboardSectionCard>
      </div>
    </div>
  );
}
