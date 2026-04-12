import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { mapFieldsToDocument } from "@/lib/autofill";
import { getCommunityFields } from "@/lib/community-data";
import { createAdminClient } from "@/lib/supabase/admin";

import { cn } from "@/lib/utils";

import { formatMasterTypeKey } from "../../../_lib/format";
import { requireDashboardOrg } from "../../../_lib/require-dashboard-org";

type OrderRow = {
  id: string;
  organization_id: string;
  master_type_key: string | null;
  property_address: string | null;
};

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="rounded-t-xl bg-havn-navy px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">{title}</h2>
      </div>
      <div className="space-y-4 bg-background p-5">{children}</div>
    </section>
  );
}

function nonEmptyEntries(map: Record<string, string | null>): [string, string][] {
  return Object.entries(map).filter(
    (entry): entry is [string, string] =>
      entry[1] != null && String(entry[1]).trim() !== ""
  );
}

export default async function DashboardRequestReviewPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("document_orders")
    .select("id, organization_id, master_type_key, property_address")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    notFound();
  }

  const row = order as OrderRow;
  if (row.organization_id !== organizationId) {
    notFound();
  }

  const { data: community } = await admin
    .from("communities")
    .select("id")
    .eq("organization_id", row.organization_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const communityId = community?.id as string | undefined;
  const rawFields = communityId ? await getCommunityFields(communityId) : null;
  const mapped =
    rawFields != null ? mapFieldsToDocument(rawFields, row.master_type_key ?? "") : null;
  const filledEntries = mapped ? nonEmptyEntries(mapped) : [];
  const hasAutofillData = filledEntries.length > 0;

  const documentsHref = communityId
    ? `/dashboard/communities/${communityId}/documents`
    : "/dashboard/communities";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/requests/${orderId}`}
          className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to request detail
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Review & auto-fill</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMasterTypeKey(row.master_type_key)}
          {row.property_address ? ` · ${row.property_address}` : null}
        </p>
      </div>

      <SectionCard title="Auto-fill insight">
        <p className="text-sm text-muted-foreground">
          Extracted community fields (when available) help pre-populate outgoing documents for this
          request. Always verify values against source records before sending or approving.
        </p>
      </SectionCard>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl bg-havn-navy px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
            Community Data — Auto-Filled
          </h2>
          {hasAutofillData ? (
            <span className="inline-flex rounded-full border border-havn-success/40 bg-havn-success/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
              Auto-filled
            </span>
          ) : null}
        </div>
        <div className="space-y-4 bg-background p-5">
          {hasAutofillData ? (
            <>
              <p className="text-sm text-muted-foreground">
                Data extracted from uploaded governing documents. Review for accuracy before approving.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {filledEntries.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4">
              <div className="flex gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400"
                  aria-hidden
                />
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold text-foreground">No community data available for auto-fill</p>
                  <p className="text-sm text-muted-foreground">
                    Upload governing documents for this community to enable automatic document population.
                  </p>
                  <Link
                    href={documentsHref}
                    className={cn(buttonVariants({ variant: "secondary" }), "mt-2 inline-flex")}
                  >
                    Upload documents
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
