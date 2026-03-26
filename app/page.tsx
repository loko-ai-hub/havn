import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <main className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <h1 className="text-2xl font-semibold text-foreground">Havn Local Switchboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Quick links for local testing.
        </p>

        <div className="mt-6 grid gap-3">
          <Link
            href="/onboarding"
            className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Onboarding
          </Link>
          <Link
            href="/requests"
            className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
          >
            Requests
          </Link>
          <Link
            href="/god-mode"
            className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
          >
            God Mode
          </Link>
        </div>
      </main>
    </div>
  );
}
