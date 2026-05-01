"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  approveFieldProposal,
  approveThirdPartyTemplate,
  denyThirdPartyTemplate,
  getThirdPartySignedUrl,
  getThirdPartyTemplateDetail,
  listThirdPartyTemplates,
  rejectFieldProposal,
  retryThirdPartyIngestion,
  type ThirdPartyTemplateDetail,
  type ThirdPartyTemplateListItem,
} from "./third-party-actions";

type Filter = "all" | "pending" | "approved" | "denied" | "auto_defaulted";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "denied", label: "Denied" },
  { id: "auto_defaulted", label: "Auto-defaulted" },
];

export default function ThirdPartyTemplatesViewer() {
  const [items, setItems] = useState<ThirdPartyTemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ThirdPartyTemplateDetail>>({});
  const [search, setSearch] = useState("");

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const rows = await listThirdPartyTemplates({ filter });
        setItems(rows);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = async (id: string) => {
    const result = await getThirdPartyTemplateDetail(id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setDetails((prev) => ({ ...prev, [id]: result }));
  };

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    if (!details[id]) void loadDetail(id);
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.originalFilename?.toLowerCase().includes(q) ||
        i.issuer?.toLowerCase().includes(q) ||
        i.formTitle?.toLowerCase().includes(q) ||
        i.requesterEmail?.toLowerCase().includes(q) ||
        i.organizationName?.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === f.id
                  ? "border-havn-navy bg-havn-navy text-white"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search file, issuer, requester…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No third-party templates in this bucket.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const expanded = expandedId === item.id;
            const detail = details[item.id];
            return (
              <ThirdPartyRow
                key={item.id}
                item={item}
                expanded={expanded}
                detail={detail}
                onToggle={() => handleToggle(item.id)}
                onRefresh={() => {
                  void loadDetail(item.id);
                  void load();
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThirdPartyRow({
  item,
  expanded,
  detail,
  onToggle,
  onRefresh,
}: {
  item: ThirdPartyTemplateListItem;
  expanded: boolean;
  detail: ThirdPartyTemplateDetail | undefined;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const createdDate = new Date(item.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-4 w-4 shrink-0 text-havn-navy" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {item.originalFilename ?? "(no filename)"}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.issuer ?? "Unknown issuer"} ·{" "}
              {item.requesterEmail ?? "no requester"} · #{item.orderShortId} ·{" "}
              {createdDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <CoveragePill
            pct={item.autoFillCoveragePct}
            ingestStatus={item.ingestStatus}
          />
          <StatusPill status={item.reviewStatus} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-4 space-y-4">
          {detail ? (
            <ExpandedDetail item={item} detail={detail} onRefresh={onRefresh} />
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading details…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CoveragePill({
  pct,
  ingestStatus,
}: {
  pct: number | null;
  ingestStatus: string;
}) {
  if (ingestStatus === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-destructive">
        <XCircle className="h-3 w-3" />
        Ingestion failed
      </span>
    );
  }
  if (ingestStatus === "pending" || ingestStatus === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-havn-amber/40 bg-havn-amber/10 px-1.5 py-0.5 text-havn-amber">
        <Loader2 className="h-3 w-3 animate-spin" />
        {ingestStatus === "processing" ? "Processing" : "Queued"}
      </span>
    );
  }
  const value = pct ?? 0;
  const tone =
    value >= 75
      ? "border-havn-success/40 bg-havn-success/10 text-havn-success"
      : value >= 40
        ? "border-havn-amber/40 bg-havn-amber/10 text-havn-amber"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5", tone)}>
      {value.toFixed(1)}% auto-fill
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pending: {
      label: "Pending",
      cls: "border-havn-amber/40 bg-havn-amber/10 text-havn-amber",
    },
    approved: {
      label: "Approved",
      cls: "border-havn-success/40 bg-havn-success/10 text-havn-success",
    },
    denied: {
      label: "Denied",
      cls: "border-destructive/40 bg-destructive/10 text-destructive",
    },
    auto_defaulted: {
      label: "Auto-defaulted",
      cls: "border-border bg-muted/50 text-muted-foreground",
    },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: "border-border bg-muted/40" };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 font-medium", cls)}>
      {label}
    </span>
  );
}

function ExpandedDetail({
  item,
  detail,
  onRefresh,
}: {
  item: ThirdPartyTemplateListItem;
  detail: ThirdPartyTemplateDetail;
  onRefresh: () => void;
}) {
  const [notes, setNotes] = useState(detail.reviewNotes ?? "");
  const [denyReason, setDenyReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [denying, setDenying] = useState(false);

  const openPdf = async () => {
    const r = await getThirdPartySignedUrl(item.id);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  };

  const handleApprove = async () => {
    setSubmitting(true);
    const r = await approveThirdPartyTemplate({ id: item.id, notes });
    setSubmitting(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Approved — requester notified.");
    onRefresh();
  };

  const handleDeny = async () => {
    if (!denyReason.trim()) {
      toast.error("Please provide a reason for denial.");
      return;
    }
    setDenying(true);
    const r = await denyThirdPartyTemplate({ id: item.id, reason: denyReason });
    setDenying(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Denied — requester notified, defaulting to Havn template.");
    onRefresh();
  };

  const handleRetry = async () => {
    toast.loading("Retrying ingestion…", { id: `retry-${item.id}` });
    const r = await retryThirdPartyIngestion(item.id);
    if ("error" in r) {
      toast.error(r.error, { id: `retry-${item.id}` });
      return;
    }
    toast.success("Ingestion retried — results updated.", { id: `retry-${item.id}` });
    onRefresh();
  };

  const handleApproveProposal = async (id: string) => {
    const r = await approveFieldProposal(id);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(r.source);
      toast.success("Approved — TypeScript snippet copied to clipboard.");
    } catch {
      toast.message("Approved — clipboard unavailable, use the 'Copy' button below.");
    }
    onRefresh();
  };

  const handleRejectProposal = async (id: string) => {
    const r = await rejectFieldProposal(id);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Proposal rejected.");
    onRefresh();
  };

  const copyProposalSource = async (p: (typeof detail.proposals)[number]) => {
    const source = `  ${p.proposedKey}: {
    key: ${JSON.stringify(p.proposedKey)},
    mergeTag: ${JSON.stringify(`{{${p.proposedKey}}}`)},
    label: ${JSON.stringify(p.proposedLabel)},
    type: ${JSON.stringify(p.proposedType)},
    sources: ["manual", "cache"],
    description: ${JSON.stringify(p.rationale ?? "")},
    communityLevel: true,
  },`;
    try {
      await navigator.clipboard.writeText(source);
      toast.success("Snippet copied.");
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const canReview = item.reviewStatus === "pending" && item.ingestStatus === "ready";

  return (
    <div className="space-y-4 text-sm">
      {/* Meta */}
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoLine label="Form title" value={detail.formTitle ?? "—"} />
        <InfoLine label="Issuer" value={detail.issuer ?? "—"} />
        <InfoLine label="Property" value={detail.propertyAddress ?? "—"} />
        <InfoLine label="Requester" value={`${detail.requesterName ?? "—"} · ${detail.requesterEmail ?? "—"}`} />
        <InfoLine label="Management Co." value={detail.organizationName ?? "—"} />
        <InfoLine
          label="Coverage"
          value={
            detail.autoFillCoveragePct != null
              ? `${detail.autoFillCoveragePct.toFixed(1)}% (${detail.mappedCount} mapped, ${detail.unmappedCount} unmapped)`
              : "—"
          }
        />
      </div>

      {/* Ingestion failure + retry */}
      {item.ingestStatus === "failed" && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="font-semibold text-destructive">Ingestion failed</p>
            <p className="mt-0.5 text-destructive/90">{item.ingestError ?? "Unknown error"}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void handleRetry()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* PDF link */}
      <div>
        <Button size="sm" variant="outline" onClick={() => void openPdf()}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Open vendor PDF
        </Button>
      </div>

      {/* Detected fields */}
      {detail.detectedFields.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detected fields
          </p>
          <div className="max-h-72 overflow-auto rounded-md border border-border/60 bg-background">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">External label</th>
                  <th className="px-2 py-1.5 text-left font-medium">Kind</th>
                  <th className="px-2 py-1.5 text-left font-medium">Registry key</th>
                  <th className="px-2 py-1.5 text-left font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {detail.detectedFields.map((f, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-2 py-1 text-foreground">{f.externalLabel}</td>
                    <td className="px-2 py-1 text-muted-foreground">{f.fieldKind}</td>
                    <td className="px-2 py-1 font-mono">
                      {f.registryKey ?? (
                        <span className="text-havn-amber">unmapped</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {f.confidence != null ? f.confidence.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Proposals */}
      {detail.proposals.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Proposed new registry fields ({detail.proposals.filter((p) => p.status === "pending").length} pending)
          </p>
          <div className="space-y-2">
            {detail.proposals.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "rounded-md border p-2 text-xs",
                  p.status === "approved"
                    ? "border-havn-success/40 bg-havn-success/5"
                    : p.status === "rejected"
                      ? "border-border bg-muted/30 text-muted-foreground"
                      : "border-havn-amber/40 bg-havn-amber/5"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p>
                      <span className="font-mono font-semibold">{p.proposedKey}</span>{" "}
                      <span className="text-muted-foreground">({p.proposedType})</span> —{" "}
                      {p.proposedLabel}
                    </p>
                    {p.rationale && (
                      <p className="mt-0.5 text-muted-foreground italic">{p.rationale}</p>
                    )}
                    <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {p.status}
                      {p.reviewerEmail ? ` · ${p.reviewerEmail}` : ""}
                    </p>
                  </div>
                  {p.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleApproveProposal(p.id)}
                      >
                        Approve + copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRejectProposal(p.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : p.status === "approved" ? (
                    <Button size="sm" variant="ghost" onClick={() => void copyProposalSource(p)}>
                      <Clipboard className="mr-1.5 h-3 w-3" />
                      Copy
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review actions */}
      <div className="rounded-md border border-border/60 bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Review
        </p>
        {item.reviewStatus === "pending" ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional approval notes…"
              rows={2}
              className="text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleApprove()}
                disabled={!canReview || submitting}
                className="bg-havn-success text-white hover:bg-havn-success/90"
              >
                <ThumbsUp className="mr-2 h-3.5 w-3.5" />
                {submitting ? "Approving…" : "Approve"}
              </Button>
              <div className="flex-1" />
              <Input
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="Reason for denial (required)…"
                className="h-9 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleDeny()}
                disabled={!canReview || denying}
              >
                <ThumbsDown className="mr-2 h-3.5 w-3.5" />
                {denying ? "Denying…" : "Deny"}
              </Button>
            </div>
            {!canReview && (
              <p className="text-[11px] text-muted-foreground">
                {item.ingestStatus !== "ready"
                  ? "Review will unlock after ingestion completes."
                  : null}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center gap-2">
              {item.reviewStatus === "approved" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-havn-success" />
              ) : item.reviewStatus === "denied" ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="font-medium capitalize">{item.reviewStatus.replace("_", " ")}</span>
              {item.reviewerEmail && (
                <span className="text-muted-foreground">· {item.reviewerEmail}</span>
              )}
              {item.reviewedAt && (
                <span className="text-muted-foreground">
                  ·{" "}
                  {new Date(item.reviewedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
            {item.reviewNotes && (
              <p className="italic text-muted-foreground">{item.reviewNotes}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <p className="font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-foreground">{value}</p>
    </div>
  );
}
