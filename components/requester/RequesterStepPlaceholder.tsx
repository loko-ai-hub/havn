import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RequesterStepPlaceholder({
  slug,
  screenName,
  continueHref,
  continueLabel = "Continue",
  meta,
}: {
  slug: string;
  screenName: string;
  continueHref: string;
  continueLabel?: string;
  meta?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Requester portal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {screenName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Placeholder UI — organization slug:{" "}
          <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs text-foreground">
            {slug}
          </span>
        </p>
        {meta ? (
          <p className="text-sm text-muted-foreground">
            {meta}
          </p>
        ) : null}
      </div>
      <Link
        href={continueHref}
        className={cn(
          buttonVariants({ size: "lg" }),
          "inline-flex w-full justify-center sm:w-auto"
        )}
      >
        {continueLabel}
      </Link>
    </div>
  );
}
