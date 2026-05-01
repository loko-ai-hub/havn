"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function Home() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.trim() === "AmLo") {
      setUnlocked(true);
      return;
    }
    setError("Incorrect password");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 px-6 py-12">
      <main className="w-full max-w-md rounded-2xl border border-border bg-card p-10 shadow-lg shadow-black/5">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/havn-lockup-light.svg"
            alt="Havn"
            width={144}
            height={48}
            priority
            className="h-12 w-auto"
          />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Internal access only</p>
        </div>

        {!unlocked ? (
          <form onSubmit={handleContinue} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoComplete="off"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-ring/30 transition focus:ring-2"
                placeholder="Enter password"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-lg bg-havn-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Continue
            </button>
          </form>
        ) : (
          <div className="mt-8 grid gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg bg-havn-navy px-4 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
            >
              Management Dashboard
            </Link>
            <Link
              href="/r/amlo-management"
              className="rounded-lg border border-border bg-background px-4 py-3 text-center text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Requester Portal (AmLo)
            </Link>
            <Link
              href="/god-mode"
              className="rounded-lg border border-border bg-background px-4 py-3 text-center text-sm font-medium text-foreground transition hover:bg-muted"
            >
              God Mode
            </Link>
            <Link
              href="/onboarding"
              className="rounded-lg border border-border bg-background px-4 py-3 text-center text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Onboarding
            </Link>
            <Link
              href="/my-orders"
              className="rounded-lg border border-border bg-background px-4 py-3 text-center text-sm font-medium text-foreground transition hover:bg-muted"
            >
              My Orders
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-border bg-background px-4 py-3 text-center text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Login
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
