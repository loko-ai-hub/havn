"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function BlockedPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [checking, setChecking] = useState(true);

  // On load and periodically, check if the user has been unblocked
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const orgId = user.user_metadata?.organization_id as string | undefined;
      if (!orgId) {
        setChecking(false);
        return;
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("is_active")
        .eq("id", orgId)
        .single();

      if (org?.is_active !== false) {
        // Unblocked — send them to dashboard
        router.replace("/dashboard");
        return;
      }

      setChecking(false);
    };

    void check();
  }, [supabase, router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xl shadow-black/15">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Mail className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-foreground">
          Account unavailable
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your account is currently inactive. If you believe this is an error or need assistance, please reach out to our support team.
        </p>
        <a
          href="mailto:support@havnhq.com"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Mail className="h-4 w-4" />
          Contact support@havnhq.com
        </a>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            })();
          }}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
