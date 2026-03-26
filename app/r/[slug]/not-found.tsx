import Link from "next/link";

export default function RequesterPortalNotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-havn-navy-muted">
        Havn Portal
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-havn-navy">
        Community portal not found
      </h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        The link you followed may be incorrect or this community hasn&apos;t set up
        their portal yet.
      </p>
      <Link
        href="mailto:support@havnhq.com"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        Contact support
      </Link>
    </div>
  );
}
