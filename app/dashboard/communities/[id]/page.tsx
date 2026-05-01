import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  MapPin,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ALL_CONTACT_REGISTRY_KEYS,
  CONTACT_FIELD_KEYS,
  type ContactType,
} from "@/lib/community-contact-mapping";
import { createAdminClient } from "@/lib/supabase/admin";

import { requireDashboardOrg } from "../../_lib/require-dashboard-org";
import ArchiveRestoreCommunityButton from "../archive-restore-button";
import CommunityContactCard from "./contact-card";

// ─── Config ───────────────────────────────────────────────────────────────────

// Keep in sync with the per-community documents page, the communities list,
// and the global documents overview. Amendments, Articles of Incorporation,
// Site Plan / Map, FHA/VA, and Management Agreement are optional.
const REQUIRED_CATEGORIES = [
  "CC&Rs / Declaration",
  "Bylaws",
  "Financial Reports",
  "Insurance Certificate",
  "Reserve Study",
  "Budget",
  "Meeting Minutes",
  "Rules & Regulations",
];

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const [orgRes, openRequestsRes, docsRes, contactsRes, fieldCacheRes] = await Promise.all([
    admin
      .from("organizations")
      .select("name, support_email, support_phone")
      .eq("id", organizationId)
      .single(),
    admin
      .from("document_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("order_status", ["paid", "in_progress"]),
    admin
      .from("community_documents")
      .select("document_category")
      .eq("community_id", id),
    admin
      .from("community_contacts")
      .select("contact_type, name, role, address, phone, email")
      .eq("community_id", id),
    admin
      .from("community_field_cache")
      .select("field_key, field_value")
      .eq("community_id", id)
      .eq("document_type", "_shared")
      .in("field_key", ALL_CONTACT_REGISTRY_KEYS),
  ]);

  const org = orgRes.data as { name: string | null; support_email: string | null; support_phone: string | null } | null;
  const openRequestsCount = openRequestsRes.count ?? 0;

  type ContactRow = { contact_type: string; name: string | null; role: string | null; address: string | null; phone: string | null; email: string | null };
  const contacts = (contactsRes.data ?? []) as ContactRow[];

  // Build a registry-key → value lookup of cached merge-tag values so the
  // contact card can fall back on cache entries (typically OCR-sourced) when
  // the dedicated community_contacts row has no value yet.
  type CacheRow = { field_key: string; field_value: string | null };
  const cacheMap = new Map<string, string>();
  for (const row of (fieldCacheRes.data ?? []) as CacheRow[]) {
    if (row.field_value && row.field_value.trim().length > 0) {
      cacheMap.set(row.field_key, row.field_value);
    }
  }

  const mergeContact = (
    saved: ContactRow | undefined,
    contactType: ContactType
  ) => {
    const keys = CONTACT_FIELD_KEYS[contactType];
    const fromCache = (key: string | null) => (key ? cacheMap.get(key) ?? null : null);
    return {
      name: saved?.name ?? fromCache(keys.name),
      role: saved?.role ?? fromCache(keys.role),
      address: saved?.address ?? fromCache(keys.address),
      phone: saved?.phone ?? fromCache(keys.phone),
      email: saved?.email ?? fromCache(keys.email),
    };
  };

  const insuranceContact = mergeContact(
    contacts.find((c) => c.contact_type === "insurance_agent"),
    "insurance_agent"
  );

  const savedMgmt = contacts.find((c) => c.contact_type === "management_company");
  const mergedMgmt = mergeContact(savedMgmt, "management_company");
  // Pre-populate management contact from org + assigned manager when nothing
  // has been saved (or auto-extracted) yet.
  const mgmtContact = savedMgmt
    ? mergedMgmt
    : {
        name: mergedMgmt.name ?? c.manager_name ?? null,
        role: mergedMgmt.role ?? org?.name ?? null,
        address: mergedMgmt.address ?? null,
        phone: mergedMgmt.phone ?? org?.support_phone ?? null,
        email: mergedMgmt.email ?? org?.support_email ?? null,
      };

  type DocRow = { document_category: string | null };
  const presentCategories = new Set(
    ((docsRes.data ?? []) as DocRow[])
      .map((d) => d.document_category)
      .filter((v): v is string => v != null)
  );
  const completedCount = REQUIRED_CATEGORIES.filter((cat) => presentCategories.has(cat)).length;
  const missingCount = REQUIRED_CATEGORIES.length - completedCount;
  const docPercent = Math.round((completedCount / REQUIRED_CATEGORIES.length) * 100);
  const totalDocsUploaded = (docsRes.data ?? []).length;

  const isActive = (c.status ?? "active").toLowerCase() === "active";

  // KPI card definitions
  const kpiCards = [
    {
      label: "Units",
      value: String(c.unit_count ?? 0),
      subtext: "Total properties",
      Icon: Building2,
      accent: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      label: "Open Requests",
      value: String(openRequestsCount),
      subtext: "Orders not yet completed",
      Icon: FileText,
      accent: "text-havn-amber",
      iconBg: "bg-havn-amber/10",
    },
    {
      label: "Docs Uploaded",
      value: String(totalDocsUploaded),
      subtext: `${docPercent}% categories complete`,
      Icon: FileText,
      accent: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      label: "Document Alerts",
      value: String(missingCount),
      subtext: missingCount === 0 ? "All categories complete" : "Categories missing",
      Icon: AlertTriangle,
      accent: missingCount === 0 ? "text-havn-success" : "text-destructive",
      iconBg: missingCount === 0 ? "bg-havn-success/10" : "bg-destructive/10",
    },
  ];

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 -mx-6 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/communities"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-foreground truncate">{c.legal_name}</h1>
              <span
                className={`shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isActive
                    ? "bg-havn-success/10 text-havn-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isActive ? "Active" : "Archived"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {c.city ?? "—"}, {c.state ?? "—"} {c.zip ?? ""}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Zero-units banner */}
        {(!c.unit_count || c.unit_count === 0) && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-havn-amber/40 bg-havn-amber/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Property addresses required</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Upload property addresses so future inbound requests are auto-assigned to the community manager.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/communities/${c.id}/documents`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Upload Documents
            </Link>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpiCards.map((card) => (
            <div
              key={card.label}
              className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
            >
              <div
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${card.iconBg}`}
              >
                <card.Icon className={`h-4 w-4 ${card.accent}`} />
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {card.value}
              </p>
              <p className="mt-1 text-xs font-medium text-foreground/80">{card.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{card.subtext}</p>
            </div>
          ))}
        </div>

        {/* Map + details row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
          {/* Map placeholder */}
          <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
            <div className="p-6 text-center">
              <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Map</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Mapbox integration pending</p>
            </div>
          </div>

          {/* Location card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</h4>
            </div>
            <p className="text-sm font-medium text-foreground">
              {c.city ?? "—"}, {c.state ?? "—"} {c.zip ?? ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{c.community_type ?? "—"}</p>
          </div>
        </div>

        {/* Key Contacts */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Key Contacts</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CommunityContactCard
              communityId={id}
              contactType="insurance_agent"
              label="Insurance Agent"
              initial={insuranceContact}
            />
            <CommunityContactCard
              communityId={id}
              contactType="management_company"
              label="Management Company Contact"
              initial={mgmtContact}
            />
          </div>
        </div>

        {/* Document Completion */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-foreground">Document Completion</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                  docPercent === 100
                    ? "bg-havn-success/10 text-havn-success"
                    : docPercent >= 50
                    ? "bg-havn-amber/10 text-havn-amber"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {completedCount}/{REQUIRED_CATEGORIES.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/communities/${id}/documents?upload=true`}
                className="inline-flex items-center gap-2 rounded-lg bg-havn-navy px-3 py-2 text-sm font-medium text-havn-sand transition-colors hover:bg-havn-navy-light"
              >
                Upload Document
              </Link>
              <Link
                href={`/dashboard/communities/${id}/documents`}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                View Documents
              </Link>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {REQUIRED_CATEGORIES.map((cat) => {
                const isPresent = presentCategories.has(cat);
                return (
                  <div
                    key={cat}
                    className={`group flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-all ${
                      isPresent
                        ? "border-havn-success/20 bg-havn-success/5 hover:border-havn-success/40"
                        : "border-destructive/20 bg-destructive/5 hover:border-destructive/40"
                    }`}
                  >
                    <div
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${
                        isPresent ? "bg-havn-success/10" : "bg-destructive/10"
                      }`}
                    >
                      {isPresent ? (
                        <CheckCircle2 className="h-4 w-4 text-havn-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <p
                      className={`text-[11px] font-medium leading-tight ${
                        isPresent ? "text-foreground" : "text-destructive"
                      }`}
                    >
                      {cat}
                    </p>
                    <span
                      className={`text-[10px] font-medium ${
                        isPresent ? "text-havn-success/80" : "text-destructive/70"
                      }`}
                    >
                      {isPresent ? "Complete" : "Missing"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-destructive">Danger Zone</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isActive
                  ? "Archive this community to hide it from active listings."
                  : "Restore this community to make it active again."}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <ArchiveRestoreCommunityButton
              communityId={c.id}
              currentStatus={isActive ? "active" : "archived"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
