import { ArrowLeft, Building2, Info } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { toTitleCase } from "@/lib/utils";

import { requireDashboardOrg } from "../../../_lib/require-dashboard-org";
import PropertiesTable, { type UnitRow } from "./properties-table";

type CommunityRow = {
  id: string;
  legal_name: string;
  organization_id: string;
};

export default async function CommunityPropertiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: community } = await admin
    .from("communities")
    .select("id, legal_name, organization_id")
    .eq("id", id)
    .single();

  const c = community as CommunityRow | null;
  if (!c || c.organization_id !== organizationId) notFound();

  const { data: units } = await admin
    .from("community_units")
    .select(
      "id, account_number, property_street, property_city, property_state, property_zip, mailing_street, mailing_same_as_property, owner_names, primary_email, additional_emails, phone, lease_status, imported_at"
    )
    .eq("community_id", id)
    .order("property_street", { ascending: true, nullsFirst: false });

  const rows = (units ?? []) as UnitRow[];

  return (
    <div>
      <div className="sticky top-0 -mx-6 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/communities/${id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-foreground" />
            <h1 className="text-lg font-semibold text-foreground">
              {toTitleCase(c.legal_name)}
            </h1>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {rows.length} {rows.length === 1 ? "property" : "properties"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-havn-cyan/30 bg-havn-cyan/5 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-havn-cyan-deep" />
          <p className="text-xs text-foreground/80">
            <span className="font-medium text-foreground">To update this list,</span>{" "}
            re-upload the entire community export from the community page.
            Each import replaces the existing roster, so your latest export is
            always the source of truth — there&apos;s no per-row editing here.
          </p>
        </div>
        <PropertiesTable rows={rows} />
      </div>
    </div>
  );
}
