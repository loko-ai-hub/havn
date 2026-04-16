"use client";

import {
  BarChart3,
  Building2,
  DollarSign,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/dashboard",
  },
  {
    href: "/dashboard/requests",
    label: "Requests",
    icon: Inbox,
    match: (p) => p === "/dashboard/requests" || p.startsWith("/dashboard/requests/"),
  },
  {
    href: "/dashboard/communities",
    label: "Communities",
    icon: Building2,
    match: (p) => p.startsWith("/dashboard/communities"),
  },
  {
    href: "/dashboard/documents",
    label: "Documents",
    icon: FileText,
    match: (p) => p.startsWith("/dashboard/documents"),
  },
  {
    href: "/dashboard/pricing",
    label: "Pricing",
    icon: DollarSign,
    match: (p) => p.startsWith("/dashboard/pricing"),
  },
  {
    href: "/dashboard/performance",
    label: "Performance",
    icon: BarChart3,
    match: (p) => p.startsWith("/dashboard/performance"),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p.startsWith("/dashboard/settings"),
  },
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function DashboardSidebar({
  email,
  userName,
  userRole,
  portalSlug,
}: {
  email: string;
  userName: string;
  userRole: string;
  portalSlug: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  const initials = useMemo(() => initialsFromName(userName), [userName]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-havn-navy text-white">
      <div className="border-b border-white/10 px-5 py-4">
        <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-white">
          Havn
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {navItems.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white/80"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              {label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => toast.info("Help coming soon")}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white/80"
        >
          <span className="text-base leading-none">?</span>
          Help
        </button>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        {portalSlug ? (
          <a
            href={`https://havnhq.com/r/${portalSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            <span>View resident portal</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <span className="mt-0.5 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90">
              {userRole.replace(/_/g, " ")}
            </span>
          </div>
        </div>
        <p className="mt-2 truncate text-xs text-white/50" title={email}>
          {email}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </aside>
  );
}
