"use client";

import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttendanceHrKpiFilter, AttendanceHrReportKpis } from "@/lib/attendance-hr/report";
import { cn } from "@/lib/utils";

const KPI_GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7";

function KpiCard({
  label,
  value,
  tint,
  filterKey,
  active,
  onSelect,
}: {
  label: string;
  value: number;
  tint: KpiTint;
  filterKey: AttendanceHrKpiFilter;
  active?: boolean;
  onSelect?: (key: AttendanceHrKpiFilter) => void;
}) {
  const clickable = Boolean(onSelect);
  return (
    <button
      type="button"
      disabled={!clickable}
      aria-pressed={clickable ? Boolean(active) : undefined}
      aria-label={label}
      onClick={clickable ? () => onSelect?.(filterKey) : undefined}
      className={cn(
        "rounded-[1.25rem] text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        clickable && "cursor-pointer transition-transform hover:-translate-y-0.5",
        !clickable && "cursor-default",
        active && "ring-2 ring-primary/50 shadow-elevated-sm",
      )}
    >
      <TintedKpiCard title={label} value={value} tint={tint} compact />
    </button>
  );
}

export function AttendanceHrReportsKpiStrip({
  kpis,
  isLoading,
  activeFilter,
  onFilterChange,
}: {
  kpis: AttendanceHrReportKpis;
  isLoading?: boolean;
  activeFilter?: AttendanceHrKpiFilter | null;
  onFilterChange?: (filter: AttendanceHrKpiFilter | null) => void;
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

  const select = (key: AttendanceHrKpiFilter) => {
    if (!onFilterChange) return;
    if (key === "total" || key === "staff") {
      onFilterChange(null);
      return;
    }
    onFilterChange(activeFilter === key ? null : key);
  };

  return (
    <div className={KPI_GRID_CLASS} role="region" aria-label={t("attendanceHr.reports.kpiStrip")}>
      <KpiCard
        label={t("attendanceHr.reports.kpiTotal")}
        value={kpis.total}
        tint="sky"
        filterKey="total"
        active={false}
        onSelect={onFilterChange ? select : undefined}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiStaff")}
        value={kpis.uniqueStaff}
        tint="sky"
        filterKey="staff"
        active={false}
        onSelect={onFilterChange ? select : undefined}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiPresent")}
        value={kpis.present}
        tint="green"
        filterKey="present"
        active={activeFilter === "present"}
        onSelect={onFilterChange ? select : undefined}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiAbsent")}
        value={kpis.absent}
        tint={kpis.absent > 0 ? "red" : "slate"}
        filterKey="absent"
        active={activeFilter === "absent"}
        onSelect={onFilterChange ? select : undefined}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiLate")}
        value={kpis.late}
        tint={kpis.late > 0 ? "amber" : "slate"}
        filterKey="late"
        active={activeFilter === "late"}
        onSelect={onFilterChange ? select : undefined}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiMissedPunch")}
        value={kpis.missedPunch}
        tint={kpis.missedPunch > 0 ? "orange" : "slate"}
        filterKey="missed_punch"
        active={activeFilter === "missed_punch"}
        onSelect={onFilterChange ? select : undefined}
      />
      <KpiCard
        label={t("attendanceHr.reports.kpiUnscheduled")}
        value={kpis.unscheduled}
        tint="slate"
        filterKey="unscheduled"
        active={activeFilter === "unscheduled"}
        onSelect={onFilterChange ? select : undefined}
      />
    </div>
  );
}
