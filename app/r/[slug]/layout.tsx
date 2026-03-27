import RequesterPortalFrame from "@/components/requester/RequesterPortalFrame";
import {
  RequesterPortalOrgProvider,
  type OrgPortalData,
} from "@/components/requester/RequesterPortalOrgContext";
import { createPublicClient } from "@/lib/supabase/public";

export default async function RequesterPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("organizations")
    .select(
      "id, name, portal_slug, brand_color, logo_url, portal_tagline, portal_display_name, support_email, is_active"
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

  return (
    <RequesterPortalOrgProvider org={org as OrgPortalData}>
      <RequesterPortalFrame slug={slug} org={org as OrgPortalData}>
        {children}
      </RequesterPortalFrame>
    </RequesterPortalOrgProvider>
  );
}
