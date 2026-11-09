/* Hallmark · HR Event Operations Report KPIs — coverage & cost readiness */

import {
  AlertTriangle,
  Banknote,
  Clock3,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import type { EventOperationsReportKpis } from "@/lib/people-event-reports-display";
import { cn } from "@/lib/utils";

function formatQar(value: number | null, locale: string): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", {
      style: "currency",
      currency: "QAR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `QAR ${value.toLocaleString()}`;
  }
}

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  iconClass,
  valueClass,
}: {
  title: string;
  value: string | number;
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
          {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", iconClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
    </article>
  );
}

export function EventOperationsReportKpiStrip({
  kpis,
  isLoading,
  locale = "en",
}: {
  kpis: EventOperationsReportKpis;
  isLoading?: boolean;
  locale?: string;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  const costHint =
    kpis.estimatedLabourCostQar == null
      ? t("peopleEvent.reports.kpiCostEmptyHint")
      : kpis.costDaysUnpriced > 0
        ? t("peopleEvent.reports.kpiCostPartialHint", {
            priced: kpis.costDaysPriced,
            unpriced: kpis.costDaysUnpriced,
          })
        : t("peopleEvent.reports.kpiCostHint", { days: kpis.costDaysPriced });

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <KpiCard
        title={t("peopleEvent.reports.kpiScheduledCrew")}
        value={kpis.scheduledCrew}
        hint={t("peopleEvent.reports.kpiScheduledCrewHint")}
        icon={Users}
        iconClass="bg-violet-100 text-[#7c3aed]"
      />
      <KpiCard
        title={t("peopleEvent.reports.kpiCoverage")}
        value={`${kpis.coveragePct}%`}
        hint={t("peopleEvent.reports.kpiCoverageHint")}
        icon={ShieldCheck}
        iconClass="bg-emerald-50 text-emerald-700"
        valueClass="text-emerald-700"
      />
      <KpiCard
        title={t("peopleEvent.reports.kpiAttendanceRate")}
        value={`${kpis.attendanceRatePct}%`}
        hint={t("peopleEvent.reports.kpiAttendanceRateHint")}
        icon={UserRound}
        iconClass="bg-sky-50 text-sky-700"
      />
      <KpiCard
        title={t("peopleEvent.reports.kpiLabourHours")}
        value={`${kpis.labourHours} h`}
        hint={t("peopleEvent.reports.kpiLabourHoursHint")}
        icon={Clock3}
        iconClass="bg-amber-50 text-amber-700"
      />
      <KpiCard
        title={t("peopleEvent.reports.kpiLabourCost")}
        value={formatQar(kpis.estimatedLabourCostQar, locale)}
        hint={costHint}
        icon={Banknote}
        iconClass="bg-fuchsia-50 text-fuchsia-700"
      />
      <KpiCard
        title={t("peopleEvent.reports.kpiExceptions")}
        value={kpis.openExceptions}
        hint={t("peopleEvent.reports.kpiExceptionsHint")}
        icon={AlertTriangle}
        iconClass="bg-orange-50 text-orange-700"
        valueClass={kpis.openExceptions > 0 ? "text-orange-700" : undefined}
      />
    </div>
  );
}
