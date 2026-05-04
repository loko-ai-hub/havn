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
import { isStripeTestModeClient } from "@/lib/stripe";
import { cn } from "@/lib/utils";

import { DashboardSectionCard } from "../_lib/dashboard-section-card";
import PaymentsSetupChecklist from "@/components/dashboard/payments-setup-checklist";
import {
  getOrgTeam,
  removeTeamMember,
  revokeTeamInvitation,
  sendTeamInvitation,
  updateCompanyInfo,
  updatePortalSettings,
} from "./actions";
import type { PendingInvite, TeamMember } from "./actions";
import {
  checkStripeOnboardingStatus,
  createStripeConnectLink,
  createStripeDashboardLoginLink,
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
  stripe_payouts_enabled: boolean | null;
  stripe_charges_enabled: boolean | null;
  stripe_requirements_currently_due: string[] | null;
  stripe_test_account_id: string | null;
  stripe_test_onboarding_complete: boolean | null;
  stripe_test_payouts_enabled: boolean | null;
  stripe_test_charges_enabled: boolean | null;
  stripe_test_requirements_currently_due: string[] | null;
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
  const labels: Record<string, string> = {
    owner: "Super Admin",
    admin: "Admin",
    property_manager: "Manager",
    board_member: "Board Member",
    staff: "Staff",
  };
  return labels[role] ?? role.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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

  const [website, setWebsite] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateAbbr, setStateAbbr] = useState("");
  const [zip, setZip] = useState("");
  const [billingDifferent, setBillingDifferent] = useState(false);

  const [brandColor, setBrandColor] = useState("#0f172a");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [portalTagline, setPortalTagline] = useState("");


  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeComplete, setStripeComplete] = useState<boolean | null>(null);
  const [stripePayoutsEnabled, setStripePayoutsEnabled] = useState<boolean | null>(null);
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState<boolean | null>(null);
  const [stripeRequirementsDue, setStripeRequirementsDue] = useState<string[]>([]);
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
    const oid = await resolveOrgId(supabase);
    setOrgId(oid);

    // Pull the current user's role so the UI can gate owner-only actions
    // (e.g. opening the Stripe Express dashboard).
    const { data: roleRow } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    setCurrentUserRole((roleRow?.role as string | null) ?? null);
    if (!oid) {
      setStripeAccountId(null);
      setStripeComplete(null);
      setStripePayoutsEnabled(null);
      setStripeChargesEnabled(null);
      setStripeRequirementsDue([]);
      setLoading(false);
      return;
    }

    const [orgRes, teamRes] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id, name, support_email, support_phone, city, state, zip, website, street, brand_color, portal_tagline, logo_url, stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled, stripe_charges_enabled, stripe_requirements_currently_due, stripe_test_account_id, stripe_test_onboarding_complete, stripe_test_payouts_enabled, stripe_test_charges_enabled, stripe_test_requirements_currently_due"
        )
        .eq("id", oid)
        .single(),
      getOrgTeam(oid),
    ]);

    if (!orgRes.error && orgRes.data) {
      const o = orgRes.data as OrgRow;
      const isTest = isStripeTestModeClient();
      setOfficePhone(o.support_phone ?? "");
      setWebsite((o as Record<string, unknown>).website as string ?? "");
      setStreet((o as Record<string, unknown>).street as string ?? "");
      setCity(o.city ?? "");
      setStateAbbr(o.state ?? "");
      setZip(o.zip ?? "");
      setBrandColor(o.brand_color && o.brand_color.length > 0 ? o.brand_color : "#0f172a");
      setLogoUrl(o.logo_url ?? null);
      setPortalTagline(o.portal_tagline ?? "");
      setStripeAccountId(isTest ? o.stripe_test_account_id : o.stripe_account_id);
      setStripeComplete(
        isTest ? o.stripe_test_onboarding_complete : o.stripe_onboarding_complete
      );
      setStripePayoutsEnabled(
        isTest ? o.stripe_test_payouts_enabled : o.stripe_payouts_enabled
      );
      setStripeChargesEnabled(
        isTest ? o.stripe_test_charges_enabled : o.stripe_charges_enabled
      );
      setStripeRequirementsDue(
        (isTest
          ? o.stripe_test_requirements_currently_due
          : o.stripe_requirements_currently_due) ?? []
      );
    } else {
      setStripeAccountId(null);
      setStripeComplete(null);
      setStripePayoutsEnabled(null);
      setStripeChargesEnabled(null);
      setStripeRequirementsDue([]);
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

  // Refresh org state — including Stripe status — when the operator returns
  // to this tab (e.g. after finishing setup in the Stripe tab).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible" || !orgId) return;
      void (async () => {
        try {
          await checkStripeOnboardingStatus(orgId);
        } catch {
          // non-fatal — fall through to load()
        }
        await load();
      })();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [orgId, load]);

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
      toast.error("Stripe onboarding incomplete. Please try again.");
      router.replace("/dashboard/settings");
    }
  }, [orgId, router, load]);

  const handleOpenStripeDashboard = async () => {
    if (!orgId) return;
    const result = await createStripeDashboardLoginLink(orgId);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

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
          // New tab so the operator keeps the Havn settings view open. Tab-focus
          // refresh below pulls fresh status from Stripe when they switch back.
          window.open(result.url, "_blank", "noopener,noreferrer");
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
        website,
        street,
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
      router.refresh(); // Update sidebar name
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      // Verify current password by attempting sign-in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });
      if (verifyError) {
        toast.error("Current password is incorrect.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } finally {
      setSavingPassword(false);
    }
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
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-havn-navy text-xl font-bold text-havn-sand"
              aria-hidden
            >
              {(metaFirst?.[0] ?? "").toUpperCase()}{(metaLast?.[0] ?? "").toUpperCase()}
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
                <Input id="settings-phone" type="tel" value={metaPhone} onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  if (digits.length === 0) { setMetaPhone(""); return; }
                  if (digits.length <= 3) { setMetaPhone(`(${digits}`); return; }
                  if (digits.length <= 6) { setMetaPhone(`(${digits.slice(0, 3)}) ${digits.slice(3)}`); return; }
                  setMetaPhone(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
                }} />
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
              <form onSubmit={(e) => void handlePasswordSubmit(e)} className="grid gap-3 sm:max-w-sm">
                <div className="space-y-2">
                  <Label htmlFor="pw-current">Current password</Label>
                  <Input
                    id="pw-current"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-next">New password</Label>
                  <Input
                    id="pw-next"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <Button type="submit" disabled={savingPassword || !currentPassword || newPassword.length < 6}>
                  {savingPassword ? "Updating..." : "Update password"}
                </Button>
              </form>
            </Disclosure>
            <Disclosure title="Notification preferences">
              <p className="text-sm text-muted-foreground">
                Email notifications are sent automatically when new orders are received. Additional notification options (SMS, digest frequency) are coming soon.
              </p>
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
          <Button type="button" disabled={savingCompany || !orgId} onClick={() => void handleCompanySave()}>
            {savingCompany ? "Saving…" : "Save company info"}
          </Button>
        </DashboardSectionCard>

        <DashboardSectionCard title="Portal Customization">
          <div className="space-y-2">
            <Label htmlFor="portal-logo">Logo</Label>
            {logoUrl && (
              <div className="flex items-center gap-4">
                <img src={logoUrl} alt="Organization logo" className="h-16 w-16 rounded-full border border-border object-cover" />
                <p className="text-xs text-muted-foreground">Current logo</p>
              </div>
            )}
            <input
              id="portal-logo"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file || !orgId) return;
                // 2MB hard cap — anything larger is overkill for a logo and
                // makes the page slow on the requester portal.
                const MAX_BYTES = 2 * 1024 * 1024;
                if (file.size > MAX_BYTES) {
                  toast.error(
                    `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Logos must be 2MB or smaller.`
                  );
                  e.target.value = "";
                  return;
                }
                void (async () => {
                  const path = `${orgId}/${Date.now()}-${file.name}`;
                  const { error: uploadErr } = await supabase.storage.from("logos").upload(path, file);
                  if (uploadErr) {
                    toast.error(`Upload failed: ${uploadErr.message}`);
                    return;
                  }
                  const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
                  if (urlData?.publicUrl) {
                    await supabase.from("organizations").update({ logo_url: urlData.publicUrl }).eq("id", orgId);
                    toast.success("Logo uploaded.");
                    await load();
                  }
                })();
              }}
            />
            <Label
              htmlFor="portal-logo"
              className="inline-flex h-9 w-fit cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {logoUrl ? "Change logo" : "Choose logo"}
            </Label>
            <div className="rounded-md border border-havn-cyan/30 bg-havn-cyan/10 px-3 py-2.5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Recommended:</span> a
                square image at least <span className="font-medium text-foreground">512×512px</span>
                . Your logo is displayed in a circle across the portal, dashboard, and
                emails, so wide wordmarks will be cropped. PNG, JPG, SVG, or WebP, under
                2MB.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Appears on your portal and generated documents.</p>
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
                          onClick={() => {
                            if (!confirm(`Remove ${member.full_name || member.email} from the team?`)) return;
                            void (async () => {
                              const result = await removeTeamMember(member.id);
                              if (result && "error" in result) { toast.error(result.error); return; }
                              toast.success("Team member removed.");
                              await load();
                            })();
                          }}
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
          <PaymentsSetupChecklist
            stripeAccountId={stripeAccountId}
            stripeComplete={stripeComplete}
            stripeChargesEnabled={stripeChargesEnabled}
            stripePayoutsEnabled={stripePayoutsEnabled}
            stripeBankLast4={stripeBankLast4}
            stripeRequirementsDue={stripeRequirementsDue}
            stripeConnectLoading={stripeConnectLoading}
            disabled={!orgId}
            canManageStripe={currentUserRole === "owner"}
            onConnect={handleStripeConnect}
            onOpenStripeDashboard={() => void handleOpenStripeDashboard()}
          />
        </DashboardSectionCard>
      </div>
    </div>
  );
}
