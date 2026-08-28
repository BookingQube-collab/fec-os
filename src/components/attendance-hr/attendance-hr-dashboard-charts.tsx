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
  truncateAxisLabel,
} from "@/lib/chart-theme";

export function AttendanceHrDashboardChart({
  sites,
}: {
  sites: Array<{ code: string; label?: string; in: number; out: number; late: number }>;
}) {
  const { t } = useTranslation();
  const hasData = sites.some((site) => site.in + site.out + site.late > 0);
  const chartSites = sites.map((site) => ({ ...site, label: site.label || site.code }));

  return (
    <ChartCard
      title={t("attendanceHr.dashboard.chartTitle", { defaultValue: "In / out by site" })}
      subtitle={t("attendanceHr.dashboard.chartSubtitle", { defaultValue: "Mapped and unmatched punches for the selected period." })}
    >
      {!hasData ? (
        <ChartEmpty label={t("attendanceHr.dashboard.chartEmpty", { defaultValue: "No punches for this period." })} />
      ) : (
        <div className={CHART_PLOT}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartSites} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis
                dataKey="label"
                tick={chartTick}
                stroke={CHART.grid}
                interval={0}
                tickFormatter={(value) => truncateAxisLabel(String(value), 18)}
              />
              <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Legend wrapperStyle={chartLegendStyle} />
              <Bar dataKey="in" fill={CHART.teal} radius={chartBarRadius} name={t("attendanceHr.dashboard.in", { defaultValue: "In" })} />
              <Bar dataKey="out" fill={CHART.ink} radius={chartBarRadius} name={t("attendanceHr.dashboard.out", { defaultValue: "Out" })} />
              <Bar dataKey="late" fill={CHART.amber} radius={chartBarRadius} name={t("attendanceHr.dashboard.late", { defaultValue: "Late" })} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
