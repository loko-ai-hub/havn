import RequesterStepPlaceholder from "@/components/requester/RequesterStepPlaceholder";
import { getContinueHref, REQUESTER_FLOW_STEPS } from "@/lib/requester-flow";

const step = REQUESTER_FLOW_STEPS.find((s) => s.id === "delivery")!;

export default async function RequesterDeliveryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <RequesterStepPlaceholder
      slug={slug}
      screenName={step.screenName}
      continueHref={getContinueHref(slug, "delivery")}
      meta="Standard vs rush tiers — placeholder."
    />
  );
}
