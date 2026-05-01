import RequesterPortalFrame from "@/components/requester/RequesterPortalFrame";
import {
  RequesterPortalOrgProvider,
  type OrgPortalData,
} from "@/components/requester/RequesterPortalOrgContext";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function RequesterPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, name, portal_slug, brand_color, logo_url, portal_tagline, portal_display_name, support_email, is_active"
    )
    .eq("portal_slug", slug)
    .single();

  if (!org) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-havn-surface px-6">
        <p className="text-center text-base text-muted-foreground">
          This portal is not available.
        </p>
      </div>
    );
  }

  const { data: feeRows } = await supabase
    .from("document_request_fees")
    .select(
      "master_type_key, base_fee, rush_3day_fee, rush_next_day_fee, rush_same_day_fee, standard_turnaround_days"
    )
    .eq("organization_id", org.id);

  type FeeRow = {
    master_type_key: string;
    base_fee: number | null;
    rush_3day_fee: number | null;
    rush_next_day_fee: number | null;
    rush_same_day_fee: number | null;
    standard_turnaround_days: number | null;
  };
  const rows = (feeRows ?? []) as FeeRow[];
  const availableDocTypes = rows.map((f) => f.master_type_key);
  const feesByMasterType: OrgPortalData["feesByMasterType"] = {};
  for (const r of rows) {
    feesByMasterType[r.master_type_key] = {
      base_fee: r.base_fee,
      rush_3day_fee: r.rush_3day_fee,
      rush_next_day_fee: r.rush_next_day_fee,
      rush_same_day_fee: r.rush_same_day_fee,
      standard_turnaround_days: r.standard_turnaround_days,
    };
  }

  return (
    <RequesterPortalOrgProvider
      org={{ ...(org as OrgPortalData), availableDocTypes, feesByMasterType }}
    >
      <RequesterPortalFrame slug={slug} org={org as OrgPortalData}>
        {children}
      </RequesterPortalFrame>
    </RequesterPortalOrgProvider>
  );
}
