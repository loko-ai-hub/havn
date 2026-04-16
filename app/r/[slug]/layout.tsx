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
  const { data } = await supabase
    .from("organizations")
    .select(
      "id, name, portal_slug, brand_color, logo_url, portal_tagline, portal_display_name, support_email, is_active, document_request_fees(document_type)"
    )
    .eq("portal_slug", slug)
    .single();
  const org = data;

  if (!org || org.is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-havn-surface px-6">
        <p className="text-center text-base text-muted-foreground">
          This portal is not available.
        </p>
      </div>
    );
  }

  const availableDocTypes =
    (org.document_request_fees as { document_type: string }[] | null)?.map(
      (f) => f.document_type
    ) ?? [];

  const { document_request_fees: _fees, ...orgData } = org;

  return (
    <RequesterPortalOrgProvider org={{ ...(orgData as OrgPortalData), availableDocTypes }}>
      <RequesterPortalFrame slug={slug} org={orgData as OrgPortalData}>
        {children}
      </RequesterPortalFrame>
    </RequesterPortalOrgProvider>
  );
}
