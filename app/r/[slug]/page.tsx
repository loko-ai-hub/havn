import { RequesterPortalLanding } from "@/components/requester/RequesterPortalLanding";
import { requesterPortalPath } from "@/lib/requester-flow";

export default async function RequesterPortalLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <RequesterPortalLanding
      slug={slug}
      startOrderHref={requesterPortalPath(slug, "role")}
    />
  );
}
