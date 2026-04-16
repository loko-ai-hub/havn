import { CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; Icon: React.ElementType }
> = {
  paid: {
    label: "Open",
    className: "bg-havn-amber/10 text-havn-amber border-0",
    Icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-[hsl(220,50%,92%)] text-[hsl(220,50%,40%)] border-0",
    Icon: Loader2,
  },
  fulfilled: {
    label: "Completed",
    className: "bg-havn-success/10 text-havn-success border-0",
    Icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive border-0",
    Icon: XCircle,
  },
  refunded: {
    label: "Refunded",
    className: "bg-muted text-muted-foreground border-0",
    Icon: RotateCcw,
  },
  pending_payment: {
    label: "Unpaid",
    className: "bg-havn-amber/25 text-amber-950 border-havn-amber/40",
    Icon: Clock,
  },
};

export function getStatusCfg(status: string | null | undefined) {
  const s = status ?? "";
  return (
    STATUS_CONFIG[s] ?? {
      label: s.split("_").join(" ") || "Unknown",
      className: "bg-muted text-muted-foreground border-0",
      Icon: Clock,
    }
  );
}

export function OrderStatusBadge({ status }: { status: string | null | undefined }) {
  const cfg = getStatusCfg(status);
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        cfg.className
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
