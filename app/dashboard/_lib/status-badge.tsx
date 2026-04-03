import { cn } from "@/lib/utils";

export function OrderStatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "unknown";
  const label = s.split("_").join(" ");

  const styles: Record<string, string> = {
    pending_payment: "bg-havn-amber/25 text-amber-950 dark:text-amber-100 border-havn-amber/40",
    paid: "bg-blue-500/15 text-blue-900 dark:text-blue-100 border-blue-500/30",
    fulfilled: "bg-havn-success/20 text-emerald-950 dark:text-emerald-100 border-havn-success/40",
  };

  const fallback = "bg-muted text-muted-foreground border-border";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        styles[s] ?? fallback
      )}
    >
      {label}
    </span>
  );
}
