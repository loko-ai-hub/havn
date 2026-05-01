"use client";

import { Check, ChevronRight, Rocket, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Progress } from "@/components/ui/progress";

export type OnboardingTask = {
  id: string;
  label: string;
  completed: boolean;
  actionLabel?: string;
  actionRoute?: string;
  subtext?: string;
  statusColor?: "amber";
  /** Optional tasks don't block "go-live" — they're recommended polish that
   *  unlocks higher-value features like autofill. Surfaced separately in the UI. */
  optional?: boolean;
  /** Optional icon for recommended-task rows (used in place of an arbitrary
   *  numbered circle). Required tasks ignore this and use the running counter. */
  icon?: LucideIcon;
};

interface OnboardingChecklistProps {
  tasks: OnboardingTask[];
  onDismiss: () => void;
}

export default function OnboardingChecklist({ tasks, onDismiss }: OnboardingChecklistProps) {
  const router = useRouter();
  const [requiredExpanded, setRequiredExpanded] = useState(false);

  const requiredTasks = tasks.filter((t) => !t.optional);
  const optionalTasks = tasks.filter((t) => t.optional);

  const requiredCompleted = requiredTasks.filter((t) => t.completed).length;
  const requiredIncomplete = requiredTasks.filter((t) => !t.completed);
  const optionalIncomplete = optionalTasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);
  const completedCount = completedTasks.length;

  const pct =
    requiredTasks.length === 0
      ? 100
      : Math.round((requiredCompleted / requiredTasks.length) * 100);
  const requiredRemaining = requiredTasks.length - requiredCompleted;
  const allRequiredDone = requiredRemaining === 0;

  const goTo = (route?: string) => {
    if (route) router.push(route);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-havn-cyan/5 to-transparent px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-havn-cyan/10">
              <Rocket className="h-4 w-4 text-havn-cyan-deep" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground">Finish setting up Havn</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {requiredRemaining > 0
                  ? `${requiredRemaining} step${requiredRemaining > 1 ? "s" : ""} remaining to go live`
                  : optionalIncomplete.length > 0
                    ? `You're live. ${optionalIncomplete.length} recommended step${optionalIncomplete.length > 1 ? "s" : ""} unlock autofill.`
                    : "You're all set."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {allRequiredDone ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-havn-cyan/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-havn-cyan-deep">
                <Check className="h-3 w-3" strokeWidth={3} />
                All set
              </span>
            ) : (
              <>
                <span className="tabular-nums text-xs font-semibold text-foreground">{pct}%</span>
                <div className="hidden w-32 sm:block">
                  <Progress
                    value={pct}
                    className="h-1.5 rounded-full bg-muted/60 [&>div]:rounded-full [&>div]:bg-havn-cyan [&>div]:transition-all"
                  />
                </div>
              </>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss checklist"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        {/* All completed tasks (required + optional) collapse into one summary
            row at the top. Incomplete tasks always live below — never crossed
            out in the active list. */}
        {completedCount > 0 && (
          <div className="mb-2">
            <CollapsedSummary
              label={`${completedCount} setup step${completedCount > 1 ? "s" : ""} complete`}
              expanded={requiredExpanded}
              onToggle={() => setRequiredExpanded((v) => !v)}
            />
            {requiredExpanded && (
              <div className="space-y-1.5 pt-2">
                {completedTasks.map((task) => (
                  <CompletedTaskRow key={task.id} task={task} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Incomplete required tasks */}
        {requiredIncomplete.length > 0 && (
          <div className="space-y-2">
            {requiredIncomplete.map((task, i) => {
              const isAmber = task.statusColor === "amber";
              const stepNumber = requiredCompleted + i + 1;
              return (
                <RequiredTaskRow
                  key={task.id}
                  task={task}
                  stepNumber={stepNumber}
                  isAmber={isAmber}
                  onClick={() => goTo(task.actionRoute)}
                />
              );
            })}
          </div>
        )}

        {/* Divider + heading for the recommended group */}
        {optionalIncomplete.length > 0 && (
          <div className="mt-3 mb-2 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recommended next
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {/* Incomplete recommended tasks */}
        {optionalIncomplete.length > 0 && (
          <div className="space-y-2">
            {optionalIncomplete.map((task) => (
              <RecommendedTaskRow
                key={task.id}
                task={task}
                onClick={() => goTo(task.actionRoute)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RequiredTaskRow({
  task,
  stepNumber,
  isAmber,
  onClick,
}: {
  task: OnboardingTask;
  stepNumber: number;
  isAmber: boolean;
  onClick: () => void;
}) {
  const interactive = Boolean(task.actionRoute);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        interactive ? "bg-secondary/50 hover:bg-secondary" : "bg-secondary/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          isAmber
            ? "bg-primary text-primary-foreground"
            : "border-2 border-muted-foreground/30 text-muted-foreground"
        }`}
      >
        {isAmber ? "!" : stepNumber}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground">{task.label}</p>
        {task.subtext && (
          <p className="mt-0.5 text-xs text-muted-foreground">{task.subtext}</p>
        )}
      </div>
      {interactive && (
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function RecommendedTaskRow({
  task,
  onClick,
}: {
  task: OnboardingTask;
  onClick: () => void;
}) {
  const Icon = task.icon;
  const interactive = Boolean(task.actionRoute);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        interactive ? "bg-secondary/50 hover:bg-secondary" : "bg-secondary/40"
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-havn-cyan/10 text-havn-cyan-deep">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{task.label}</p>
        {task.subtext && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.subtext}</p>
        )}
      </div>
      <span className="shrink-0 rounded-full border border-havn-cyan/30 bg-havn-cyan/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-havn-cyan-deep">
        Recommended
      </span>
      {interactive && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function CompletedTaskRow({ task }: { task: OnboardingTask }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1 opacity-70">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-havn-cyan text-havn-navy">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <p className="truncate text-xs text-muted-foreground line-through">{task.label}</p>
    </div>
  );
}

function CollapsedSummary({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-havn-cyan text-havn-navy">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground/70">
        {expanded ? "Hide" : "Show"}
      </span>
    </button>
  );
}
