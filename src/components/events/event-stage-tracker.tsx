"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StageGateTone } from "@/lib/events/lifecycle";
import type { EventStage } from "@/lib/events/types";
import { cn } from "@/lib/utils";

type PhaseMark = "done" | "now" | "gate" | "blocked" | "upcoming";

const TAG_TONE: Record<PhaseMark, string> = {
  done: "bg-[var(--success)] text-white",
  now: "bg-primary text-primary-foreground",
  gate: "bg-[var(--electric)] text-primary",
  blocked: "bg-destructive text-destructive-foreground",
  upcoming: "bg-muted-foreground text-white",
};

const CARET_TONE: Record<PhaseMark, string> = {
  done: "border-t-[var(--success)]",
  now: "border-t-primary",
  gate: "border-t-[var(--electric)]",
  blocked: "border-t-destructive",
  upcoming: "border-t-muted-foreground",
};

const RAIL_HOVER: Record<PhaseMark, string> = {
  done: "group-hover:bg-primary group-hover:ring-[var(--success)] group-focus-visible:bg-primary group-focus-visible:ring-[var(--success)]",
  now: "group-hover:ring-primary group-focus-visible:ring-primary",
  gate: "group-hover:bg-[var(--electric)] group-hover:ring-[var(--electric)] group-focus-visible:bg-[var(--electric)] group-focus-visible:ring-[var(--electric)]",
  blocked: "group-hover:bg-destructive group-hover:ring-destructive group-focus-visible:bg-destructive group-focus-visible:ring-destructive",
  upcoming: "group-hover:bg-muted-foreground/45 group-hover:ring-muted-foreground/50 group-focus-visible:bg-muted-foreground/45 group-focus-visible:ring-muted-foreground/50",
};

function GateDiamond({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0 rotate-45 rounded-[1px] bg-current", className)}
      aria-hidden
    />
  );
}

function StatusDot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full bg-current", className)} aria-hidden />;
}

function DownCaret({ status, className }: { status: PhaseMark; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent", CARET_TONE[status], className)}
    />
  );
}

function phaseMark(opts: {
  active: boolean;
  done: boolean;
  tone: StageGateTone | null;
  critical: boolean;
}): PhaseMark {
  if (opts.active) return "now";
  if (opts.tone === "blocked") return "blocked";
  if (opts.done) return "done";
  if (opts.critical || opts.tone === "watch") return "gate";
  return "upcoming";
}

function PhaseHoverTag({
  label,
  status,
  align,
}: {
  label: string;
  status: PhaseMark;
  align: "start" | "center" | "end";
}) {
  const { t } = useTranslation();
  const statusLabel = t(`events.home.legend.${status}`);

  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-full z-30 mb-1 flex flex-col items-center opacity-0 transition-opacity duration-150",
        "group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:invisible",
        align === "start" && "items-start",
        align === "end" && "items-end",
      )}
    >
      <span
        className={cn(
          "relative max-w-[11rem] truncate rounded-md px-2 py-1 text-[10px] font-semibold leading-tight shadow-elevated-xs",
          TAG_TONE[status],
        )}
      >
        {t("events.home.hoverTag", { stage: label, status: statusLabel })}
      </span>
      <DownCaret
        status={status}
        className={cn(align === "start" && "ms-3", align === "end" && "me-3")}
      />
    </span>
  );
}

export function EventStageTracker({
  stages,
  currentId,
  selectedId,
  onSelect,
  youAreHere,
  gateTone,
}: {
  stages: EventStage[];
  currentId: string | null;
  selectedId?: string | null;
  onSelect?: (stage: EventStage) => void;
  youAreHere?: string;
  gateTone?: (stage: EventStage) => StageGateTone | null;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const linear = stages.filter((s) => s.is_linear !== false).sort((a, b) => a.sort_order - b.sort_order);
  const current = linear.find((s) => s.id === currentId) ?? stages.find((s) => s.id === currentId);
  const currentOrder = current?.sort_order ?? 0;
  const highlightId = selectedId ?? currentId;
  const currentIndex = Math.max(0, linear.findIndex((s) => s.id === currentId));
  const hereLabel = youAreHere ?? t("events.home.youAreHere");
  const currentName = current ? (ar ? current.label_ar : current.label_en) : null;
  const phaseCount = current
    ? current.is_critical
      ? t("events.home.gateOf", { n: currentIndex + 1, total: linear.length })
      : t("events.home.phaseProgress", { n: currentIndex + 1, total: linear.length })
    : null;

  const blocked = linear
    .map((stage) => ({ stage, tone: gateTone?.(stage) ?? null }))
    .filter((row) => row.tone === "blocked");

  return (
    <div className="min-w-0 max-w-full overflow-visible rounded-2xl border border-border/40 bg-card p-4 pt-5">
      <header className="mb-3 min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{t("events.home.timeline")}</h2>
        {currentName ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-lg font-semibold tracking-tight text-foreground">{currentName}</p>
            {phaseCount ? (
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{phaseCount}</span>
            ) : null}
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {hereLabel}
            </span>
          </div>
        ) : null}
      </header>

      <div className="min-w-0 overflow-x-auto overscroll-x-contain">
        <ol
          className="flex min-w-[56rem] items-stretch gap-0.5 pb-1 pt-11"
          aria-label={t("events.home.timeline")}
        >
          {linear.map((stage, index) => {
            const done = stage.sort_order < currentOrder;
            const active = stage.id === currentId;
            const selected = stage.id === highlightId;
            const label = ar ? stage.label_ar : stage.label_en;
            const shortKey = `events.home.phaseShort.${stage.code}`;
            const shortName = i18n.exists(shortKey) ? t(shortKey) : label;
            const tone = gateTone?.(stage) ?? null;
            const isLast = index === linear.length - 1;
            const isFirst = index === 0;
            const align = isFirst ? "start" : isLast ? "end" : "center";
            const mark = phaseMark({
              active,
              done,
              tone,
              critical: stage.is_critical,
            });

            return (
              <li key={stage.id} className="relative min-w-[3.75rem] flex-1 overflow-visible">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      aria-label={t("events.home.inspectPhase", {
                        stage: label,
                        n: index + 1,
                        total: linear.length,
                      })}
                      onClick={() => onSelect?.(stage)}
                      className="group relative flex h-full w-full flex-col items-center overflow-visible rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2"
                    >
                      <PhaseHoverTag label={label} status={mark} align={align} />

                      <span
                        className={cn(
                          "line-clamp-2 h-8 w-full px-0.5 text-center text-[10px] leading-tight",
                          active
                            ? "font-bold text-foreground"
                            : "font-medium text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground",
                        )}
                      >
                        {shortName}
                      </span>

                      <span className="relative mt-auto flex w-full flex-col items-center">
                        <DownCaret
                          status={mark}
                          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-px -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:invisible"
                        />

                        <span className="grid h-4 w-full place-items-center">
                          {mark === "now" ? (
                            <span className="size-2.5 rounded-full bg-primary shadow-[0_0_0_3px] shadow-primary/20" />
                          ) : mark === "blocked" ? (
                            <AlertTriangle className="size-3 text-rag-red" strokeWidth={2.25} />
                          ) : tone === "clear" ? (
                            <span className="size-2 rounded-full bg-[var(--color-success)]" />
                          ) : mark === "gate" ? (
                            <GateDiamond className="text-muted-foreground" />
                          ) : null}
                        </span>

                        <span
                          className={cn(
                            "w-full rounded-[2px] transition-[height,background-color,box-shadow] duration-150",
                            isFirst && "rounded-s-full",
                            isLast && "rounded-e-full",
                            active ? "h-3 bg-primary" : "h-2.5",
                            done && !active && "bg-primary",
                            !done && !active && mark === "blocked" && "bg-destructive/70",
                            !done && !active && mark !== "blocked" && "bg-border/80",
                            "group-hover:h-3.5 group-focus-visible:h-3.5",
                            "group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-offset-card",
                            "group-focus-visible:ring-2 group-focus-visible:ring-offset-1 group-focus-visible:ring-offset-card",
                            RAIL_HOVER[mark],
                            selected && !active && "ring-1 ring-primary/50 ring-offset-1 ring-offset-card",
                          )}
                        />
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align={align} className="w-56 p-3">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("events.home.phaseOf", { n: index + 1, total: linear.length })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {active ? (
                        <Badge variant="default" className="text-[10px] uppercase">
                          {hereLabel}
                        </Badge>
                      ) : null}
                      {tone === "blocked" ? (
                        <Badge variant="destructive" className="text-[10px] uppercase">
                          {t("events.stage.blocked")}
                        </Badge>
                      ) : null}
                      {tone === "clear" ? (
                        <Badge variant="success" className="text-[10px] uppercase">
                          {t("events.stage.open")}
                        </Badge>
                      ) : null}
                      {stage.is_critical && tone !== "blocked" && tone !== "clear" ? (
                        <Badge variant="muted" className="text-[10px] uppercase">
                          {t("events.stage.critical")}
                        </Badge>
                      ) : null}
                      {!active && !tone && !stage.is_critical ? (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {done ? t("events.home.legend.done") : t("events.home.legend.upcoming")}
                        </Badge>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <StatusDot className="bg-primary" />
            {t("events.home.legend.done")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary shadow-[0_0_0_3px] shadow-primary/20" aria-hidden />
            {t("events.home.legend.now")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <GateDiamond />
            {t("events.home.legend.gate")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3 text-rag-red" strokeWidth={2.25} aria-hidden />
            {t("events.home.legend.blocked")}
          </li>
        </ul>
        {blocked.length ? (
          <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
            {blocked.map(({ stage }) => (
              <Badge key={stage.id} variant="destructive" className="text-[10px]">
                {t("events.home.phaseBlocked", { stage: ar ? stage.label_ar : stage.label_en })}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
