import RequesterStepPlaceholder from "@/components/requester/RequesterStepPlaceholder";
import { getContinueHref, REQUESTER_FLOW_STEPS } from "@/lib/requester-flow";

const step = REQUESTER_FLOW_STEPS.find((s) => s.id === "review")!;

export default async function RequesterReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <RequesterStepPlaceholder
      slug={slug}
      screenName={step.screenName}
      continueHref={getContinueHref(slug, "review")}
      meta="Order summary and payment — placeholder."
    />
  );
}
