import RequesterStepPlaceholder from "@/components/requester/RequesterStepPlaceholder";
import { getContinueHref, REQUESTER_FLOW_STEPS } from "@/lib/requester-flow";

const step = REQUESTER_FLOW_STEPS.find((s) => s.id === "track")!;

export default async function RequesterTrackOrderPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;

  return (
    <RequesterStepPlaceholder
      slug={slug}
      screenName={step.screenName}
      continueHref={getContinueHref(slug, "track")}
      meta={`Order ID: ${orderId}`}
    />
  );
}
