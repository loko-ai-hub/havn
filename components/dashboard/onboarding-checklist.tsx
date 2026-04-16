"use client";

import { Rocket } from "lucide-react";
import { useRouter } from "next/navigation";

import { Progress } from "@/components/ui/progress";

export type OnboardingTask = {
  id: string;
  label: string;
  completed: boolean;
  actionLabel?: string;
  actionRoute?: string;
  subtext?: string;
  statusColor?: "amber";
};

interface OnboardingChecklistProps {
  tasks: OnboardingTask[];
  onDismiss: () => void;
}

export default function OnboardingChecklist({ tasks, onDismiss }: OnboardingChecklistProps) {
  const router = useRouter();
  const completed = tasks.filter((t) => t.completed).length;
  const pct = Math.round((completed / tasks.length) * 100);
  const remaining = tasks.length - completed;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-primary/5 to-transparent px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Rocket className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Finish setting up Havn</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {remaining > 0
                  ? `${remaining} step${remaining > 1 ? "s" : ""} remaining to go live`
                  : "You're all set! 🎉"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-xs font-semibold text-foreground">{pct}%</span>
            <div className="hidden w-28 sm:block">
              <Progress value={pct} className="h-2 bg-muted [&>div]:bg-primary [&>div]:transition-all" />
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2.5 px-6 py-4">
        {tasks.map((task, i) => (
          <div
            key={task.id}
            className={`flex items-start justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors ${
              task.completed ? "opacity-60" : "bg-secondary/50 hover:bg-secondary"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                  task.completed
                    ? "bg-havn-success text-white"
                    : task.statusColor === "amber"
                      ? "bg-primary text-primary-foreground"
                      : "border-2 border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {task.completed ? "✓" : task.statusColor === "amber" ? "!" : i + 1}
              </span>
              <div>
                <span
                  className={`text-sm ${
                    task.completed ? "text-muted-foreground line-through" : "font-medium text-foreground"
                  }`}
                >
                  {task.label}
                </span>
                {!task.completed && task.subtext && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{task.subtext}</p>
                )}
              </div>
            </div>
            {!task.completed && task.actionLabel && task.actionRoute && (
              <button
                type="button"
                onClick={() => router.push(task.actionRoute!)}
                className="shrink-0 rounded-md bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                {task.actionLabel}
              </button>
            )}
          </div>
        ))}

        <div className="px-3 pt-1">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss for now
          </button>
        </div>
      </div>
    </div>
  );
}
