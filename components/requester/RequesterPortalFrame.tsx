"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import PortalSidebar from "@/components/requester/PortalSidebar";

type OrgPortalData = {
  id: string;
  name: string;
  portal_slug: string;
  brand_color: string | null;
  logo_url: string | null;
  portal_tagline: string | null;
  portal_display_name: string | null;
  support_email: string | null;
  is_active: boolean | null;
};

function getCurrentStep(pathname: string): number {
  if (/\/r\/[^/]+$/.test(pathname)) return 0;
  if (pathname.includes("/role")) return 1;
  if (pathname.includes("/info")) return 2;
  if (pathname.includes("/property")) return 3;
  if (pathname.includes("/documents")) return 4;
  if (pathname.includes("/addons")) return 5;
  if (pathname.includes("/delivery")) return 6;
  if (pathname.includes("/review")) return 7;
  if (pathname.includes("/payment")) return 8;
  if (pathname.includes("/confirmation")) return 9;
  return 0;
}

function shouldShowSidebar(pathname: string): boolean {
  if (/\/r\/[^/]+$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/role$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/info$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/property$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/documents$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/addons$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/delivery$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/review$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/payment$/.test(pathname)) return true;
  if (/\/r\/[^/]+\/confirmation$/.test(pathname)) return true;
  return false;
}

function isTrackPage(pathname: string): boolean {
  return /\/r\/[^/]+\/track\/[^/]+$/.test(pathname);
}

export default function RequesterPortalFrame({
  slug,
  org,
  children,
}: {
  slug: string;
  org: OrgPortalData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isRouteVisible, setIsRouteVisible] = useState(false);
  const track = useMemo(() => isTrackPage(pathname), [pathname]);
  const showSidebar = useMemo(() => !track && shouldShowSidebar(pathname), [pathname, track]);
  const showPortalHeader = useMemo(() => !track, [track]);

  useEffect(() => {
    setIsRouteVisible(false);
    const frame = requestAnimationFrame(() => setIsRouteVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-havn-surface text-foreground">
      {showSidebar ? (
        <PortalSidebar
          slug={slug}
          companyName={org.name}
          logoUrl={org.logo_url}
          primaryColor={org.brand_color ?? "#1B2B4B"}
          currentStep={getCurrentStep(pathname)}
          requesterType={undefined}
        />
      ) : null}
      <main className="min-w-0 flex-1 h-screen overflow-y-auto">
        {showPortalHeader ? (
          <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
              <span className="text-lg font-semibold tracking-tight text-havn-navy">Havn</span>
              <code className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                havn.com/r/{slug}
              </code>
            </div>
          </header>
        ) : null}
        <div
          key={pathname}
          className={`transition-all duration-200 ease-out ${
            isRouteVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
