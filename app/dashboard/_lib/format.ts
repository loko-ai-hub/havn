export function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMasterTypeKey(key: string | null | undefined): string {
  if (!key) return "—";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function formatDeliverySpeed(speed: string | null | undefined): string {
  if (!speed) return "—";
  const map: Record<string, string> = {
    standard: "Standard",
    rush_3day: "Rush - 3 Day",
    rush_next_day: "Rush - Next Day",
    rush_same_day: "Rush - Same Day",
  };
  return map[speed] ?? formatMasterTypeKey(speed);
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
