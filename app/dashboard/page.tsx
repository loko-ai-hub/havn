"use client";

import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  Clock,
  DollarSign,
  FileText,
  Link2,
  MapPin,
  MoreHorizontal,
  Plus,
  Timer,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import OnboardingChecklist, { type OnboardingTask } from "@/components/dashboard/onboarding-checklist";
import PayoutBanner from "@/components/dashboard/payout-banner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey } from "./_lib/format";
import { OrderStatusBadge } from "./_lib/status-badge";
import { fulfillOrder } from "./requests/actions";

type OrderRow = {
  id: string;
  created_at: string | null;
  requester_name: string | null;
  requester_email: string | null;
  property_address: string | null;
  master_type_key: string | null;
  delivery_speed: string | null;
  total_fee: number | null;
  order_status: string | null;
};

async function resolveOrg(supabase: ReturnType<typeof createClient>): Promise<{
  orgId: string;
  orgName: string;
  portalSlug: string | null;
  stripeConnected: boolean;
  stripePayoutsEnabled: boolean | null;
  stripeRequirementsDue: string[];
} | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let orgId: string | null =
    typeof user.user_metadata?.organization_id === "string" ? user.user_metadata.organization_id : null;
  if (!orgId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    orgId = profile?.organization_id ?? null;
  }
  if (!orgId) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, portal_slug, stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled, stripe_requirements_currently_due"
    )
    .eq("id", orgId)
    .single();

  // Definition of "Stripe ready to take payments AND payout":
  //   account exists + Stripe says payouts are enabled.
  // Fall back to onboarding_complete only when payouts_enabled hasn't been
  // synced yet (null = unknown — webhook hasn't fired for this org).
  const payoutsEnabled = (org?.stripe_payouts_enabled ?? null) as boolean | null;
  const stripeConnected =
    Boolean(org?.stripe_account_id) &&
    (payoutsEnabled === null
      ? Boolean(org?.stripe_onboarding_complete)
      : payoutsEnabled === true);

  return {
    orgId,
    orgName: (org?.name as string) ?? "",
    portalSlug: org?.portal_slug ?? null,
    stripeConnected,
    stripePayoutsEnabled: payoutsEnabled,
    stripeRequirementsDue: (org?.stripe_requirements_currently_due as string[] | null) ?? [],
  };
}

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function KpiCardWrapper({ href, children }: { href?: string; children: ReactNode }) {
  const className = cn(
    "group block rounded-xl border border-border bg-card p-5 text-left transition-all duration-200",
    "hover:-translate-y-0.5 hover:border-muted-foreground/40 hover:shadow-md",
    href && "cursor-pointer"
  );
  if (href) {
    return <Link href={href} className={className}>{children}</Link>;
  }
  return <div className={className}>{children}</div>;
}

function ChecklistSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      <Skeleton className="mb-5 h-2 w-full rounded-full" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="mt-0.5 h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentOrdersSection({
  loading,
  recent,
  onMarkFulfilled,
}: {
  loading: boolean;
  recent: OrderRow[];
  onMarkFulfilled: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">Recent orders</h2>
        <Link
          href="/dashboard/requests"
          className="text-sm font-medium text-havn-navy underline-offset-4 hover:underline dark:text-white"
        >
          View all requests →
        </Link>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No orders yet. Share your portal link to receive requests.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Order #</TableHead>
                <TableHead className="text-muted-foreground">Requester</TableHead>
                <TableHead className="text-muted-foreground">Property</TableHead>
                <TableHead className="text-muted-foreground">Document</TableHead>
                <TableHead className="text-muted-foreground">Delivery</TableHead>
                <TableHead className="text-muted-foreground">Amount</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="w-[100px] text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((order) => {
                const detailHref = `/dashboard/requests/${order.id}`;
                const shortId = order.id.slice(0, 8);
                const canFulfill = order.order_status !== "fulfilled";
                return (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer border-border hover:bg-muted/30"
                    onClick={() => router.push(detailHref)}
                  >
                    <TableCell className="text-foreground">{formatOrderDate(order.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground">{shortId}</TableCell>
                    <TableCell>
                      <span className="block font-medium text-foreground">{order.requester_name || "—"}</span>
                      <span className="block text-xs text-muted-foreground">{order.requester_email || "—"}</span>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {order.property_address || "—"}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {formatMasterTypeKey(order.master_type_key)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDeliverySpeed(order.delivery_speed)}
                    </TableCell>
                    <TableCell className="tabular-nums text-foreground">
                      {formatCurrency(order.total_fee)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <OrderStatusBadge status={order.order_status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Popover>
                        <PopoverTrigger
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1">
                          <Link
                            href={detailHref}
                            className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
                          >
                            Open
                          </Link>
                          {canFulfill ? (
                            <button
                              type="button"
                              className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                              onClick={() => void onMarkFulfilled(order.id)}
                            >
                              Mark Fulfilled
                            </button>
                          ) : null}
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function DashboardHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // KPI state
  const [openRequests, setOpenRequests] = useState(0);
  const [autoCompletedPct, setAutoCompletedPct] = useState(0);
  const [timeSavedHours, setTimeSavedHours] = useState(0);
  const [pagesProcessed, setPagesProcessed] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  // used by checklist
  const [docsIndexed, setDocsIndexed] = useState(0);

  // Org state
  const [portalSlug, setPortalSlug] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(true);
  const [stripeRequirementsDue, setStripeRequirementsDue] = useState<string[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [communitiesCount, setCommunitiesCount] = useState(0);
  const [feesCount, setFeesCount] = useState(0);
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string>("");

  // Checklist dismissal — persisted per-user via profiles.checklist_dismissed_at.
  // Optimistic local state; server is source of truth.
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  const [recent, setRecent] = useState<OrderRow[]>([]);

  // Read persisted dismissal from the user's profile on mount. Also clear any
  // stale localStorage flag from before we moved to the per-user DB approach.
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("havn_checklist_dismissed");
    }
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("checklist_dismissed_at")
        .eq("id", user.id)
        .maybeSingle();
      setChecklistDismissed(Boolean(data?.checklist_dismissed_at));
    })();
  }, []);

  const handleDismissChecklist = () => {
    setChecklistDismissed(true);
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ checklist_dismissed_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) {
        console.warn("[checklist] dismiss failed:", error.message);
        // Roll back optimistic state so the UI stays consistent.
        setChecklistDismissed(false);
      }
    })();
  };

  const handleShowChecklist = () => {
    setChecklistDismissed(false);
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ checklist_dismissed_at: null })
        .eq("id", user.id);
      if (error) {
        console.warn("[checklist] re-show failed:", error.message);
        setChecklistDismissed(true);
      }
    })();
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const resolved = await resolveOrg(supabase);
    if (!resolved) {
      setError("No organization linked to this account.");
      setLoading(false);
      return;
    }
    const {
      orgId,
      orgName: name,
      portalSlug: slug,
      stripeConnected: stripe,
      stripeRequirementsDue: requirementsDue,
    } = resolved;
    setOrgId(orgId);
    setPortalSlug(slug);
    setStripeConnected(stripe);
    setStripeRequirementsDue(requirementsDue);
    setOrgName(name);

    const cid = selectedCommunity || null;
    // Order queries: filter by community_id if a community is selected
    let openQ = supabase.from("document_orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("order_status", ["paid", "in_progress"]);
    let fulQ = supabase.from("document_orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("order_status", "fulfilled");
    let revQ = supabase.from("document_orders").select("total_fee").eq("organization_id", orgId).in("order_status", ["paid", "fulfilled"]);
    let recentQ = supabase.from("document_orders").select("id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status").eq("organization_id", orgId).neq("order_status", "pending_payment").order("created_at", { ascending: false }).limit(5);
    // Doc queries: filter by community_id
    let indexedQ = supabase.from("community_documents").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("ocr_status", "complete");
    let totalDocsQ = supabase.from("community_documents").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    let pagesQ = supabase.from("community_documents").select("page_count").eq("organization_id", orgId);

    if (cid) {
      openQ = openQ.eq("community_id", cid);
      fulQ = fulQ.eq("community_id", cid);
      revQ = revQ.eq("community_id", cid);
      recentQ = recentQ.eq("community_id", cid);
      indexedQ = indexedQ.eq("community_id", cid);
      totalDocsQ = totalDocsQ.eq("community_id", cid);
      pagesQ = pagesQ.eq("community_id", cid);
    }

    const [openRes, fulRes, revRes, indexedRes, totalDocsRes, pagesRes, recentRes, commRes, feesRes, commListRes] = await Promise.all([
      openQ, fulQ, revQ, indexedQ, totalDocsQ, pagesQ, recentQ,
      // Checklist: communities count
      supabase.from("communities").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      // Checklist: fees count
      supabase.from("document_request_fees").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      // Community dropdown list
      supabase.from("communities").select("id, legal_name").eq("organization_id", orgId).order("legal_name"),
    ]);

    if (openRes.error || fulRes.error || revRes.error || indexedRes.error || recentRes.error) {
      setError((openRes.error ?? fulRes.error ?? revRes.error ?? indexedRes.error ?? recentRes.error)?.message ?? "Failed to load dashboard data.");
      setLoading(false);
      return;
    }

    const fulfilledCount = fulRes.count ?? 0;
    const indexedCount = indexedRes.count ?? 0;
    const totalDocsCount = totalDocsRes.count ?? 0;
    const pctComplete = totalDocsCount > 0 ? Math.round((indexedCount / totalDocsCount) * 100) : 0;
    const pages = (pagesRes.data ?? []).reduce((s, r) => s + (Number((r as { page_count: number | null }).page_count) || 0), 0);

    setOpenRequests(openRes.count ?? 0);
    setAutoCompletedPct(pctComplete);
    // 3 min per auto-filled cell, ~20 cells per fulfilled order
    setTimeSavedHours(Math.round(fulfilledCount * 20 * 3 / 60));
    setPagesProcessed(pages);
    const revSum = (revRes.data ?? []).reduce((s, r) => s + (Number((r as { total_fee: number | null }).total_fee) || 0), 0);
    setTotalRevenue(revSum);
    setDocsIndexed(indexedCount);
    setRecent((recentRes.data ?? []) as OrderRow[]);
    setCommunitiesCount(commRes.count ?? 0);
    setFeesCount(feesRes.count ?? 0);
    setCommunities((commListRes.data ?? []).map((r) => ({ id: (r as { id: string; legal_name: string }).id, name: (r as { id: string; legal_name: string }).legal_name })));
    setLoading(false);
  }, [selectedCommunity]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  // Re-fetch dashboard data when the operator returns to this tab (e.g. after
  // completing bank-account setup in the Stripe tab) so the payout banner and
  // checklist update without a manual refresh.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  const handleMarkFulfilled = async (orderId: string) => {
    const result = await fulfillOrder(orderId);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Order marked fulfilled.");
    await load();
    router.refresh();
  };

  const handleSharePortal = async () => {
    if (!portalSlug) return;
    try {
      await navigator.clipboard.writeText(`havnhq.com/r/${portalSlug}`);
      toast.success("Portal link copied!");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const tasks: OnboardingTask[] = [
    { id: "account", label: "Create account", completed: true },
    {
      id: "pricing",
      label: "Establish pricing",
      completed: feesCount > 0,
      actionLabel: "Set up pricing →",
      actionRoute: "/dashboard/pricing",
    },
    {
      id: "portal",
      label: "Launch your portal",
      completed: !!portalSlug,
      actionLabel: "Set up portal →",
      actionRoute: "/dashboard/settings",
    },
    {
      id: "bank",
      label: "Connect your bank account",
      completed: stripeConnected,
      actionLabel: "Set up payments →",
      actionRoute: "/dashboard/settings",
      subtext: "Payments are processing, but you won't receive any funds until your account is connected.",
      statusColor: "amber",
    },
    {
      id: "communities",
      label: "Upload your communities",
      completed: communitiesCount > 0,
      actionRoute: "/dashboard/communities",
      subtext: "Auto-fills future orders with property details.",
      optional: true,
      icon: Building2,
    },
    {
      id: "documents",
      label: "Upload association documents",
      completed: docsIndexed > 0,
      actionRoute: "/dashboard/documents",
      subtext: "Maximizes document auto-fill on every order.",
      optional: true,
      icon: FileText,
    },
    {
      id: "addresses",
      label: "Upload addresses in your communities",
      completed: communitiesCount > 0,
      actionRoute: "/dashboard/communities",
      subtext: "Auto-routes inbound requests to the right manager.",
      optional: true,
      icon: MapPin,
    },
  ];

  const showChecklist = !loading && !checklistDismissed && tasks.some((t) => !t.completed);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {loading ? (
          <Skeleton className="mb-2 h-5 w-48" />
        ) : (
          orgName && (
            <h1 className="mb-2 text-lg font-semibold tracking-tight text-foreground">{orgName}</h1>
          )
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Community selector */}
            <div className="relative inline-block">
              <select
                value={selectedCommunity}
                onChange={(e) => setSelectedCommunity(e.target.value)}
                className="appearance-none cursor-pointer rounded-lg border border-border bg-card py-2.5 pl-4 pr-10 text-sm font-semibold text-foreground outline-none transition-colors hover:border-muted-foreground focus:border-muted-foreground"
              >
                <option value="">All communities</option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            {/* Add community */}
            <Link
              href="/dashboard/communities"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Plus className="h-4 w-4" />
              Add community
            </Link>
          </div>
          {/* Share portal link */}
          <button
            type="button"
            disabled={!portalSlug}
            onClick={() => void handleSharePortal()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-havn-navy px-4 py-2.5 text-sm font-medium text-havn-sand transition-colors hover:bg-havn-navy-light disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            Share portal link
          </button>
        </div>
      </div>

      {/* Payout banner */}
      {!loading && !stripeConnected && orgId && (
        <PayoutBanner orgId={orgId} requirementsDue={stripeRequirementsDue} />
      )}

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* KPI cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="mt-3 h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-24" />
              <Skeleton className="mt-1.5 h-2.5 w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: "Open requests",
              value: String(openRequests),
              subtext: "Orders not yet completed",
              icon: Clock,
              accent: "text-havn-cyan",
              iconBg: "bg-havn-cyan/10",
              href: "/dashboard/requests",
              delay: 0,
            },
            {
              label: "Auto-completed",
              value: `${autoCompletedPct}%`,
              subtext: "Of uploaded documents",
              icon: Zap,
              accent: "text-havn-cyan",
              iconBg: "bg-havn-cyan/10",
              delay: 60,
            },
            {
              label: "Pages processed",
              value: pagesProcessed.toLocaleString(),
              subtext: "Total all time",
              icon: FileText,
              accent: "text-havn-cyan",
              iconBg: "bg-havn-cyan/10",
              delay: 120,
            },
            {
              label: "Time saved",
              value: `${timeSavedHours}h`,
              subtext: "Estimated from auto-fill",
              icon: Timer,
              accent: "text-havn-cyan",
              iconBg: "bg-havn-cyan/10",
              delay: 180,
            },
            {
              label: "Lifetime earnings",
              value: `$${Math.round(totalRevenue).toLocaleString("en-US")}`,
              subtext: "All time",
              icon: DollarSign,
              accent: "text-havn-cyan",
              iconBg: "bg-havn-cyan/10",
              delay: 240,
            },
          ].map((card) => (
            <KpiCardWrapper key={card.label} href={card.href}>
              <div
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
                  card.iconBg
                )}
              >
                <card.icon className={cn("h-4 w-4", card.accent)} />
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">{card.value}</p>
              <p className="mt-1 text-xs font-medium text-foreground/80">{card.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{card.subtext}</p>
            </KpiCardWrapper>
          ))}
        </div>
      )}

      {/* Main content — two-column when checklist visible (or during initial load
          since most new orgs will see the checklist on first paint, so matching
          that layout up front avoids a jump after data resolves). */}
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChecklistSkeleton />
          <RecentOrdersSection loading={loading} recent={recent} onMarkFulfilled={handleMarkFulfilled} />
        </div>
      ) : showChecklist ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <OnboardingChecklist tasks={tasks} onDismiss={handleDismissChecklist} />
          <RecentOrdersSection loading={loading} recent={recent} onMarkFulfilled={handleMarkFulfilled} />
        </div>
      ) : (
        <>
          {/* Bring-it-back affordance: if the operator dismissed the checklist
              but still has open tasks, give them a way to re-open it instead
              of stranding the dismissal forever. */}
          {checklistDismissed && tasks.some((t) => !t.completed) && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleShowChecklist}
                className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                Show setup checklist
              </button>
            </div>
          )}
          <RecentOrdersSection loading={loading} recent={recent} onMarkFulfilled={handleMarkFulfilled} />
        </>
      )}
    </div>
  );
}
