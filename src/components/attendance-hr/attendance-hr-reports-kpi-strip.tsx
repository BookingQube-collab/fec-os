"use client";

import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttendanceHrReportKpis } from "@/lib/attendance-hr/report";

const KPI_GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7";

function KpiCard({ label, value, tint }: { label: string; value: number; tint: KpiTint }) {
  return <TintedKpiCard title={label} value={value} tint={tint} compact />;
}

export function AttendanceHrReportsKpiStrip({
  kpis,
  isLoading,
}: {
  kpis: AttendanceHrReportKpis;
  isLoading?: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className={KPI_GRID_CLASS} aria-hidden>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-[1.25rem]" />
        ))}
      </div>
    );
  }

  return (
    <div className={KPI_GRID_CLASS} role="region" aria-label={t("attendanceHr.reports.kpiStrip")}>
      <KpiCard label={t("attendanceHr.reports.kpiTotal")} value={kpis.total} tint="sky" />
      <KpiCard label={t("attendanceHr.reports.kpiStaff")} value={kpis.uniqueStaff} tint="sky" />
      <KpiCard label={t("attendanceHr.reports.kpiPresent")} value={kpis.present} tint="green" />
      <KpiCard
        label={t("attendanceHr.reports.kpiAbsent")}
        value={kpis.absent}
        tint={kpis.absent > 0 ? "red" : "slate"}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiLate")}
        value={kpis.late}
        tint={kpis.late > 0 ? "amber" : "slate"}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiMissedPunch")}
        value={kpis.missedPunch}
        tint={kpis.missedPunch > 0 ? "orange" : "slate"}
      />
      <KpiCard label={t("attendanceHr.reports.kpiUnscheduled")} value={kpis.unscheduled} tint="slate" />
    </div>
  );
}
