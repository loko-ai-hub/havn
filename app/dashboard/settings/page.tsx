"use client";

import { ChevronDown, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { DashboardSectionCard } from "../_lib/dashboard-section-card";
import { updatePortalSettings } from "./actions";

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

export default function DashboardSettingsPage() {
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

    const { data: org, error } = await supabase
      .from("organizations")
      .select(
        "id, name, support_email, support_phone, city, state, zip, brand_color, portal_tagline, logo_url, stripe_account_id, stripe_onboarding_complete"
      )
      .eq("id", oid)
      .single();

    if (!error && org) {
      const o = org as OrgRow;
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

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCompanySave = () => {
    toast.success("Changes saved");
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
          <Button type="button" onClick={handleCompanySave}>
            Save company info
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{userDisplayName}</p>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">You</p>
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => toast.info("Coming soon")}>
              <UserPlus className="h-4 w-4" />
              Invite User
            </Button>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard title="Payments">
          {!stripeAccountId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect Stripe to receive payouts from completed document orders.
              </p>
              <Button type="button" onClick={() => toast.info("Coming soon — Stripe onboarding will be wired here")}>
                Connect bank account
              </Button>
            </div>
          ) : stripeComplete !== true ? (
            <div className="rounded-lg border border-havn-amber/40 bg-havn-amber/15 px-4 py-3 text-sm text-foreground">
              <p className="font-semibold">Finish Stripe onboarding</p>
              <p className="mt-1 text-muted-foreground">
                Your Connect account is created but onboarding isn&apos;t complete. Return to Stripe to add any
                missing details.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-havn-success/40 bg-havn-success/15 px-4 py-3 text-sm text-foreground">
              <p className="font-semibold text-emerald-950 dark:text-emerald-100">You&apos;re all set</p>
              <p className="mt-1 text-muted-foreground">
                Payouts are enabled for your organization. Bank transfers are handled by Stripe Connect.
              </p>
            </div>
          )}
        </DashboardSectionCard>
      </div>
    </div>
  );
}
