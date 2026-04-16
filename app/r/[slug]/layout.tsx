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
    .select("document_type")
    .eq("organization_id", org.id);

  const availableDocTypes = (feeRows ?? []).map((f) => f.document_type as string);

  return (
    <RequesterPortalOrgProvider org={{ ...(org as OrgPortalData), availableDocTypes }}>
      <RequesterPortalFrame slug={slug} org={org as OrgPortalData}>
        {children}
      </RequesterPortalFrame>
    </RequesterPortalOrgProvider>
  );
}
