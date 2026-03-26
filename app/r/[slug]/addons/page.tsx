import RequesterStepPlaceholder from "@/components/requester/RequesterStepPlaceholder";
import { getContinueHref } from "@/lib/requester-flow";

export default async function RequesterAddonsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <RequesterStepPlaceholder
      slug={slug}
      screenName="Add-ons"
      continueHref={getContinueHref(slug, "addons")}
      meta="Optional order add-ons — placeholder."
    />
  );
}
