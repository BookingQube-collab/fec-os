"use client";

import { useTranslation } from "react-i18next";

import { EVENT_SETUP_STEPS, type EventSetupStepId } from "@/lib/events/setup";
import { cn } from "@/lib/utils";

export function EventSetupStepper({
  current,
  completed,
  onSelect,
}: {
  current: EventSetupStepId;
  completed: Partial<Record<EventSetupStepId, boolean>>;
  onSelect?: (id: EventSetupStepId) => void;
}) {
  const { t } = useTranslation();
  const currentNumber = EVENT_SETUP_STEPS.find((s) => s.id === current)?.number ?? 1;
  const doneCount = EVENT_SETUP_STEPS.filter((s) => completed[s.id]).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm font-semibold">
          {t("events.builder.stepOf", { n: currentNumber, total: EVENT_SETUP_STEPS.length })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("events.builder.progress", { done: doneCount, total: EVENT_SETUP_STEPS.length })}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.round((doneCount / EVENT_SETUP_STEPS.length) * 100)}%` }}
        />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {EVENT_SETUP_STEPS.map((step) => {
          const active = step.id === current;
          const done = Boolean(completed[step.id]);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect?.(step.id)}
                className={cn(
                  "flex h-full w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-start",
                  active && "border-primary bg-primary/10 text-foreground",
                  done && !active && "border-rag-green/40 bg-rag-green/10 text-foreground",
                  !done && !active && "border-border/50 bg-card text-muted-foreground",
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide">
                  {t("events.builder.stepShort", { n: step.number })}
                </span>
                <span className="text-sm font-semibold leading-tight">{t(`events.builder.steps.${step.id}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
