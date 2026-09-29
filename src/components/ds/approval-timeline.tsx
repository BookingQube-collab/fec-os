"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ApprovalStageState = "completed" | "current" | "waiting" | "rejected" | "returned";

export type ApprovalStage = {
  id: string;
  label: string;
  state: ApprovalStageState;
  detail?: string;
  when?: string;
};

const MARK: Record<ApprovalStageState, string> = {
  completed: "border-emerald-700 bg-emerald-600",
  current: "border-primary bg-primary",
  waiting: "border-border bg-card",
  rejected: "border-destructive bg-destructive",
  returned: "border-amber-600 bg-amber-500",
};

export function ApprovalTimeline({
  stages,
  title,
  stateLabels,
}: {
  stages: ApprovalStage[];
  title: string;
  stateLabels: Record<ApprovalStageState, string>;
}) {
  const signature = stages.map((stage) => `${stage.id}:${stage.state}`).join("|");
  const previous = useRef<string | null>(null);
  const [shiftedId, setShiftedId] = useState<string | null>(null);

  useEffect(() => {
    const prior = previous.current;
    previous.current = signature;
    if (prior == null || prior === signature) return;
    const before = new Map(
      prior.split("|").filter(Boolean).map((part) => {
        const splitAt = part.indexOf(":");
        return [part.slice(0, splitAt), part.slice(splitAt + 1)] as const;
      }),
    );
    const moved = stages.find((stage) => {
      const earlier = before.get(stage.id);
      return earlier != null && earlier !== stage.state;
    });
    if (!moved) return;
    setShiftedId(moved.id);
    const timer = window.setTimeout(() => setShiftedId(null), 380);
    return () => window.clearTimeout(timer);
  }, [signature, stages]);

  return (
    <section aria-label={title} className="ds-enter rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ol className="mt-4 space-y-0">
        {stages.map((stage, index) => (
          <li
            key={stage.id}
            className={cn("relative pb-5 ps-8 last:pb-0", shiftedId === stage.id && "ds-enter")}
            aria-current={stage.state === "current" ? "step" : undefined}
          >
            {index < stages.length - 1 ? (
              <span aria-hidden className="absolute start-[7px] top-4 h-[calc(100%-0.25rem)] w-px bg-border" />
            ) : null}
            <span
              aria-hidden
              className={cn("absolute start-0 top-1 h-4 w-4 rounded-full border-2", MARK[stage.state])}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="min-w-0 break-words text-sm font-semibold text-foreground">{stage.label}</p>
              <span className="text-xs font-semibold text-muted-foreground">{stateLabels[stage.state]}</span>
            </div>
            {stage.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{stage.detail}</p> : null}
            {stage.when ? <p className="mt-0.5 text-xs text-muted-foreground">{stage.when}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
