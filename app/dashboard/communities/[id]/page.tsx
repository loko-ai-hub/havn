import { Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { requireDashboardOrg } from "../../_lib/require-dashboard-org";
import { DashboardSectionCard } from "../../_lib/dashboard-section-card";

import ComingSoonButton from "../coming-soon-button";
import ArchiveRestoreCommunityButton from "../archive-restore-button";

function formatStatusBadge(status: string | null | undefined) {
  const s = (status ?? "active").toLowerCase();
  const isActive = s === "active";
  if (isActive) {
    return (
      <span className="inline-flex rounded-full border border-havn-success/40 bg-havn-success/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      Archived
    </span>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

type CommunityRow = {
  id: string;
  organization_id: string;
  legal_name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  community_type: string | null;
  manager_name: string | null;
  unit_count: number | null;
  status: "active" | "archived" | string | null;
};

export default async function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: community, error: communityError } = await admin
    .from("communities")
    .select("*")
    .eq("id", id)
    .single();

  if (communityError || !community) notFound();

  const c = community as CommunityRow;
  if (c.organization_id !== organizationId) notFound();

  const [orgRes, paidCountRes] = await Promise.all([
    admin
      .from("organizations")
      .select("support_email, support_phone")
      .eq("id", organizationId)
      .single(),
    admin
      .from("document_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("order_status", "paid"),
  ]);

  const org = orgRes.data as { support_email: string | null; support_phone: string | null } | null;
  const openRequestsCount = paidCountRes.count ?? 0;

  const status = (c.status ?? "active").toLowerCase();
  const isActive = status === "active";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/dashboard/communities"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            <span aria-hidden>←</span> Back to communities
          </Link>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{c.legal_name}</h1>
            {formatStatusBadge(c.status)}
          </div>

          <p className="text-sm text-muted-foreground">
            {(c.city ?? "—")}, {c.state ?? "—"} {c.zip ?? ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Units" value={String(c.unit_count ?? 0)} />
        <KpiCard label="Open Requests" value={String(openRequestsCount)} />
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
          <div className="mt-2">{formatStatusBadge(c.status)}</div>
        </div>
        <KpiCard label="Community Type" value={c.community_type ?? "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
        <DashboardSectionCard title="Contact Information">
          <div className="space-y-4 sm:grid sm:grid-cols-3 sm:gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="text-sm text-foreground">{c.manager_name?.trim() ? c.manager_name : "Unassigned"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="text-sm text-foreground">
                {org?.support_email ? (
                  <a href={`mailto:${org.support_email}`} className="font-medium underline underline-offset-4 hover:opacity-90">
                    {org.support_email}
                  </a>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
              <p className="text-sm text-foreground">{org?.support_phone ?? "—"}</p>
            </div>
          </div>

          <div className="pt-2">
            <ComingSoonButton variant="outline" size="sm" className="gap-2">
              <Pencil className="h-4 w-4" /> Edit
            </ComingSoonButton>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard title="Location">
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {c.city ?? "—"},{` `}{c.state ?? "—"} {c.zip ?? ""}
            </p>
            <p className="text-sm text-muted-foreground">{c.community_type ?? "—"}</p>
          </div>
          <div className="pt-2">
            <ComingSoonButton variant="outline" size="sm" className="gap-2">
              <Pencil className="h-4 w-4" /> Edit
            </ComingSoonButton>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard title="Manager">
          <div className="space-y-2">
            <p className="text-sm text-foreground">{c.manager_name?.trim() ? c.manager_name : "Unassigned"}</p>
          </div>
          <div className="pt-2">
            <ComingSoonButton variant="outline" size="sm" className="gap-2">
              <Pencil className="h-4 w-4" /> Edit
            </ComingSoonButton>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard title="Units & Addresses">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit count</p>
              <p className="mt-1 text-sm text-foreground">{c.unit_count ?? 0}</p>
            </div>
            <ComingSoonButton variant="outline" size="sm" className="w-full gap-2">
              <span aria-hidden>+</span> Upload Addresses
            </ComingSoonButton>
            <p className="text-sm text-muted-foreground">
              Property addresses enable auto-assignment of incoming requests
            </p>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard title="Document Completion">
          <div className="rounded-lg border border-border bg-havn-surface/30 px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">
              Document management for this community coming soon
            </p>
          </div>
        </DashboardSectionCard>

        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-destructive">Danger Zone</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isActive ? "Archive this community to hide it from active listings." : "Restore this community to make it active again."}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <ArchiveRestoreCommunityButton communityId={c.id} currentStatus={isActive ? "active" : "archived"} />
          </div>
        </div>
      </div>
    </div>
  );
}

