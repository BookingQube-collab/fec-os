"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { ChartEmpty } from "@/components/charts/chart-card";
import { ChartWidget } from "@/components/dashboard/chart-widget";
import {
  CHART,
  CHART_MARGIN,
  CHART_PLOT,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  truncateAxisLabel,
} from "@/lib/chart-theme";

type PerformanceDashboardCharts = {
  evaluationsByStatus: Array<{ status: string; count: number }>;
  evaluationsByRating: Array<{ band: string; count: number }>;
  scoreTrend: Array<{ cycle: string; periodStart: string; avgScore: number; scored: number }>;
  avgByDepartment: Array<{ department: string; avgScore: number; count: number }>;
  recognition: Array<{ month: string; achievements: number; nominations: number }>;
};

const STATUS_COLORS: Record<string, string> = {
  draft: CHART.muted,
  supervisor_review: CHART.amber,
  manager_review: CHART.info,
  employee_ack: CHART.gold,
  finalized: CHART.teal,
  cancelled: CHART.red,
};

const RATING_COLORS: Record<string, string> = {
  excellent: CHART.teal,
  good: CHART.info,
  needs_attention: CHART.amber,
  poor: CHART.red,
  unscored: CHART.muted,
};

function formatMonthLabel(ym: string, language: string): string {
  const [year, month] = ym.split("-").map(Number);
  if (!year || !month) return ym;
  return new Date(year, month - 1, 1).toLocaleDateString(language.startsWith("ar") ? "ar" : "en", {
    month: "short",
    year: "numeric",
  });
}

export function PerformanceDashboardCharts({
  evaluationsByStatus,
  evaluationsByRating,
  scoreTrend,
  avgByDepartment,
  recognition,
}: PerformanceDashboardCharts) {
  const { t, i18n } = useTranslation();
  const noData = t("performance.dashboard.charts.noData");
  const unassigned = t("performance.dashboard.charts.unassigned");

  const statusData = evaluationsByStatus.map((row) => ({
    ...row,
    label: t(`performance.status.${row.status}`, { defaultValue: row.status.replace(/_/g, " ") }),
  }));

  const ratingData = evaluationsByRating.map((row) => ({
    ...row,
    label: t(`performance.rating.${row.band}`, { defaultValue: row.band.replace(/_/g, " ") }),
  }));

  const departmentData = avgByDepartment.map((row) => ({
    ...row,
    label: row.department || unassigned,
  }));

  const recognitionData = recognition.map((row) => ({
    ...row,
    label: formatMonthLabel(row.month, i18n.language),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartWidget title={t("performance.dashboard.charts.byStatus")}>
        {statusData.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={72}
                >
                  {statusData.map((row) => (
                    <Cell key={row.status} fill={STATUS_COLORS[row.status] ?? CHART.muted} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number, name: string) => [value, name]}
                />
                <Legend wrapperStyle={chartLegendStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartWidget>

      <ChartWidget title={t("performance.dashboard.charts.byRating")}>
        {ratingData.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingData} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="label" tick={chartTick} stroke={CHART.grid} interval={0} />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [value, t("performance.dashboard.charts.count")]}
                />
                <Bar dataKey="count" name={t("performance.dashboard.charts.count")} radius={[4, 4, 0, 0]}>
                  {ratingData.map((row) => (
                    <Cell key={row.band} fill={RATING_COLORS[row.band] ?? CHART.muted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartWidget>

      <ChartWidget title={t("performance.dashboard.charts.scoreTrend")}>
        {scoreTrend.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreTrend} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis
                  dataKey="cycle"
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(value) => truncateAxisLabel(String(value), 14)}
                />
                <YAxis tick={chartTick} stroke={CHART.grid} domain={[0, 100]} width={36} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [
                    value.toFixed(1),
                    t("performance.dashboard.charts.avgScore"),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  stroke={CHART.ink}
                  strokeWidth={3}
                  dot={{ r: 4, fill: CHART.gold }}
                  name={t("performance.dashboard.charts.avgScore")}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartWidget>

      <ChartWidget title={t("performance.dashboard.charts.byDepartment")}>
        {departmentData.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={departmentData}
                layout="vertical"
                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid {...chartGridProps} />
                <XAxis type="number" tick={chartTick} stroke={CHART.grid} domain={[0, 100]} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={chartTick}
                  stroke={CHART.grid}
                  width={108}
                  tickFormatter={(value) => truncateAxisLabel(String(value))}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [
                    value.toFixed(1),
                    t("performance.dashboard.charts.avgScore"),
                  ]}
                />
                <Bar
                  dataKey="avgScore"
                  fill={CHART.ink}
                  name={t("performance.dashboard.charts.avgScore")}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartWidget>

      <ChartWidget title={t("performance.dashboard.charts.recognition")} className="lg:col-span-2">
        {recognitionData.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recognitionData} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="label" tick={chartTick} stroke={CHART.grid} />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Legend wrapperStyle={chartLegendStyle} />
                <Bar
                  dataKey="achievements"
                  fill={CHART.gold}
                  name={t("performance.dashboard.charts.achievements")}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="nominations"
                  fill={CHART.ink}
                  name={t("performance.dashboard.charts.nominations")}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartWidget>
    </div>
  );
}
