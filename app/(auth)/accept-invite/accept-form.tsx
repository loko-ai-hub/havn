"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

import { acceptInvite } from "./actions";

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AcceptInviteForm({
  token,
  email,
  role,
  orgName,
}: {
  token: string;
  email: string;
  role: string;
  orgName: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const result = await acceptInvite(token, { firstName, lastName, password });
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      // Sign in with the new credentials using the browser client
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        toast.success("Account created! Please log in to continue.");
        router.push("/login");
        return;
      }
      toast.success("Welcome to Havn!");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-xl shadow-black/15">
      <h1 className="text-2xl font-semibold">Accept your invitation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You've been invited to join{" "}
        <span className="font-medium text-foreground">{orgName}</span> as{" "}
        <span className="font-medium text-foreground">{roleLabel(role)}</span>.
        Create your account below.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {/* Email — read-only, pre-filled from invite */}
        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">Email</label>
          <div className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground select-all">
            {email}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="accept-first" className="text-sm text-muted-foreground">
              First name
            </label>
            <input
              id="accept-first"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring/40 transition focus:ring-2"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="accept-last" className="text-sm text-muted-foreground">
              Last name
            </label>
            <input
              id="accept-last"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring/40 transition focus:ring-2"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="accept-password" className="text-sm text-muted-foreground">
            Password
          </label>
          <input
            id="accept-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring/40 transition focus:ring-2"
          />
          <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
        </div>

        {formError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <p className="text-sm text-destructive">{formError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Create account & join"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  );
}
