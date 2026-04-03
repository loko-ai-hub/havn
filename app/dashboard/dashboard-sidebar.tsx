"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function DashboardSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  const ordersActive =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/orders");

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-foreground">
          Havn
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        <Link
          href="/dashboard"
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
            ordersActive
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          Orders
        </Link>
        <span
          className="cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/60"
          title="Coming soon"
        >
          Settings
        </span>
      </nav>

      <div className="border-t border-border p-4">
        <p className="truncate text-xs text-muted-foreground" title={email}>
          {email || "Signed in"}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </aside>
  );
}
