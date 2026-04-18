"use client";

import {
  BarChart3,
  Building2,
  DollarSign,
  ExternalLink,
  FileText,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string) => boolean;
};

// Matches Lovable order: Dashboard → Performance → Requests → Communities → Documents → Pricing → Settings
const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/dashboard",
  },
  {
    href: "/dashboard/performance",
    label: "Performance",
    icon: BarChart3,
    match: (p) => p.startsWith("/dashboard/performance"),
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
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p.startsWith("/dashboard/settings"),
  },
];

const ROLE_LABELS: Record<string, string> = {
  management_admin: "Admin",
  property_manager: "Manager",
  board_member: "Board Member",
  owner: "Owner",
};

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
  const [featureOpen, setFeatureOpen] = useState(false);
  const [featureText, setFeatureText] = useState("");
  const [featureSubmitting, setFeatureSubmitting] = useState(false);
  const [featureDone, setFeatureDone] = useState(false);

  const handleFeatureSubmit = async () => {
    if (!featureText.trim() || featureSubmitting) return;
    setFeatureSubmitting(true);
    try {
      await fetch("/api/feature-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: featureText, userName, userEmail: email }),
      });
      setFeatureDone(true);
      setFeatureText("");
      setTimeout(() => {
        setFeatureOpen(false);
        setFeatureDone(false);
      }, 2000);
    } finally {
      setFeatureSubmitting(false);
    }
  };

  const initials = useMemo(() => initialsFromName(userName), [userName]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col bg-havn-navy">
      {/* Logo */}
      <div className="px-6 py-6">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight text-havn-sand">
          Havn
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {navItems.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-havn-navy-light text-havn-sand"
                  : "text-havn-navy-muted hover:bg-havn-navy-light/50 hover:text-havn-sand/80"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => {}}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-havn-navy-muted transition-colors hover:bg-havn-navy-light/50 hover:text-havn-sand/80"
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          Help
        </button>

        <button
          type="button"
          onClick={() => setFeatureOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-havn-navy-muted transition-colors hover:bg-havn-navy-light/50 hover:text-havn-sand/80"
        >
          <Lightbulb className="h-4 w-4 shrink-0" />
          Request a Feature
        </button>
      </nav>

      {/* Bottom section */}
      <div className="space-y-3 border-t border-havn-navy-light px-4 py-4">
        {portalSlug ? (
          <a
            href={`https://havnhq.com/r/${portalSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-havn-navy-muted transition-colors hover:text-havn-sand"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            View resident portal →
          </a>
        ) : null}

        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-havn-navy-light text-xs font-semibold text-havn-sand">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-havn-sand">{userName}</p>
            <span className="mt-0.5 inline-block rounded-full bg-havn-navy-light px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-havn-navy-muted">
              {ROLE_LABELS[userRole] ?? userRole.replace(/_/g, " ")}
            </span>
          </div>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            className="shrink-0 rounded-md p-1.5 text-havn-navy-muted transition-colors hover:bg-havn-navy-light hover:text-havn-sand disabled:opacity-50"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Feature request modal */}
      {featureOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-havn-gold" />
                <h2 className="text-sm font-semibold text-foreground">Request a Feature</h2>
              </div>
              <button
                type="button"
                onClick={() => { setFeatureOpen(false); setFeatureText(""); setFeatureDone(false); }}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {featureDone ? (
              <p className="py-6 text-center text-sm text-havn-success font-medium">
                Thanks! We&apos;ll review your request.
              </p>
            ) : (
              <>
                <textarea
                  value={featureText}
                  onChange={(e) => setFeatureText(e.target.value)}
                  placeholder="Tell me about the feature you want…"
                  rows={5}
                  className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-havn-navy/20 resize-none"
                  autoFocus
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setFeatureOpen(false); setFeatureText(""); }}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!featureText.trim() || featureSubmitting}
                    onClick={() => void handleFeatureSubmit()}
                    className="rounded-lg bg-havn-navy px-4 py-2 text-sm font-medium text-havn-sand hover:bg-havn-navy-light transition-colors disabled:opacity-50"
                  >
                    {featureSubmitting ? "Sending…" : "Submit"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
