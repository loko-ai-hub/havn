"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clipboard,
  Eye,
  FileText,
  Scale,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/us-states";

import {
  buildTemplateSourceAction,
  generateReviewedStateTemplateAction,
  listTemplateRegistry,
  previewTemplatePdfAction,
  runTemplateHealthCheck,
  type GodModeTemplateSummary,
  type TemplateHealthReport,
} from "./templates-actions";
import type {
  LegalFinding,
  LegalReview,
  StateOnboardingRun,
  SuggestedStateTemplate,
} from "@/lib/state-onboarding";

const DOC_TYPE_OPTIONS = [
  { value: "resale_certificate", label: "Resale Certificate" },
  { value: "lender_questionnaire", label: "Lender Questionnaire" },
  { value: "certificate_update", label: "Certificate Update" },
  { value: "demand_letter", label: "Demand Letter" },
  { value: "estoppel_letter", label: "Estoppel Letter" },
  { value: "governing_documents", label: "Governing Documents" },
] as const;

type DocTypeValue = (typeof DOC_TYPE_OPTIONS)[number]["value"];

/* ── Main component ──────────────────────────────────────────────────── */

export default function TemplateRegistryViewer() {
  const [templates, setTemplates] = useState<GodModeTemplateSummary[]>([]);
  const [registrySize, setRegistrySize] = useState(0);
  const [health, setHealth] = useState<TemplateHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [reg, healthReport] = await Promise.all([
          listTemplateRegistry(),
          runTemplateHealthCheck(),
        ]);
        if (cancelled) return;
        setTemplates(reg.templates);
        setRegistrySize(reg.registrySize);
        setHealth(healthReport);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Failed to load templates."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      return (
        t.title.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        (t.state ?? "").toLowerCase().includes(q) ||
        t.fields.some((f) => f.key.toLowerCase().includes(q))
      );
    });
  }, [templates, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Havn Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {templates.length} template{templates.length === 1 ? "" : "s"} ·{" "}
            {registrySize} merge tags defined
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search templates, state, field…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72"
          />
        </div>
      </div>

      {/* Health banner */}
      {health && <HealthBanner health={health} />}

      {/* Template list */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading templates…
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TemplateCard
              key={`${t.state ?? "GEN"}:${t.key}`}
              template={t}
              expanded={expanded === `${t.state ?? "GEN"}:${t.key}`}
              onToggle={() =>
                setExpanded((prev) => {
                  const id = `${t.state ?? "GEN"}:${t.key}`;
                  return prev === id ? null : id;
                })
              }
            />
          ))}
        </div>
      )}

      {/* AI state onboarding */}
      <AiSuggestPanel />
    </div>
  );
}

/* ── Health banner ───────────────────────────────────────────────────── */

function HealthBanner({ health }: { health: TemplateHealthReport }) {
  const { ok, errors, warnings, unusedRegistryKeys, missingStateTemplates, staleCommunities } =
    health;
  const worst = errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok";
  const statusClass =
    worst === "error"
      ? "border-destructive/40 bg-destructive/10"
      : worst === "warning"
        ? "border-havn-amber/40 bg-havn-amber/10"
        : "border-havn-success/40 bg-havn-success/10";

  return (
    <div className={cn("rounded-xl border p-4 text-sm", statusClass)}>
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-havn-success" />
        ) : worst === "error" ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-havn-amber" />
        )}
        <p className="font-semibold text-foreground">
          {ok
            ? `All ${health.totalTemplates} templates pass validation.`
            : `${errors.length} error${errors.length === 1 ? "" : "s"}${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`}
        </p>
      </div>
      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="mt-3 space-y-1 text-xs text-foreground">
          {errors.map((e, i) => (
            <li key={`err-${i}`}>
              <span className="font-mono text-destructive">[ERR]</span>{" "}
              <span className="font-mono">{e.templateKey}{e.state ? `:${e.state}` : ""}</span>{" "}
              {e.message}
            </li>
          ))}
          {warnings.map((w, i) => (
            <li key={`warn-${i}`}>
              <span className="font-mono text-havn-amber">[WARN]</span>{" "}
              <span className="font-mono">{w.templateKey}{w.state ? `:${w.state}` : ""}</span>{" "}
              {w.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <span className="font-semibold text-foreground">{unusedRegistryKeys.length}</span>{" "}
          unused registry keys
        </div>
        <div>
          <span className="font-semibold text-foreground">{missingStateTemplates.length}</span>{" "}
          states missing state-specific templates
        </div>
        <div>
          <span className="font-semibold text-foreground">{staleCommunities.length}</span>{" "}
          communities with stale OCR (&gt; 180 days)
        </div>
      </div>
    </div>
  );
}

/* ── Template card ───────────────────────────────────────────────────── */

function TemplateCard({
  template,
  expanded,
  onToggle,
}: {
  template: GodModeTemplateSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [previewing, setPreviewing] = useState(false);

  const handlePreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewing(true);
    try {
      const result = await previewTemplatePdfAction(
        template.documentType ?? template.key,
        template.state ?? null
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const binary = atob(result.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Give the new tab a beat to grab the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <FileText className="h-4 w-4 text-havn-navy" />
          <div>
            <p className="font-medium text-foreground">
              {template.title}
              {template.state && (
                <span className="ml-2 rounded-md border border-havn-navy/30 bg-havn-navy/5 px-1.5 py-0.5 text-xs font-bold text-havn-navy">
                  {template.state}
                </span>
              )}
              {!template.state && (
                <span className="ml-2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  GENERIC
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {template.fieldCount} fields · {template.sections.length} sections · key{" "}
              <span className="font-mono">{template.key}</span>
              {template.lastUpdated && (
                <>
                  {" · Updated "}
                  {new Date(template.lastUpdated).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {template.requiresSignature && (
            <span className="rounded-md border border-havn-success/30 bg-havn-success/10 px-1.5 py-0.5 text-havn-success">
              Signature required
            </span>
          )}
          {template.expirationDays != null && (
            <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-muted-foreground">
              Valid {template.expirationDays}d
            </span>
          )}
          {!template.validation.ok && (
            <span className="rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-destructive">
              {template.validation.errors.length} error
              {template.validation.errors.length === 1 ? "" : "s"}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-disabled={previewing}
            onClick={(e) => void handlePreview(e)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void handlePreview(e as unknown as React.MouseEvent);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-medium hover:bg-muted",
              previewing && "opacity-50 pointer-events-none"
            )}
          >
            <Eye className="h-3 w-3" />
            {previewing ? "Rendering…" : "Preview PDF"}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border bg-muted/20 p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoLine label="Statute" value={template.statute ?? "—"} />
            <InfoLine
              label="Cover letter"
              value={template.hasCoverLetter ? "Enabled" : "None"}
            />
            <InfoLine
              label="Legal language"
              value={template.hasLegalLanguage ? "Defined" : "None"}
            />
            <InfoLine
              label="Attachments"
              value={
                template.attachmentsEnabled
                  ? template.attachmentCategories.join(", ")
                  : "None"
              }
            />
          </div>

          {template.sections.map((sectionName) => {
            const sectionFields = template.fields.filter((f) => f.section === sectionName);
            if (sectionFields.length === 0) return null;
            return (
              <div key={sectionName}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {sectionName}
                </p>
                <div className="overflow-x-auto rounded-md border border-border bg-background">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Label</th>
                        <th className="px-2 py-1.5 text-left font-medium">Merge tag</th>
                        <th className="px-2 py-1.5 text-left font-medium">Type</th>
                        <th className="px-2 py-1.5 text-left font-medium">Required</th>
                        <th className="px-2 py-1.5 text-left font-medium">Sources</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionFields.map((f) => (
                        <tr key={f.key} className="border-t border-border/60">
                          <td className="px-2 py-1 text-foreground">{f.label}</td>
                          <td className="px-2 py-1 font-mono text-xs text-muted-foreground">
                            {f.mergeTag}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">{f.type}</td>
                          <td className="px-2 py-1">
                            {f.required ? (
                              <span className="text-destructive">Yes</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">
                            {f.sources.length > 0 ? f.sources.join(", ") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

/* ── AI state onboarding panel ───────────────────────────────────────── */

type Stage = "idle" | "drafting" | "reviewing" | "revising" | "done";
type ViewMode = "final" | "draft";

function AiSuggestPanel() {
  const [state, setState] = useState("");
  const [documentType, setDocumentType] = useState<DocTypeValue>("resale_certificate");
  const [stage, setStage] = useState<Stage>("idle");
  const [run, setRun] = useState<StateOnboardingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("final");

  const running = stage !== "idle" && stage !== "done";

  const handleGenerate = async () => {
    if (!state) {
      toast.error("Select a state first.");
      return;
    }
    setError(null);
    setRun(null);
    setStage("drafting");
    setViewMode("final");

    // Soft timers advance the visual stage indicator since the server
    // action is a single blocking call. Real completion wins — if the
    // pipeline finishes before the timers fire, the stage jumps to "done".
    const t1 = setTimeout(() => setStage("reviewing"), 15000);
    const t2 = setTimeout(() => setStage("revising"), 30000);

    const toastId = toast.loading("Running 3-agent pipeline…");
    try {
      const result = await generateReviewedStateTemplateAction({ state, documentType });
      if ("error" in result) {
        toast.error(result.error, { id: toastId });
        setError(result.error);
        setStage("idle");
        return;
      }
      setRun(result);
      setStage("done");
      toast.success(
        `Reviewed draft ready — ${result.review.findings.length} finding${result.review.findings.length === 1 ? "" : "s"} from legal review.`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pipeline failed.", { id: toastId });
      setStage("idle");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-havn-navy" />
        <h2 className="text-sm font-semibold text-foreground">
          AI-assisted state onboarding
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick a state + document type. Claude drafts → a second Claude
        agent reviews it with legal expertise → a third agent revises
        based on the review. Takes 30–60 seconds.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ai-state" className="text-xs">State</Label>
          <select
            id="ai-state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="mt-1 h-9 w-[160px] rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s.abbr} value={s.abbr}>
                {s.abbr} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ai-doctype" className="text-xs">Document type</Label>
          <select
            id="ai-doctype"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocTypeValue)}
            className="mt-1 h-9 w-[220px] rounded-md border border-input bg-background px-2 text-sm"
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={running || !state}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {running ? "Running pipeline…" : "Generate + review"}
        </Button>
      </div>

      {/* Stage indicator — purely visual; the server action runs all 3 sequentially. */}
      {running && <PipelineProgress stage={stage} />}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {run && (
        <>
          <LegalReviewPanel review={run.review} />

          {/* Draft vs. final toggle */}
          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground">View:</span>
            <button
              type="button"
              onClick={() => setViewMode("final")}
              className={cn(
                "rounded-md border px-2.5 py-0.5",
                viewMode === "final"
                  ? "border-havn-navy bg-havn-navy text-white"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              Revised (final)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("draft")}
              className={cn(
                "rounded-md border px-2.5 py-0.5",
                viewMode === "draft"
                  ? "border-havn-navy bg-havn-navy text-white"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              Original draft
            </button>
            {run.final === run.draft && (
              <span className="text-muted-foreground italic">
                (reviewer approved with no changes — draft = final)
              </span>
            )}
          </div>

          <SuggestionPreview
            suggestion={viewMode === "final" ? run.final : run.draft}
            state={state}
          />
        </>
      )}
    </div>
  );
}

function PipelineProgress({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string; icon: typeof Sparkles }[] = [
    { id: "drafting", label: "Drafting", icon: Sparkles },
    { id: "reviewing", label: "Legal review", icon: Scale },
    { id: "revising", label: "Revising", icon: CheckCircle2 },
  ];
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const active = s.id === stage;
        return (
          <span
            key={s.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
              active
                ? "border-havn-navy/40 bg-havn-navy/5 text-havn-navy animate-pulse"
                : "border-border bg-background"
            )}
          >
            <Icon className="h-3 w-3" />
            {s.label}
            {i < steps.length - 1 ? " →" : ""}
          </span>
        );
      })}
    </div>
  );
}

function LegalReviewPanel({ review }: { review: LegalReview }) {
  const critical = review.findings.filter((f) => f.severity === "critical");
  const warnings = review.findings.filter((f) => f.severity === "warning");
  const suggestions = review.findings.filter((f) => f.severity === "suggestion");

  const verdictClass =
    review.verdict === "approve"
      ? "border-havn-success/40 bg-havn-success/10 text-havn-success"
      : review.verdict === "revise"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-havn-amber/40 bg-havn-amber/10 text-havn-amber";

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3 text-xs">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-havn-navy" />
        <p className="font-semibold text-foreground">Legal review</p>
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
            verdictClass
          )}
        >
          {review.verdict.replaceAll("-", " ")}
        </span>
      </div>
      <p className="italic text-foreground">{review.overallAssessment}</p>
      {critical.length + warnings.length + suggestions.length === 0 ? (
        <p className="text-muted-foreground">No findings.</p>
      ) : (
        <div className="space-y-2">
          {critical.map((f, i) => (
            <FindingRow key={`c-${i}`} finding={f} />
          ))}
          {warnings.map((f, i) => (
            <FindingRow key={`w-${i}`} finding={f} />
          ))}
          {suggestions.map((f, i) => (
            <FindingRow key={`s-${i}`} finding={f} />
          ))}
        </div>
      )}
      {review.complianceConcerns.length > 0 && (
        <div>
          <p className="font-semibold uppercase tracking-wider text-muted-foreground">
            Compliance concerns
          </p>
          <ul className="mt-1 list-disc pl-4 text-foreground">
            {review.complianceConcerns.map((c, i) => (
              <li key={i} className="py-0.5">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: LegalFinding }) {
  const severityClass =
    finding.severity === "critical"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : finding.severity === "warning"
        ? "border-havn-amber/40 bg-havn-amber/10 text-havn-amber"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-card p-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            severityClass
          )}
        >
          {finding.severity}
        </span>
        <span className="text-xs font-medium text-foreground">{finding.section}</span>
        {finding.statuteReference && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {finding.statuteReference}
          </span>
        )}
      </div>
      <p className="mt-1 text-foreground">{finding.issue}</p>
      <p className="mt-1 text-muted-foreground">
        <span className="font-semibold text-foreground">Recommendation:</span>{" "}
        {finding.recommendation}
      </p>
    </div>
  );
}

function SuggestionPreview({
  suggestion,
  state,
}: {
  suggestion: SuggestedStateTemplate;
  state: string;
}) {
  const [generatedSource, setGeneratedSource] = useState<{
    fileName: string;
    source: string;
  } | null>(null);
  const [buildingSource, setBuildingSource] = useState(false);

  const handleCopySource = async () => {
    setBuildingSource(true);
    try {
      const result = await buildTemplateSourceAction(suggestion, state);
      setGeneratedSource(result);
      try {
        await navigator.clipboard.writeText(result.source);
        toast.success(`Copied ${result.fileName} to clipboard.`);
      } catch {
        toast.message(
          "Source generated — clipboard unavailable, copy from the box below."
        );
      }
    } finally {
      setBuildingSource(false);
    }
  };

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-foreground">{suggestion.title}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleCopySource()}
          disabled={buildingSource}
        >
          <Clipboard className="mr-2 h-3.5 w-3.5" />
          {buildingSource ? "Building…" : "Copy template source"}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <InfoLine label="Document type" value={suggestion.documentType} />
        <InfoLine label="Statute" value={suggestion.statute} />
        <InfoLine
          label="Expiration"
          value={`${suggestion.expirationDays} days`}
        />
        <InfoLine
          label="Signature required"
          value={suggestion.requiresSignature ? "Yes" : "No"}
        />
      </div>
      <div>
        <p className="font-semibold uppercase tracking-wider text-muted-foreground">
          Sections ({suggestion.sections.length})
        </p>
        <p className="mt-0.5 text-foreground">{suggestion.sections.join(" → ")}</p>
      </div>
      <div>
        <p className="font-semibold uppercase tracking-wider text-muted-foreground">
          Fields ({suggestion.fields.length})
        </p>
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-card p-2">
          {suggestion.fields.map((f, i) => (
            <li key={i} className="flex gap-2 py-0.5">
              <span className="font-mono text-foreground">{f.key}</span>
              <span className="text-muted-foreground">
                — {f.section} {f.required ? "· required" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {suggestion.newFieldsToConsider.length > 0 && (
        <div>
          <p className="font-semibold uppercase tracking-wider text-havn-amber">
            Fields to add to the registry
          </p>
          <ul className="mt-1 text-foreground">
            {suggestion.newFieldsToConsider.map((f, i) => (
              <li key={i} className="py-0.5">
                <span className="font-mono">{f.key}</span>
                <span className="text-muted-foreground"> ({f.type}) — {f.rationale}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="font-semibold uppercase tracking-wider text-muted-foreground">
          Certification text
        </p>
        <p className="mt-0.5 italic text-foreground">{suggestion.certificationText}</p>
      </div>
      <div>
        <p className="font-semibold uppercase tracking-wider text-muted-foreground">
          Disclaimer
        </p>
        <p className="mt-0.5 italic text-foreground">{suggestion.disclaimerText}</p>
      </div>
      {generatedSource && (
        <div>
          <p className="font-semibold uppercase tracking-wider text-muted-foreground">
            TypeScript source —{" "}
            <span className="font-mono normal-case">
              lib/document-templates/{generatedSource.fileName}
            </span>
          </p>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border/60 bg-card p-2 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
            {generatedSource.source}
          </pre>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Paste into Claude Code, confirm the registry and index wiring,
            then commit.
          </p>
        </div>
      )}
    </div>
  );
}

