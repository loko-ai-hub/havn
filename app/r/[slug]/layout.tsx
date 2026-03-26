 "use client";

import { useParams, usePathname } from "next/navigation";

import PortalSidebar from "@/components/requester/PortalSidebar";

function getCurrentStep(pathname: string): number {
  if (pathname.includes("/role")) return 1;
  if (pathname.includes("/info")) return 2;
  if (pathname.includes("/property")) return 3;
  if (pathname.includes("/documents")) return 4;
  if (pathname.includes("/delivery")) return 5;
  if (pathname.includes("/addons")) return 6;
  if (pathname.includes("/review")) return 7;
  if (pathname.includes("/confirmation")) return 8;
  return 1;
}

export default function RequesterPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  return (
    <div className="flex min-h-screen bg-havn-surface text-foreground">
      <PortalSidebar
        slug={slug}
        companyName="Acme Corp"
        logoUrl={null}
        primaryColor="#1B2B4B"
        currentStep={getCurrentStep(pathname)}
        requesterType={undefined}
      />
      <main className="min-w-0 flex-1">
        <header className="border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
            <span className="text-lg font-semibold tracking-tight text-havn-navy">
              Havn
            </span>
            <code className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
              havn.com/r/{slug}
            </code>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
