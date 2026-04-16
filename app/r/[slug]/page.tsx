import { RequesterPortalLanding } from "@/components/requester/RequesterPortalLanding";
import { requesterPortalPath } from "@/lib/requester-flow";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function RequesterPortalLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, name, portal_slug, brand_color, logo_url, portal_tagline, portal_display_name, is_active"
    )
    .eq("portal_slug", slug)
    .single();

  if (!org || org.is_active === false) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-center text-base text-muted-foreground">
          This portal is not available.
        </p>
      </div>
    );
  }

  return (
    <RequesterPortalLanding
      slug={slug}
      startOrderHref={requesterPortalPath(slug, "role")}
      companyName={org.portal_display_name ?? org.name}
      primaryColor={org.brand_color ?? "#1B2B4B"}
      welcomeMessage={
        org.portal_tagline ??
        "Request HOA and association documents for your closing or refinance."
      }
      logoUrl={org.logo_url}
    />
  );
}
