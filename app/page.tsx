"use client";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <main className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <h1 className="text-2xl font-semibold text-foreground">Havn Dev Launcher</h1>

        {!unlocked ? (
          <form onSubmit={handleContinue} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm text-muted-foreground">
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring/40 transition focus:ring-2"
              />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Continue
            </button>
          </form>
        ) : (
          <div className="mt-6 grid gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Management Dashboard
            </Link>
            <Link
              href="/r/amlo-management"
              className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
            >
              Requester Portal (AmLo)
            </Link>
            <Link
              href="/onboarding"
              className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
            >
              Onboarding
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
            >
              Login
            </Link>
            <Link
              href="/god-mode"
              className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
            >
              God Mode
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
