"use client";

/* Hallmark · redesign · Event Payroll KPI strip · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · sibling Crew / Roles / Overview)
 */

import {
  CalendarDays,
  CheckCircle2,
  Coins,
  Layers,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import {
  formatHours,
  formatQarAmount,
  type EventPayrollKpis,
} from "@/lib/people-event-payroll-display";
import { cn } from "@/lib/utils";

function formatDelta(delta: number | null): string | null {
  if (delta == null || Number.isNaN(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  return `↑ ${sign}${delta}%`;
}

function KpiCard({
  title,
  value,
  meta,
  metaTone,
  hint,
  icon: Icon,
  iconClass,
  trailing,
}: {
  title: string;
  value: string | number;
  meta?: string;
  metaTone?: "up" | "muted";
  hint?: string;
  icon: LucideIcon;
  iconClass: string;
  trailing?: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {meta || hint ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {meta ? (
                <span
                  className={cn(
                    "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    metaTone === "up" && "bg-emerald-50 text-emerald-700",
                    (!metaTone || metaTone === "muted") && "bg-muted text-muted-foreground",
                  )}
                >
                  {meta}
                </span>
              ) : null}
              {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={cn("grid h-10 w-10 place-items-center rounded-xl", iconClass)}>
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          {trailing}
        </div>
      </div>
    </article>
  );
}

function CompletedRing({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative grid h-12 w-12 place-items-center" aria-hidden>
      <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgb(226 232 240)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-sky-700">
        {clamped.toFixed(clamped % 1 === 0 ? 0 : 1)}%
      </span>
    </div>
  );
}

export function EventPayrollKpiStrip({
  kpis,
  isLoading,
  locale = "en",
}: {
  kpis: EventPayrollKpis;
  isLoading?: boolean;
  locale?: string;
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

  const periodsDelta = formatDelta(kpis.totalPeriodsDeltaPct);
  const crewDelta = formatDelta(kpis.crewPaidDeltaPct);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        title={t("peopleEvent.payroll.kpiTotalPeriods")}
        value={kpis.totalPeriods}
        meta={periodsDelta ?? undefined}
        metaTone="up"
        hint={periodsDelta ? t("peopleEvent.payroll.kpiVsPrevious") : undefined}
        icon={CalendarDays}
        iconClass="bg-violet-100 text-[#7c3aed]"
      />
      <KpiCard
        title={t("peopleEvent.payroll.kpiCrewPaid")}
        value={kpis.crewPaid}
        meta={crewDelta ?? undefined}
        metaTone="up"
        hint={crewDelta ? t("peopleEvent.payroll.kpiVsPrevious") : undefined}
        icon={Users}
        iconClass="bg-emerald-100 text-emerald-700"
      />
      <KpiCard
        title={t("peopleEvent.payroll.kpiTotalHours")}
        value={formatHours(kpis.totalHours, locale)}
        icon={Layers}
        iconClass="bg-sky-100 text-sky-700"
      />
      <KpiCard
        title={t("peopleEvent.payroll.kpiPayrollAmount")}
        value={formatQarAmount(kpis.payrollAmountQar, locale)}
        icon={Coins}
        iconClass="bg-amber-100 text-amber-700"
      />
      <KpiCard
        title={t("peopleEvent.payroll.kpiCompleted")}
        value={kpis.completedPeriods}
        icon={CheckCircle2}
        iconClass="bg-violet-100 text-[#7c3aed]"
        trailing={<CompletedRing pct={kpis.completedPct} />}
      />
    </div>
  );
}
