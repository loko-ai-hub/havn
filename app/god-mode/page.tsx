"use client";

import type { DateRange } from "react-day-picker";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Home,
  LayoutTemplate,
  MoreHorizontal,
  Settings2,
  Upload,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { US_STATES } from "@/lib/us-states";
import { cn } from "@/lib/utils";

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey } from "../dashboard/_lib/format";
import { OrderStatusBadge } from "../dashboard/_lib/status-badge";
import { fulfillOrder } from "../dashboard/requests/actions";
import {
  loadLatestLegalChecks,
  loadStateConfigs,
  runLegalCheckForState,
  saveStateConfig,
  type LegalCheckResult,
  type StateConfig,
  type StateServiceRow,
} from "./actions";

const MOCK_ANALYTICS = {
  totalLifetimeOrders: 1247,
  lifetimeRevenue: 342850,
  ordersThisMonth: 89,
  revenueThisMonth: 24475,
  avgAutoFillRate: 82,
  totalTimeSavedHours: 312,
  activeManagementCompanies: 1,
  activeSelfManaged: 0,
  ordersByMonth: [
    { month: "Oct", count: 156 },
    { month: "Nov", count: 189 },
    { month: "Dec", count: 142 },
    { month: "Jan", count: 201 },
    { month: "Feb", count: 210 },
    { month: "Mar", count: 89 },
  ],
  topTemplates: [
    { name: "WA Resale Certificate", usage: 423 },
    { name: "WA Lender Questionnaire", usage: 287 },
    { name: "WA Certificate Update", usage: 156 },
    { name: "WA Demand Letter", usage: 98 },
  ],
  stateAnalytics: [
    {
      state: "WA",
      totalOrders: 1247,
      ordersThisMonth: 89,
      avgAutoFillRate: 82,
      avgProcessingDays: 4.2,
      companiesActive: 1,
    },
  ],
  autoFillTrend: [68, 72, 75, 78, 80, 82],
};

const MOCK_TEMPLATES = [
  {
    id: "t1",
    name: "WA Resale Certificate v3",
    type: "Resale Certificate",
    version: "3.2",
    lastUpdated: "2026-03-10",
    lastUpdatedBy: "Loren Kosloske",
    fieldsCount: 47,
    usageCount: 423,
    status: "active" as const,
    liveStates: ["WA"],
  },
  {
    id: "t2",
    name: "WA Lender Questionnaire v2",
    type: "Lender Questionnaire",
    version: "2.1",
    lastUpdated: "2026-02-28",
    lastUpdatedBy: "Loren Kosloske",
    fieldsCount: 62,
    usageCount: 287,
    status: "active" as const,
    liveStates: ["WA"],
  },
  {
    id: "t3",
    name: "WA Certificate Update v1",
    type: "Certificate Update",
    version: "1.0",
    lastUpdated: "2026-01-15",
    lastUpdatedBy: "Loren Kosloske",
    fieldsCount: 28,
    usageCount: 156,
    status: "active" as const,
    liveStates: ["WA"],
  },
  {
    id: "t4",
    name: "WA Demand Letter v1",
    type: "Demand Letter",
    version: "1.0",
    lastUpdated: "2026-01-15",
    lastUpdatedBy: "Loren Kosloske",
    fieldsCount: 19,
    usageCount: 98,
    status: "active" as const,
    liveStates: ["WA"],
  },
  {
    id: "t5",
    name: "CA Resale Certificate Draft",
    type: "Resale Certificate",
    version: "0.1",
    lastUpdated: "2026-03-18",
    lastUpdatedBy: "Loren Kosloske",
    fieldsCount: 51,
    usageCount: 0,
    status: "draft" as const,
    liveStates: [] as string[],
  },
];

const MOCK_UPLOADED = [
  {
    id: "u1",
    fileName: "AmLo_Resale_Cert_2026.pdf",
    companyName: "AmLo Management",
    documentType: "Resale Certificate",
    uploadedBy: "Loren Kosloske",
    uploadedByEmail: "loren@havnhq.com",
    uploadedAt: "2026-03-15",
    status: "approved" as const,
    emailDomains: ["havnhq.com", "amlo-management.com"],
    notes: "",
    reviewedBy: "Loren Kosloske",
    reviewedAt: "2026-03-16",
  },
  {
    id: "u2",
    fileName: "AmLo_Lender_Q_v2.pdf",
    companyName: "AmLo Management",
    documentType: "Lender Questionnaire",
    uploadedBy: "Loren Kosloske",
    uploadedByEmail: "loren@havnhq.com",
    uploadedAt: "2026-03-18",
    status: "pending" as const,
    emailDomains: [] as string[],
    notes: "",
    reviewedBy: null as string | null,
    reviewedAt: null as string | null,
  },
  {
    id: "u3",
    fileName: "Legacy_Demand_Letter.pdf",
    companyName: "AmLo Management",
    documentType: "Demand Letter",
    uploadedBy: "Loren Kosloske",
    uploadedByEmail: "loren@havnhq.com",
    uploadedAt: "2026-03-01",
    status: "rejected" as const,
    emailDomains: [] as string[],
    notes: "Template format incompatible.",
    reviewedBy: "Loren Kosloske",
    reviewedAt: "2026-03-02",
  },
];

type GodModeService = {
  master_type_key: string;
  serviceType: string;
  formalName: string;
  pricingCap: number | null;
  capType: "fixed" | "actual";
  rushCap: number | null;
  noRush: boolean;
  standardTurnaround: number;
  autoRefundOnMiss: boolean;
  autoRefundNote?: string;
  statute: string;
  recommendedDefault: number | null;
  aiMemory: string;
};

type GodModeStateConfig = {
  state: string;
  stateName: string;
  enabled: boolean;
  notes: string;
  services: GodModeService[];
};

const SERVICE_TYPE_OPTIONS = [
  "resale_certificate",
  "certificate_update",
  "lender_questionnaire",
  "demand_letter",
  "estoppel_letter",
  "governing_documents",
] as const;

function stateConfigFromDb(cfg: StateConfig): GodModeStateConfig {
  return {
    state: cfg.state,
    stateName: cfg.stateName,
    enabled: cfg.enabled,
    notes: cfg.notes,
    services: cfg.services.map((svc) => ({
      master_type_key: svc.master_type_key,
      serviceType: formatMasterTypeKey(svc.master_type_key),
      formalName: svc.formal_name,
      pricingCap: svc.pricing_cap,
      capType: svc.cap_type,
      rushCap: svc.rush_cap,
      noRush: svc.no_rush,
      standardTurnaround: svc.standard_turnaround,
      autoRefundOnMiss: svc.auto_refund_on_miss,
      autoRefundNote: svc.auto_refund_note,
      statute: svc.statute,
      recommendedDefault: svc.recommended_default,
      aiMemory: svc.ai_memory,
    })),
  };
}

function serviceToDbRow(svc: GodModeService): StateServiceRow {
  return {
    master_type_key: svc.master_type_key,
    formal_name: svc.formalName,
    pricing_cap: svc.pricingCap,
    cap_type: svc.capType,
    rush_cap: svc.rushCap,
    no_rush: svc.noRush,
    standard_turnaround: svc.standardTurnaround,
    auto_refund_on_miss: svc.autoRefundOnMiss,
    auto_refund_note: svc.autoRefundNote ?? "",
    statute: svc.statute,
    recommended_default: svc.recommendedDefault,
    ai_memory: svc.aiMemory,
  };
}

const MOCK_AUDIT_LOG: { id: string; at: string; actor: string; summary: string }[] = [
  {
    id: "a1",
    at: "2026-03-18 09:12",
    actor: "Loren Kosloske",
    summary: "Updated WA Resale Certificate rush cap settings",
  },
  {
    id: "a2",
    at: "2026-03-17 14:40",
    actor: "Loren Kosloske",
    summary: "CA draft template version bumped to 0.1",
  },
  {
    id: "a3",
    at: "2026-03-15 11:05",
    actor: "Loren Kosloske",
    summary: "TX statutory reference corrected for resale certificate",
  },
  {
    id: "a4",
    at: "2026-03-12 16:22",
    actor: "Loren Kosloske",
    summary: "WA recommended default fee aligned to $275 cap",
  },
  {
    id: "a5",
    at: "2026-03-10 10:00",
    actor: "Loren Kosloske",
    summary: "FL rush eligibility reviewed (no code change)",
  },
  {
    id: "a6",
    at: "2026-03-08 08:45",
    actor: "Loren Kosloske",
    summary: "CO lender questionnaire cap type set to actual cost",
  },
  {
    id: "a7",
    at: "2026-03-05 13:30",
    actor: "Loren Kosloske",
    summary: "WA auto-refund on miss enabled for resale certificate",
  },
];

const ANALYTICS_STATE_PILLS = ["WA", "CA", "TX", "FL", "CO", "VA", "AZ", "NV", "NC", "GA"] as const;

type TabId =
  | "home"
  | "analytics"
  | "customers"
  | "order-lookup"
  | "templates"
  | "uploaded"
  | "document-review"
  | "state-config";

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

type AnalyticsPreset = "7d" | "30d" | "90d" | "180d" | "all" | "custom";

type UploadedRow = (typeof MOCK_UPLOADED)[number];

type SortKey = "fileName" | "companyName" | "documentType" | "uploadedBy" | "uploadedAt" | "status";

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function PlatformKpiCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {subtext ? <p className="mt-1 text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function PillBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}

function analyticsScale(preset: AnalyticsPreset, customRange: DateRange | undefined): number {
  if (preset === "all") return 1;
  if (preset === "custom") {
    const from = customRange?.from;
    const to = customRange?.to;
    if (from && to) {
      const d = differenceInCalendarDays(to, from) + 1;
      return Math.min(1, Math.max(d, 1) / 365);
    }
    return 30 / 365;
  }
  const days =
    preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "90d" ? 90 : preset === "180d" ? 180 : 365;
  return Math.min(1, days / 365);
}

export default function GodModePage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("home");
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [platformRevenue, setPlatformRevenue] = useState<number | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");

  const [analyticsPreset, setAnalyticsPreset] = useState<AnalyticsPreset>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [analyticsStatesAll, setAnalyticsStatesAll] = useState(true);
  const [analyticsStatePick, setAnalyticsStatePick] = useState<Set<string>>(() => new Set());

  const [templateSearch, setTemplateSearch] = useState("");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  const [uploadedFilter, setUploadedFilter] = useState<"all" | "approved" | "rejected">("all");
  const [uploadedExpanded, setUploadedExpanded] = useState<string | null>(null);
  const [uploadedSort, setUploadedSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "uploadedAt",
    dir: "desc",
  });
  const [uploadedDomainDraft, setUploadedDomainDraft] = useState<Record<string, string>>({});
  const [uploadedDomainsById, setUploadedDomainsById] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const u of MOCK_UPLOADED) m[u.id] = [...u.emailDomains];
    return m;
  });

  const [reviewSelectedId, setReviewSelectedId] = useState<string | null>("u2");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewTemplateId, setReviewTemplateId] = useState("t1");
  const [reviewDomainInput, setReviewDomainInput] = useState("");
  const [reviewDomains, setReviewDomains] = useState<string[]>([]);
  const [reviewStates, setReviewStates] = useState<Set<string>>(() => new Set(["WA"]));

  const [stateConfigDraft, setStateConfigDraft] = useState<GodModeStateConfig[]>([]);
  const [stateConfigBaseline, setStateConfigBaseline] = useState<GodModeStateConfig[]>([]);
  const [stateConfigsLoading, setStateConfigsLoading] = useState(true);
  const [selectedConfigState, setSelectedConfigState] = useState("");
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const [stateConfigSaving, setStateConfigSaving] = useState(false);
  const [legalChecks, setLegalChecks] = useState<Record<string, LegalCheckResult>>({});
  const [legalCheckRunning, setLegalCheckRunning] = useState(false);
  const [auditShowAll, setAuditShowAll] = useState(false);

  const scale = useMemo(
    () => analyticsScale(analyticsPreset, customRange),
    [analyticsPreset, customRange]
  );

  const navItems: { id: TabId; label: string; icon: typeof Home }[] = useMemo(
    () => [
      { id: "home", label: "Home", icon: Home },
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "customers", label: "Customers", icon: Users2 },
      { id: "order-lookup", label: "Order Lookup", icon: ClipboardList },
      { id: "templates", label: "Havn Templates", icon: LayoutTemplate },
      { id: "uploaded", label: "Uploaded Templates", icon: Upload },
      { id: "document-review", label: "Document Review", icon: FileText },
      { id: "state-config", label: "State Config", icon: Settings2 },
    ],
    []
  );

  const loadKpis = useCallback(async () => {
    const supabase = createClient();
    const [countRes, revRes] = await Promise.all([
      supabase.from("document_orders").select("id", { count: "exact", head: true }),
      supabase.from("document_orders").select("total_fee").in("order_status", ["paid", "fulfilled"]),
    ]);
    if (!countRes.error) setOrderCount(countRes.count ?? 0);
    if (!revRes.error) {
      const sum = (revRes.data ?? []).reduce((s, r) => s + (Number((r as { total_fee: number | null }).total_fee) || 0), 0);
      setPlatformRevenue(sum);
    }
  }, []);

  const loadAllOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("document_orders")
      .select(
        "id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setOrdersError(error.message);
      setOrders([]);
    } else {
      setOrders((data ?? []) as OrderRow[]);
    }
    setOrdersLoading(false);
  }, []);

  const loadConfigs = useCallback(async () => {
    setStateConfigsLoading(true);
    const [result, checksResult] = await Promise.all([
      loadStateConfigs(),
      loadLatestLegalChecks(),
    ]);
    if ("error" in result) {
      toast.error(result.error);
      setStateConfigsLoading(false);
      return;
    }
    if (!("error" in checksResult)) {
      setLegalChecks(checksResult);
    }
    const mapped = result.map(stateConfigFromDb);
    setStateConfigDraft(mapped);
    setStateConfigBaseline(deepClone(mapped));
    if (mapped.length > 0 && !selectedConfigState) {
      setSelectedConfigState(mapped[0].state);
    }
    setStateConfigsLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadKpis();
    void loadConfigs();
  }, [loadKpis, loadConfigs]);

  useEffect(() => {
    if (tab === "order-lookup") void loadAllOrders();
  }, [tab, loadAllOrders]);

  useEffect(() => {
    const row = MOCK_UPLOADED.find((u) => u.id === reviewSelectedId);
    if (row) {
      setReviewDomains([...row.emailDomains]);
      setReviewTemplateId(MOCK_TEMPLATES[0]?.id ?? "t1");
    }
  }, [reviewSelectedId]);

  const handleMarkFulfilled = async (orderId: string) => {
    const result = await fulfillOrder(orderId);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Order marked fulfilled.");
    await loadAllOrders();
    await loadKpis();
    router.refresh();
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const idMatch = o.id.toLowerCase().includes(q);
      const name = (o.requester_name ?? "").toLowerCase();
      const email = (o.requester_email ?? "").toLowerCase();
      const prop = (o.property_address ?? "").toLowerCase();
      return idMatch || name.includes(q) || email.includes(q) || prop.includes(q);
    });
  }, [orders, orderSearch]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return MOCK_TEMPLATES;
    return MOCK_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.version.toLowerCase().includes(q)
    );
  }, [templateSearch]);

  const sortedUploaded = useMemo(() => {
    let rows: UploadedRow[] = [...MOCK_UPLOADED];
    if (uploadedFilter === "approved") rows = rows.filter((r) => r.status === "approved");
    if (uploadedFilter === "rejected") rows = rows.filter((r) => r.status === "rejected");
    const { key, dir } = uploadedSort;
    rows.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      let cmp = 0;
      if (va == null || vb == null) cmp = String(va).localeCompare(String(vb));
      else if (typeof va === "string" && typeof vb === "string") cmp = va.localeCompare(vb);
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [uploadedFilter, uploadedSort]);

  const toggleUploadedSort = (key: SortKey) => {
    setUploadedSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const pendingReviewQueue = useMemo(() => MOCK_UPLOADED.filter((u) => u.status === "pending"), []);
  const reviewedQueue = useMemo(() => MOCK_UPLOADED.filter((u) => u.status !== "pending"), []);

  const selectedStateConfig = stateConfigDraft.find((c) => c.state === selectedConfigState);
  const selectedService = selectedStateConfig?.services[selectedServiceIndex];

  const unconfiguredStates = US_STATES.filter((s) => !stateConfigDraft.some((c) => c.state === s.abbr));

  const applyStateConfigUpdate = (updater: (draft: GodModeStateConfig[]) => GodModeStateConfig[]) => {
    setStateConfigDraft((prev) => updater(deepClone(prev)));
  };

  const kpiOrders = Math.max(0, Math.round(MOCK_ANALYTICS.totalLifetimeOrders * scale));
  const kpiRevenue = Math.max(0, Math.round(MOCK_ANALYTICS.lifetimeRevenue * scale));
  const kpiOrdersMonth = Math.max(0, Math.round(MOCK_ANALYTICS.ordersThisMonth * scale));
  const kpiRevenueMonth = Math.max(0, Math.round(MOCK_ANALYTICS.revenueThisMonth * scale));
  const kpiTimeSaved = Math.max(0, Math.round(MOCK_ANALYTICS.totalTimeSavedHours * scale));

  const scaledOrderBars = MOCK_ANALYTICS.ordersByMonth.map((m) => ({
    ...m,
    count: Math.max(0, Math.round(m.count * scale)),
  }));
  const maxScaledOrders = Math.max(...scaledOrderBars.map((m) => m.count), 1);

  const autoFillTrend = MOCK_ANALYTICS.autoFillTrend.map((v) => Math.min(100, Math.round(v * (0.85 + scale * 0.15))));
  const maxAutoFill = Math.max(...autoFillTrend, 1);
  const maxTopTemplateUsage = Math.max(...MOCK_ANALYTICS.topTemplates.map((t) => t.usage), 1);

  const showStateBreakdown = !analyticsStatesAll && analyticsStatePick.size > 0;
  const stateBreakdownRows = showStateBreakdown
    ? MOCK_ANALYTICS.stateAnalytics.filter((r) => analyticsStatePick.has(r.state))
    : MOCK_ANALYTICS.stateAnalytics;

  const reviewItem = MOCK_UPLOADED.find((u) => u.id === reviewSelectedId);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 shrink-0 flex-col bg-havn-navy text-white">
        <div className="border-b border-white/10 px-5 py-4">
          <span className="text-xl font-semibold tracking-tight text-white">Havn</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                tab === id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/80"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              <span className="min-w-0 leading-snug">{label}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            href="/dashboard"
            className="block rounded-lg px-3 py-2.5 text-center text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
          >
            Exit to Dashboard
          </Link>
        </div>
      </aside>

      <main className="ml-64 min-h-screen flex-1 overflow-y-auto px-8 py-8">
        {tab === "home" ? (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
              <p className="mt-1 text-sm text-muted-foreground">Internal Havn admin (scoped to your session).</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PlatformKpiCard label="Total Customers" value="1" subtext="Design partner orgs" />
              <PlatformKpiCard
                label="Total Orders"
                value={orderCount == null ? "—" : String(orderCount)}
                subtext="All orders visible to this session"
              />
              <PlatformKpiCard
                label="Total Revenue"
                value={platformRevenue == null ? "—" : formatCurrency(platformRevenue)}
                subtext="Paid + fulfilled"
              />
              <PlatformKpiCard label="States Active" value="1" subtext="Washington (WA)" />
            </div>
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Platform Health</h2>
              </div>
              <ul className="space-y-3 p-5 text-sm text-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Resend: <strong>Verified</strong> (orders@havnhq.com)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Stripe Connect: <strong>Enabled</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Domain: <strong>havnhq.com</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-havn-success" aria-hidden />
                  <span>
                    Database: <strong>Supabase connected</strong>
                  </span>
                </li>
              </ul>
            </section>
          </div>
        ) : null}

        {tab === "analytics" ? (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
              <p className="mt-1 text-sm text-muted-foreground">Mock metrics for product planning.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["7d", "7D"],
                  ["30d", "30D"],
                  ["90d", "90D"],
                  ["180d", "180D"],
                  ["all", "All Time"],
                ] as const
              ).map(([k, label]) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={analyticsPreset === k ? "default" : "outline"}
                  className={analyticsPreset === k ? "bg-havn-navy text-white hover:bg-havn-navy/90" : ""}
                  onClick={() => {
                    setAnalyticsPreset(k);
                    setCustomRange(undefined);
                  }}
                >
                  {label}
                </Button>
              ))}
              <Popover>
                <PopoverTrigger
                  type="button"
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                    "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                    analyticsPreset === "custom"
                      ? "bg-havn-navy text-white hover:bg-havn-navy/90"
                      : "border border-border bg-background hover:bg-muted/50"
                  )}
                  onClick={() => setAnalyticsPreset("custom")}
                >
                  Custom
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" selected={customRange} onSelect={setCustomRange} numberOfMonths={2} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnalyticsStatesAll(true);
                  setAnalyticsStatePick(new Set());
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  analyticsStatesAll
                    ? "border-havn-navy bg-havn-navy text-white"
                    : "border-border bg-card text-foreground hover:bg-muted/50"
                )}
              >
                All States
              </button>
              {ANALYTICS_STATE_PILLS.map((st) => {
                const on = !analyticsStatesAll && analyticsStatePick.has(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setAnalyticsStatesAll(false);
                      setAnalyticsStatePick((prev) => {
                        const next = new Set(prev);
                        if (next.has(st)) next.delete(st);
                        else next.add(st);
                        return next;
                      });
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      on
                        ? "border-havn-navy bg-havn-navy/10 text-havn-navy"
                        : "border-border bg-card text-foreground hover:bg-muted/50"
                    )}
                  >
                    {st}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <PlatformKpiCard label="Orders" value={String(kpiOrders)} />
              <PlatformKpiCard label="Revenue" value={formatCurrency(kpiRevenue)} />
              <PlatformKpiCard label="Orders This Month" value={String(kpiOrdersMonth)} />
              <PlatformKpiCard label="Revenue This Month" value={formatCurrency(kpiRevenueMonth)} />
              <PlatformKpiCard label="Avg Auto-Fill Rate" value={`${MOCK_ANALYTICS.avgAutoFillRate}%`} />
              <PlatformKpiCard label="Time Saved" value={`${kpiTimeSaved} hrs`} />
              <PlatformKpiCard label="Active Mgmt Companies" value={String(MOCK_ANALYTICS.activeManagementCompanies)} />
              <PlatformKpiCard label="Active Self-Managed" value={String(MOCK_ANALYTICS.activeSelfManaged)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground">Orders by period</h2>
                <div className="mt-6 flex h-40 items-end justify-between gap-2">
                  {scaledOrderBars.map((m) => (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full max-w-[48px] rounded-t-md transition-all"
                        style={{
                          height: `${(m.count / maxScaledOrders) * 100}%`,
                          minHeight: m.count > 0 ? 8 : 2,
                          backgroundColor: "var(--color-havn-navy)",
                        }}
                        title={`${m.month}: ${m.count}`}
                      />
                      <span className="text-[10px] font-medium text-muted-foreground">{m.month}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground">Auto-fill rate trend</h2>
                <div className="mt-6 flex h-40 items-end justify-between gap-2">
                  {autoFillTrend.map((pct, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full max-w-[40px] rounded-t-md"
                        style={{
                          height: `${(pct / maxAutoFill) * 100}%`,
                          minHeight: 8,
                          backgroundColor: "var(--color-havn-success)",
                        }}
                        title={`${pct}%`}
                      />
                      <span className="text-[10px] text-muted-foreground">P{i + 1}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">Top templates</h2>
              <ul className="mt-4 space-y-3">
                {MOCK_ANALYTICS.topTemplates.map((t) => (
                  <li key={t.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-foreground">{t.name}</span>
                      <span className="tabular-nums text-muted-foreground">{t.usage}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(t.usage / maxTopTemplateUsage) * 100}%`,
                          backgroundColor: "var(--color-havn-navy)",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {showStateBreakdown ? (
              <section className="rounded-xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-3">
                  <h2 className="text-sm font-semibold text-foreground">State breakdown</h2>
                </div>
                <div className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>State</TableHead>
                        <TableHead>Total orders</TableHead>
                        <TableHead>Orders (month)</TableHead>
                        <TableHead>Avg auto-fill</TableHead>
                        <TableHead>Avg processing (days)</TableHead>
                        <TableHead>Companies</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stateBreakdownRows.map((r) => (
                        <TableRow key={r.state}>
                          <TableCell className="font-medium">{r.state}</TableCell>
                          <TableCell>{r.totalOrders}</TableCell>
                          <TableCell>{r.ordersThisMonth}</TableCell>
                          <TableCell>{r.avgAutoFillRate}%</TableCell>
                          <TableCell>{r.avgProcessingDays}</TableCell>
                          <TableCell>{r.companiesActive}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "customers" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
              <p className="mt-1 text-sm text-muted-foreground">Management companies on Havn.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table className="min-w-[960px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Company</TableHead>
                    <TableHead>Contact email</TableHead>
                    <TableHead>Account type</TableHead>
                    <TableHead>Stripe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">AmLo Management</p>
                        <p className="text-xs text-muted-foreground">Duvall, WA</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground">loren@havnhq.com</span>
                    </TableCell>
                    <TableCell>
                      <PillBadge className="border-border bg-muted/50 text-foreground">Management Company</PillBadge>
                    </TableCell>
                    <TableCell>
                      <PillBadge className="border-havn-success/40 bg-havn-success/15 text-emerald-900 dark:text-emerald-100">
                        Connected
                      </PillBadge>
                    </TableCell>
                    <TableCell>
                      <PillBadge className="border-havn-success/40 bg-havn-success/20 text-emerald-950 dark:text-emerald-100">
                        Active
                      </PillBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toast.info("Impersonation coming soon")}
                        >
                          Impersonate
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => toast.info("Coming soon")}>
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {tab === "order-lookup" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Order Lookup</h1>
              <p className="mt-1 text-sm text-muted-foreground">Document orders visible under your current session.</p>
            </div>
            <Input
              placeholder="Search orders by ID, requester, email, or property…"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="max-w-xl"
            />
            {ordersError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {ordersError}
              </div>
            ) : null}
            {ordersLoading ? (
              <p className="text-sm text-muted-foreground">Loading orders…</p>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
                No orders match your search.
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
                    {filteredOrders.map((order) => {
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
                          <TableCell className="text-foreground">{formatMasterTypeKey(order.master_type_key)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDeliverySpeed(order.delivery_speed)}</TableCell>
                          <TableCell className="tabular-nums text-foreground">{formatCurrency(order.total_fee)}</TableCell>
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
                                    onClick={() => void handleMarkFulfilled(order.id)}
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
        ) : null}

        {tab === "templates" ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Havn Templates</h1>
                <p className="mt-1 text-sm text-muted-foreground">Platform document templates (mock).</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search templates…"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="w-full sm:w-64"
                />
                <Button type="button" onClick={() => toast.info("Template wizard coming soon")}>
                  Create Template
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Template Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Updated By</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>States Live</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((t) => (
                    <Fragment key={t.id}>
                      <TableRow>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>{t.type}</TableCell>
                        <TableCell>{t.version}</TableCell>
                        <TableCell className="text-muted-foreground">{t.lastUpdated}</TableCell>
                        <TableCell>{t.lastUpdatedBy}</TableCell>
                        <TableCell>{t.fieldsCount}</TableCell>
                        <TableCell>{t.usageCount}</TableCell>
                        <TableCell>
                          {t.status === "active" ? (
                            <PillBadge className="border-havn-success/40 bg-havn-success/15 text-emerald-900 dark:text-emerald-100">
                              Active
                            </PillBadge>
                          ) : (
                            <PillBadge className="border-havn-amber/50 bg-havn-amber/15 text-amber-900 dark:text-amber-100">
                              Draft
                            </PillBadge>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setExpandedTemplateId((id) => (id === t.id ? null : t.id))}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-foreground hover:bg-muted"
                          >
                            {t.liveStates.length ? `${t.liveStates.length} states` : "No states"}
                            {expandedTemplateId === t.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        </TableCell>
                      </TableRow>
                      {expandedTemplateId === t.id ? (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={9} className="py-4">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">States live</p>
                            <div className="flex flex-wrap gap-2">
                              {t.liveStates.length ? (
                                t.liveStates.map((s) => (
                                  <PillBadge key={s} className="border-border bg-background text-foreground">
                                    {s}
                                  </PillBadge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No states configured.</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {tab === "uploaded" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Uploaded Templates</h1>
              <p className="mt-1 text-sm text-muted-foreground">Customer-supplied PDFs awaiting or after review.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "approved", "rejected"] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={uploadedFilter === f ? "default" : "outline"}
                  className={uploadedFilter === f ? "bg-havn-navy text-white hover:bg-havn-navy/90" : ""}
                  onClick={() => setUploadedFilter(f)}
                >
                  {f === "all" ? "All" : f === "approved" ? "Approved" : "Rejected"}
                </Button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table className="min-w-[960px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-8" />
                    <TableHead>
                      <button type="button" className="font-medium hover:underline" onClick={() => toggleUploadedSort("fileName")}>
                        File Name {uploadedSort.key === "fileName" ? (uploadedSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="font-medium hover:underline" onClick={() => toggleUploadedSort("companyName")}>
                        Company {uploadedSort.key === "companyName" ? (uploadedSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="font-medium hover:underline" onClick={() => toggleUploadedSort("documentType")}>
                        Type {uploadedSort.key === "documentType" ? (uploadedSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="font-medium hover:underline" onClick={() => toggleUploadedSort("uploadedBy")}>
                        Uploaded By {uploadedSort.key === "uploadedBy" ? (uploadedSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="font-medium hover:underline" onClick={() => toggleUploadedSort("uploadedAt")}>
                        Date {uploadedSort.key === "uploadedAt" ? (uploadedSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="font-medium hover:underline" onClick={() => toggleUploadedSort("status")}>
                        Status {uploadedSort.key === "status" ? (uploadedSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUploaded.map((u) => {
                    const domains = uploadedDomainsById[u.id] ?? u.emailDomains;
                    const expanded = uploadedExpanded === u.id;
                    return (
                      <Fragment key={u.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setUploadedExpanded((id) => (id === u.id ? null : u.id))}
                        >
                          <TableCell>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                          <TableCell className="font-medium">{u.fileName}</TableCell>
                          <TableCell>{u.companyName}</TableCell>
                          <TableCell>{u.documentType}</TableCell>
                          <TableCell>
                            <span className="block">{u.uploadedBy}</span>
                            <span className="text-xs text-muted-foreground">{u.uploadedByEmail}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.uploadedAt}</TableCell>
                          <TableCell>
                            {u.status === "approved" ? (
                              <PillBadge className="border-havn-success/40 bg-havn-success/15 text-emerald-900 dark:text-emerald-100">
                                Approved
                              </PillBadge>
                            ) : u.status === "pending" ? (
                              <PillBadge className="border-havn-amber/50 bg-havn-amber/15 text-amber-900 dark:text-amber-100">
                                Pending
                              </PillBadge>
                            ) : (
                              <PillBadge className="border-destructive/40 bg-destructive/15 text-destructive">Rejected</PillBadge>
                            )}
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow className="bg-muted/15 hover:bg-muted/15">
                            <TableCell colSpan={7} className="p-5">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <Label className="text-xs uppercase text-muted-foreground">Email domains</Label>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {domains.map((d) => (
                                      <span
                                        key={d}
                                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs"
                                      >
                                        {d}
                                        <button
                                          type="button"
                                          className="text-muted-foreground hover:text-foreground"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setUploadedDomainsById((prev) => ({
                                              ...prev,
                                              [u.id]: (prev[u.id] ?? domains).filter((x) => x !== d),
                                            }));
                                          }}
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <div className="mt-2 flex gap-2">
                                    <Input
                                      placeholder="domain.com"
                                      value={uploadedDomainDraft[u.id] ?? ""}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        setUploadedDomainDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                                      }
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const raw = (uploadedDomainDraft[u.id] ?? "").trim().toLowerCase();
                                        if (!raw) return;
                                        setUploadedDomainsById((prev) => ({
                                          ...prev,
                                          [u.id]: [...new Set([...(prev[u.id] ?? domains), raw])],
                                        }));
                                        setUploadedDomainDraft((prev) => ({ ...prev, [u.id]: "" }));
                                      }}
                                    >
                                      Add
                                    </Button>
                                  </div>
                                  <Button
                                    type="button"
                                    className="mt-3"
                                    variant="secondary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const email = u.uploadedByEmail;
                                      const dom = email.includes("@") ? email.split("@")[1] : "";
                                      if (dom)
                                        setUploadedDomainsById((prev) => ({
                                          ...prev,
                                          [u.id]: [...new Set([...(prev[u.id] ?? domains), dom])],
                                        }));
                                      toast.success(dom ? `Added ${dom}` : "No domain on uploader");
                                    }}
                                  >
                                    Auto-Assign from Uploader
                                  </Button>
                                </div>
                                <div className="space-y-3">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toast.info("Coming soon");
                                    }}
                                  >
                                    View Template
                                  </Button>
                                  <div className="rounded-lg border border-border bg-card p-3 text-sm">
                                    <p className="text-xs font-semibold text-muted-foreground">Review</p>
                                    <p className="mt-1 text-foreground">{u.notes || "—"}</p>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Reviewed by {u.reviewedBy ?? "—"} · {u.reviewedAt ?? "—"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {tab === "document-review" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Document Review</h1>
              <p className="mt-1 text-sm text-muted-foreground">Assign domains and map uploads to Havn templates.</p>
            </div>
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="w-full space-y-4 lg:w-2/5">
                <section className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending</p>
                  <ul className="mt-3 space-y-1">
                    {pendingReviewQueue.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => setReviewSelectedId(u.id)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            reviewSelectedId === u.id
                              ? "border-havn-navy bg-havn-navy/5 font-medium"
                              : "border-transparent hover:bg-muted/50"
                          )}
                        >
                          <span className="block truncate font-medium">{u.fileName}</span>
                          <span className="text-xs text-muted-foreground">{u.companyName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previously reviewed</p>
                  <ul className="mt-3 space-y-1">
                    {reviewedQueue.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => setReviewSelectedId(u.id)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            reviewSelectedId === u.id
                              ? "border-havn-navy bg-havn-navy/5 font-medium"
                              : "border-transparent hover:bg-muted/50"
                          )}
                        >
                          <span className="block truncate">{u.fileName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <div className="min-w-0 flex-1 space-y-4 lg:w-3/5">
                {reviewItem ? (
                  <>
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Company</p>
                          <p className="mt-0.5 font-medium">{reviewItem.companyName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Type</p>
                          <p className="mt-0.5 font-medium">{reviewItem.documentType}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">State</p>
                          <p className="mt-0.5 font-medium">WA</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Uploaded</p>
                          <p className="mt-0.5 font-medium">{reviewItem.uploadedAt}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-havn-success/30 bg-havn-success/10 px-4 py-3 text-sm">
                      <span className="font-semibold text-foreground">AI suggestion: </span>
                      <span className="text-foreground">WA Resale Certificate v3 — 95% confidence</span>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Email domains</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reviewDomains.map((d) => (
                            <span
                              key={d}
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                            >
                              {d}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => setReviewDomains((prev) => prev.filter((x) => x !== d))}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Input
                            placeholder="domain.com"
                            value={reviewDomainInput}
                            onChange={(e) => setReviewDomainInput(e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const raw = reviewDomainInput.trim().toLowerCase();
                              if (!raw) return;
                              setReviewDomains((prev) => [...new Set([...prev, raw])]);
                              setReviewDomainInput("");
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="map-template">Map to Havn Template</Label>
                        <select
                          id="map-template"
                          className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={reviewTemplateId}
                          onChange={(e) => setReviewTemplateId(e.target.value)}
                        >
                          {MOCK_TEMPLATES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Applicable states</Label>
                        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                          <div className="flex flex-wrap gap-1">
                            {US_STATES.map((s) => {
                              const on = reviewStates.has(s.abbr);
                              return (
                                <button
                                  key={s.abbr}
                                  type="button"
                                  onClick={() =>
                                    setReviewStates((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(s.abbr)) next.delete(s.abbr);
                                      else next.add(s.abbr);
                                      return next;
                                    })
                                  }
                                  className={cn(
                                    "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                                    on
                                      ? "border-havn-navy bg-havn-navy text-white"
                                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                                  )}
                                >
                                  {s.abbr}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="review-notes">Review notes</Label>
                        <Textarea
                          id="review-notes"
                          className="mt-2"
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Internal notes…"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="bg-havn-success text-white hover:bg-havn-success/90"
                          onClick={() => toast.success("Approved & assigned (mock)")}
                        >
                          Approve & Assign
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => toast.error("Rejected (mock)")}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Select an item from the queue.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "state-config" ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">State Config</h1>
              <p className="mt-1 text-sm text-muted-foreground">Statutory caps, rules, and service defaults per state.</p>
            </div>
            {stateConfigsLoading ? (
              <p className="text-sm text-muted-foreground">Loading state configurations…</p>
            ) : (
            <div className="flex flex-col gap-6 lg:flex-row">
              <aside className="w-full shrink-0 space-y-3 lg:w-64">
                <div className="rounded-xl border border-border bg-card p-2">
                  {stateConfigDraft.map((c) => (
                    <button
                      key={c.state}
                      type="button"
                      onClick={() => {
                        setSelectedConfigState(c.state);
                        setSelectedServiceIndex(0);
                      }}
                      className={cn(
                        "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium",
                        selectedConfigState === c.state ? "bg-havn-navy text-white" : "hover:bg-muted/60"
                      )}
                    >
                      {c.stateName} ({c.state})
                    </button>
                  ))}
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <Label className="text-xs text-muted-foreground">Add State</Label>
                  <select
                    className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const abbr = e.target.value;
                      if (!abbr) return;
                      const st = US_STATES.find((s) => s.abbr === abbr);
                      if (!st) return;
                      applyStateConfigUpdate((draft) => [
                        ...draft,
                        {
                          state: st.abbr,
                          stateName: st.name,
                          enabled: true,
                          notes: "",
                          services: [],
                        },
                      ]);
                      setSelectedConfigState(st.abbr);
                      setSelectedServiceIndex(0);
                      e.target.value = "";
                      toast.success(`Added ${st.name}`);
                    }}
                  >
                    <option value="">Choose state…</option>
                    {unconfiguredStates.map((s) => (
                      <option key={s.abbr} value={s.abbr}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </aside>
              <div className="min-w-0 flex-1 space-y-6">
                {selectedStateConfig ? (
                  <>
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold">{selectedStateConfig.stateName}</h2>
                          <p className="text-xs text-muted-foreground">{selectedStateConfig.state}</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selectedStateConfig.enabled}
                            onCheckedChange={(v) =>
                              applyStateConfigUpdate((draft) => {
                                const idx = draft.findIndex((x) => x.state === selectedConfigState);
                                if (idx >= 0) draft[idx].enabled = v;
                                return draft;
                              })
                            }
                          />
                          Enabled
                        </label>
                      </div>
                    </div>
                    <div className="grid gap-6 lg:grid-cols-3">
                      <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</p>
                        <ul className="mt-3 space-y-1">
                          {selectedStateConfig.services.map((svc, i) => (
                            <li key={`${svc.serviceType}-${i}`}>
                              <button
                                type="button"
                                onClick={() => setSelectedServiceIndex(i)}
                                className={cn(
                                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                                  selectedServiceIndex === i
                                    ? "border-havn-navy bg-havn-navy/5 font-medium"
                                    : "border-transparent hover:bg-muted/50"
                                )}
                              >
                                {svc.serviceType}
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex flex-col gap-2">
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value=""
                            onChange={(e) => {
                              const key = e.target.value;
                              if (!key) return;
                              applyStateConfigUpdate((draft) => {
                                const idx = draft.findIndex((x) => x.state === selectedConfigState);
                                if (idx < 0) return draft;
                                draft[idx].services.push({
                                  master_type_key: key,
                                  serviceType: formatMasterTypeKey(key),
                                  formalName: formatMasterTypeKey(key),
                                  pricingCap: null,
                                  capType: "actual",
                                  rushCap: null,
                                  noRush: false,
                                  standardTurnaround: 5,
                                  autoRefundOnMiss: false,
                                  statute: "",
                                  recommendedDefault: null,
                                  aiMemory: "",
                                });
                                setSelectedServiceIndex(draft[idx].services.length - 1);
                                return draft;
                              });
                            }}
                          >
                            <option value="">Add service…</option>
                            {SERVICE_TYPE_OPTIONS
                              .filter((k) => !selectedStateConfig.services.some((s) => s.master_type_key === k))
                              .map((k) => (
                                <option key={k} value={k}>{formatMasterTypeKey(k)}</option>
                              ))}
                          </select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-destructive hover:text-destructive"
                            disabled={!selectedService || selectedStateConfig.services.length === 0}
                            onClick={() =>
                              applyStateConfigUpdate((draft) => {
                                const idx = draft.findIndex((x) => x.state === selectedConfigState);
                                if (idx < 0) return draft;
                                draft[idx].services.splice(selectedServiceIndex, 1);
                                const nl = draft[idx].services.length;
                                setSelectedServiceIndex((s) => Math.min(Math.max(0, s), Math.max(0, nl - 1)));
                                return draft;
                              })
                            }
                          >
                            Remove Service
                          </Button>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
                        {selectedService ? (
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="formal-name">Formal Name</Label>
                              <Input
                                id="formal-name"
                                className="mt-1.5"
                                value={selectedService.formalName}
                                onChange={(e) =>
                                  applyStateConfigUpdate((draft) => {
                                    const c = draft.find((x) => x.state === selectedConfigState);
                                    if (c?.services[selectedServiceIndex])
                                      c.services[selectedServiceIndex].formalName = e.target.value;
                                    return draft;
                                  })
                                }
                              />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <Label htmlFor="pricing-cap">Pricing Cap ($)</Label>
                                <Input
                                  id="pricing-cap"
                                  className="mt-1.5"
                                  placeholder="empty = actual cost"
                                  value={selectedService.pricingCap ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    applyStateConfigUpdate((draft) => {
                                      const c = draft.find((x) => x.state === selectedConfigState);
                                      if (c?.services[selectedServiceIndex])
                                        c.services[selectedServiceIndex].pricingCap = v === "" ? null : Number(v);
                                      return draft;
                                    });
                                  }}
                                />
                              </div>
                              <div>
                                <Label htmlFor="cap-type">Cap Type</Label>
                                <select
                                  id="cap-type"
                                  className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={selectedService.capType}
                                  onChange={(e) =>
                                    applyStateConfigUpdate((draft) => {
                                      const c = draft.find((x) => x.state === selectedConfigState);
                                      if (c?.services[selectedServiceIndex])
                                        c.services[selectedServiceIndex].capType = e.target.value as "fixed" | "actual";
                                      return draft;
                                    })
                                  }
                                >
                                  <option value="fixed">fixed</option>
                                  <option value="actual">actual</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <Label htmlFor="rush-cap">Rush Cap ($)</Label>
                                <Input
                                  id="rush-cap"
                                  className="mt-1.5"
                                  value={selectedService.rushCap ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    applyStateConfigUpdate((draft) => {
                                      const c = draft.find((x) => x.state === selectedConfigState);
                                      if (c?.services[selectedServiceIndex])
                                        c.services[selectedServiceIndex].rushCap = v === "" ? null : Number(v);
                                      return draft;
                                    });
                                  }}
                                />
                              </div>
                              <label className="mt-8 flex items-center gap-2 text-sm sm:mt-6">
                                <Checkbox
                                  checked={selectedService.noRush}
                                  onCheckedChange={(v) =>
                                    applyStateConfigUpdate((draft) => {
                                      const c = draft.find((x) => x.state === selectedConfigState);
                                      if (c?.services[selectedServiceIndex])
                                        c.services[selectedServiceIndex].noRush = v;
                                      return draft;
                                    })
                                  }
                                />
                                No Rush
                              </label>
                            </div>
                            <div>
                              <Label htmlFor="std-turn">Standard Turnaround (days)</Label>
                              <Input
                                id="std-turn"
                                type="number"
                                className="mt-1.5"
                                value={selectedService.standardTurnaround}
                                onChange={(e) =>
                                  applyStateConfigUpdate((draft) => {
                                    const c = draft.find((x) => x.state === selectedConfigState);
                                    if (c?.services[selectedServiceIndex])
                                      c.services[selectedServiceIndex].standardTurnaround = Number(e.target.value) || 0;
                                    return draft;
                                  })
                                }
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={selectedService.autoRefundOnMiss}
                                onCheckedChange={(v) =>
                                  applyStateConfigUpdate((draft) => {
                                    const c = draft.find((x) => x.state === selectedConfigState);
                                    if (c?.services[selectedServiceIndex])
                                      c.services[selectedServiceIndex].autoRefundOnMiss = v;
                                    return draft;
                                  })
                                }
                              />
                              Auto-Refund on Miss
                            </label>
                            <div>
                              <Label htmlFor="statute">Statute</Label>
                              <Input
                                id="statute"
                                className="mt-1.5"
                                value={selectedService.statute}
                                onChange={(e) =>
                                  applyStateConfigUpdate((draft) => {
                                    const c = draft.find((x) => x.state === selectedConfigState);
                                    if (c?.services[selectedServiceIndex])
                                      c.services[selectedServiceIndex].statute = e.target.value;
                                    return draft;
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="rec-default">Recommended Default ($)</Label>
                              <Input
                                id="rec-default"
                                className="mt-1.5"
                                value={selectedService.recommendedDefault ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  applyStateConfigUpdate((draft) => {
                                    const c = draft.find((x) => x.state === selectedConfigState);
                                    if (c?.services[selectedServiceIndex])
                                      c.services[selectedServiceIndex].recommendedDefault = v === "" ? null : Number(v);
                                    return draft;
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <Label htmlFor="ai-mem">AI Agent Memory</Label>
                              <Textarea
                                id="ai-mem"
                                className="mt-1.5"
                                value={selectedService.aiMemory}
                                onChange={(e) =>
                                  applyStateConfigUpdate((draft) => {
                                    const c = draft.find((x) => x.state === selectedConfigState);
                                    if (c?.services[selectedServiceIndex])
                                      c.services[selectedServiceIndex].aiMemory = e.target.value;
                                    return draft;
                                  })
                                }
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                disabled={stateConfigSaving}
                                onClick={() => {
                                  const cfg = stateConfigDraft.find((x) => x.state === selectedConfigState);
                                  if (!cfg) return;
                                  setStateConfigSaving(true);
                                  void (async () => {
                                    try {
                                      const result = await saveStateConfig(
                                        cfg.state,
                                        cfg.enabled,
                                        cfg.notes,
                                        cfg.services.map(serviceToDbRow)
                                      );
                                      if ("error" in result) {
                                        toast.error(result.error);
                                        return;
                                      }
                                      setStateConfigBaseline(deepClone(stateConfigDraft));
                                      toast.success(`${cfg.stateName} configuration saved`);
                                    } finally {
                                      setStateConfigSaving(false);
                                    }
                                  })();
                                }}
                              >
                                {stateConfigSaving ? "Saving…" : "Save Changes"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setStateConfigDraft(deepClone(stateConfigBaseline));
                                  toast.info("Discarded changes");
                                }}
                              >
                                Discard
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Add a service to configure fields.</p>
                        )}
                      </div>
                    </div>
                    <section className="rounded-xl border border-border bg-card shadow-sm">
                      <div className="flex items-center justify-between border-b border-border px-5 py-3">
                        <h2 className="text-sm font-semibold text-foreground">Audit log</h2>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAuditShowAll((v) => !v)}>
                          {auditShowAll ? "Show less" : "Show all"}
                        </Button>
                      </div>
                      <ul className="divide-y divide-border p-0">
                        {(auditShowAll ? MOCK_AUDIT_LOG : MOCK_AUDIT_LOG.slice(0, 7)).map((e) => (
                          <li key={e.id} className="px-5 py-3 text-sm">
                            <p className="text-xs text-muted-foreground">
                              {e.at} · {e.actor}
                            </p>
                            <p className="mt-0.5 text-foreground">{e.summary}</p>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {/* ── AI Legal Check ── */}
                    <section className="rounded-xl border border-border bg-card shadow-sm">
                      <div className="flex items-center justify-between border-b border-border px-5 py-3">
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">AI Legal Compliance Check</h2>
                          <p className="text-[11px] text-muted-foreground">
                            Runs automatically on the 1st of each month via Claude Sonnet
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={legalCheckRunning}
                          onClick={() => {
                            setLegalCheckRunning(true);
                            void (async () => {
                              try {
                                const result = await runLegalCheckForState(selectedConfigState);
                                if ("error" in result) {
                                  toast.error(result.error);
                                  return;
                                }
                                toast.success(`Legal check complete for ${selectedConfigState}`);
                                // Reload checks
                                const updated = await loadLatestLegalChecks();
                                if (!("error" in updated)) setLegalChecks(updated);
                              } finally {
                                setLegalCheckRunning(false);
                              }
                            })();
                          }}
                        >
                          {legalCheckRunning ? "Checking…" : "Run Check Now"}
                        </Button>
                      </div>
                      <div className="p-5">
                        {(() => {
                          const check = legalChecks[selectedConfigState];
                          if (!check) {
                            return (
                              <p className="text-sm text-muted-foreground">
                                No legal check has been run for {selectedConfigState} yet. Click &ldquo;Run Check Now&rdquo; to analyze current regulations.
                              </p>
                            );
                          }
                          const checkedDate = new Date(check.checked_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                          });
                          return (
                            <div className="space-y-4">
                              {/* Summary header */}
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
                                  check.changes_detected ? "bg-havn-amber" : "bg-havn-success"
                                )} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground">{check.summary}</p>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    Checked {checkedDate} · {check.model_used}
                                  </p>
                                </div>
                              </div>

                              {/* Items */}
                              {check.details.length > 0 && (
                                <div className="space-y-3">
                                  {check.details.map((item, i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        "rounded-lg border px-4 py-3",
                                        item.severity === "critical"
                                          ? "border-destructive/30 bg-destructive/5"
                                          : item.severity === "warning"
                                          ? "border-havn-amber/30 bg-havn-amber/5"
                                          : "border-border bg-muted/30"
                                      )}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className={cn(
                                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                                          item.type === "action_needed"
                                            ? "bg-destructive/10 text-destructive"
                                            : item.type === "recent_change"
                                            ? "bg-havn-amber/10 text-havn-amber"
                                            : item.type === "pending_legislation"
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted text-muted-foreground"
                                        )}>
                                          {item.type.replace(/_/g, " ")}
                                        </span>
                                        {item.statute_reference && (
                                          <span className="text-[10px] font-mono text-muted-foreground">
                                            {item.statute_reference}
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-1.5 text-sm font-medium text-foreground">{item.title}</p>
                                      <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                                      {item.effective_date && (
                                        <p className="mt-1 text-[10px] text-muted-foreground">
                                          Effective: {item.effective_date}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </section>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Select or add a state.</p>
                )}
              </div>
            </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
