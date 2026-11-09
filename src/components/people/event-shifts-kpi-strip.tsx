"use client";

/* Hallmark · redesign · Event Shifts KPI strip · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · sibling Crew / Attendance)
 */

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import type { ShiftKpis } from "@/lib/people-event-shifts-display";
import { cn } from "@/lib/utils";

function KpiCard({
  title,
  value,
  meta,
  metaTone,
  hint,
  icon: Icon,
  iconClass,
  cardClass,
  valueClass,
  progress,
}: {
  title: string;
  value: string | number;
  meta?: string;
  metaTone?: "up" | "blue" | "orange" | "muted";
  hint?: string;
  icon: LucideIcon;
  iconClass: string;
  cardClass?: string;
  valueClass?: string;
  progress?: number;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]",
        cardClass,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn("mt-1.5 text-2xl font-bold tracking-tight text-foreground", valueClass)}>
            {value}
          </p>
          {meta ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  metaTone === "up" && "bg-emerald-50 text-emerald-700",
                  metaTone === "blue" && "bg-sky-50 text-sky-700",
                  metaTone === "orange" && "bg-orange-50 text-orange-700",
                  (!metaTone || metaTone === "muted") && "bg-muted text-muted-foreground",
                )}
              >
                {meta}
              </span>
              {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
            </div>
          ) : null}
          {typeof progress === "number" ? (
            <div className="mt-2.5 h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          ) : null}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", iconClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
    </article>
  );
}

export function EventShiftsKpiStrip({
  kpis,
  isLoading,
  hasEvent,
}: {
  kpis: ShiftKpis;
  isLoading?: boolean;
  hasEvent: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!hasEvent) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={t("peopleEvent.shifts.kpiTotal")}
          value="—"
          icon={CalendarDays}
          iconClass="bg-violet-100 text-[#7c3aed]"
        />
        <KpiCard
          title={t("peopleEvent.shifts.kpiScheduledCrew")}
          value="—"
          icon={Users}
          iconClass="bg-emerald-100 text-emerald-700"
        />
        <KpiCard
          title={t("peopleEvent.shifts.kpiCovered")}
          value="—"
          icon={CheckCircle2}
          iconClass="bg-sky-100 text-sky-700"
        />
        <KpiCard
          title={t("peopleEvent.shifts.kpiUncovered")}
          value="—"
          icon={Clock3}
          iconClass="bg-orange-100 text-orange-700"
          cardClass="border-orange-100/80 bg-orange-50/60"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title={t("peopleEvent.shifts.kpiTotal")}
        value={kpis.totalShifts}
        icon={CalendarDays}
        iconClass="bg-violet-100 text-[#7c3aed]"
      />
      <KpiCard
        title={t("peopleEvent.shifts.kpiScheduledCrew")}
        value={kpis.scheduledCrew}
        icon={Users}
        iconClass="bg-emerald-100 text-emerald-700"
      />
      <KpiCard
        title={t("peopleEvent.shifts.kpiCovered")}
        value={kpis.coveredShifts}
        meta={kpis.totalShifts > 0 ? `${kpis.coveredPct}%` : undefined}
        metaTone="blue"
        progress={kpis.totalShifts > 0 ? kpis.coveredPct : undefined}
        icon={CheckCircle2}
        iconClass="bg-sky-100 text-sky-700"
        valueClass="text-sky-700"
      />
      <KpiCard
        title={t("peopleEvent.shifts.kpiUncovered")}
        value={kpis.uncoveredShifts}
        icon={Clock3}
        iconClass="bg-orange-100 text-orange-700"
        cardClass="border-orange-100/80 bg-orange-50/60"
        valueClass={kpis.uncoveredShifts > 0 ? "text-orange-700" : undefined}
      />
    </div>
  );
}
