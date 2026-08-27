"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_MARGIN,
  CHART_PLOT,
  chartBarRadius,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import type { AvailabilityTrends } from "@/lib/attendance-hr/availability";

export function AttendanceHrTrendsChart({ trends }: { trends: AvailabilityTrends | null | undefined }) {
  const { t } = useTranslation();
  const data = [
    {
      period: t("attendanceHr.dashboard.history"),
      present: trends?.history.present ?? 0,
      absent: trends?.history.absent ?? 0,
      late: trends?.history.late ?? 0,
      visits: trends?.history.visits ?? 0,
    },
    {
      period: t("attendanceHr.dashboard.current"),
      present: trends?.current.present ?? 0,
      absent: trends?.current.absent ?? 0,
      late: trends?.current.late ?? 0,
      visits: trends?.current.visits ?? 0,
    },
    {
      period: t("attendanceHr.dashboard.upcoming"),
      present: trends?.upcoming.rostered ?? 0,
      absent: trends?.upcoming.weekOff ?? 0,
      late: 0,
      visits: 0,
    },
  ];
  const hasData = data.some((row) => row.present + row.absent + row.late + row.visits > 0);

  return (
    <ChartCard
      title={t("attendanceHr.dashboard.trendsTitle")}
      subtitle={t("attendanceHr.dashboard.trendsSubtitle")}
    >
      {!hasData ? (
        <ChartEmpty label={t("attendanceHr.dashboard.trendsEmpty")} />
      ) : (
        <div className={CHART_PLOT}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="period" tick={chartTick} stroke={CHART.grid} />
              <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Legend wrapperStyle={chartLegendStyle} />
              <Bar dataKey="present" fill={CHART.teal} radius={chartBarRadius} name={t("attendanceHr.dashboard.present")} />
              <Bar dataKey="absent" fill={CHART.red} radius={chartBarRadius} name={t("attendanceHr.dashboard.absent")} />
              <Bar dataKey="late" fill={CHART.amber} radius={chartBarRadius} name={t("attendanceHr.dashboard.late")} />
              <Bar dataKey="visits" fill={CHART.info} radius={chartBarRadius} name={t("attendanceHr.dashboard.visits")} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
