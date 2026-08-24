"use client";

import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttendanceKpiSummary } from "@/lib/attendance-display";

const KPI_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9";

function KpiCard({ label, value, tint }: { label: string; value: string | number; tint: KpiTint }) {
  return <TintedKpiCard title={label} value={value} tint={tint} compact />;
}

export function AttendanceKpiStrip({
  kpis,
  openExceptionsCount,
  isLoading,
}: {
  kpis: AttendanceKpiSummary;
  openExceptionsCount?: number;
  isLoading?: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className={KPI_GRID_CLASS}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-[1.25rem]" />
        ))}
      </div>
    );
  }

  return (
    <div className={KPI_GRID_CLASS}>
      <KpiCard label={t("people.attendance.widgets.totalRecords")} value={kpis.totalRecords} tint="sky" />
      <KpiCard label={t("people.attendance.widgets.staffCount")} value={kpis.uniqueStaff} tint="sky" />
      <KpiCard label={t("people.attendance.widgets.complete")} value={kpis.complete} tint="green" />
      <KpiCard
        label={t("people.attendance.widgets.missingPunch")}
        value={kpis.missingPunch}
        tint={kpis.missingPunch > 0 ? "red" : "slate"}
      />
      <KpiCard
        label={t("people.attendance.widgets.incomplete")}
        value={kpis.incomplete}
        tint={kpis.incomplete > 0 ? "amber" : "slate"}
      />
      <KpiCard
        label={t("people.attendance.widgets.overtime")}
        value={kpis.overtime}
        tint={kpis.overtime > 0 ? "orange" : "slate"}
      />
      <KpiCard label={t("people.attendance.widgets.totalHours")} value={kpis.totalHours.toFixed(2)} tint="sky" />
      <KpiCard
        label={t("people.attendance.widgets.late")}
        value={kpis.late}
        tint={kpis.late > 0 ? "amber" : "slate"}
      />
      <KpiCard
        label={t("people.attendance.widgets.openExceptions")}
        value={openExceptionsCount ?? 0}
        tint={(openExceptionsCount ?? 0) > 0 ? "red" : "slate"}
      />
    </div>
  );
}
