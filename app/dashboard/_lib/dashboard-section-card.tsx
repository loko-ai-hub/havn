import type { ReactNode } from "react";

export function DashboardSectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="bg-havn-navy rounded-t-xl px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white">{title}</h2>
      </div>
      <div className="space-y-4 bg-background p-5">{children}</div>
    </section>
  );
}
