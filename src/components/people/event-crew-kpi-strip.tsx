"use client";

/* Hallmark · redesign · Event Crew KPI strip · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · sibling Attendance overview)
 */

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import type { CrewKpis } from "@/lib/people-event-crew-display";
import { cn } from "@/lib/utils";

function formatDelta(delta: number | null): string | null {
  if (delta == null || Number.isNaN(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}%`;
}

function KpiCard({
  title,
  value,
  meta,
  metaTone,
  hint,
  icon: Icon,
  iconClass,
  valueClass,
}: {
  title: string;
  value: string | number;
  meta?: string;
  metaTone?: "up" | "blue" | "orange" | "red" | "muted";
  hint?: string;
  icon: LucideIcon;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <article className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
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
                  metaTone === "red" && "bg-red-50 text-red-700",
                  (!metaTone || metaTone === "muted") && "bg-muted text-muted-foreground",
                )}
              >
                {meta}
              </span>
              {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
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

export function EventCrewKpiStrip({
  kpis,
  isLoading,
  hasAttendance,
}: {
  kpis: CrewKpis;
  isLoading?: boolean;
  hasAttendance: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  const totalDelta = formatDelta(kpis.totalDeltaPct);
  const activeDelta = formatDelta(kpis.activeDeltaPct);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        title={t("peopleEvent.crew.kpiTotal")}
        value={kpis.totalAssignments}
        meta={totalDelta ?? undefined}
        metaTone="up"
        hint={totalDelta ? t("peopleEvent.crew.kpiVsPrevious") : undefined}
        icon={CalendarDays}
        iconClass="bg-violet-100 text-[#7c3aed]"
      />
      <KpiCard
        title={t("peopleEvent.crew.kpiActive")}
        value={kpis.activeAssignments}
        meta={activeDelta ?? undefined}
        metaTone="up"
        icon={Users}
        iconClass="bg-emerald-100 text-emerald-700"
      />
      <KpiCard
        title={t("peopleEvent.crew.kpiOnDuty")}
        value={hasAttendance ? kpis.onDutyToday : "—"}
        meta={hasAttendance ? `${kpis.onDutyPct}%` : undefined}
        metaTone="blue"
        icon={CheckCircle2}
        iconClass="bg-sky-100 text-sky-700"
        valueClass="text-sky-700"
      />
      <KpiCard
        title={t("peopleEvent.crew.kpiLate")}
        value={hasAttendance ? kpis.lateToday : "—"}
        meta={hasAttendance ? `${kpis.latePct}%` : undefined}
        metaTone="orange"
        icon={Clock3}
        iconClass="bg-orange-100 text-orange-700"
        valueClass="text-orange-600"
      />
      <KpiCard
        title={t("peopleEvent.crew.kpiAbsent")}
        value={hasAttendance ? kpis.absentToday : "—"}
        meta={hasAttendance ? `${kpis.absentPct}%` : undefined}
        metaTone="red"
        icon={XCircle}
        iconClass="bg-red-100 text-red-600"
        valueClass="text-red-600"
      />
    </div>
  );
}
