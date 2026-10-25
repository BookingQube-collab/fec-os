"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  CHART,
  CHART_MARGIN,
  CHART_PLOT,
  chartBarRadius,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  seriesColor,
  truncateAxisLabel,
} from "@/lib/chart-theme";
import type { SuggestionNamedCount, SuggestionVolumePoint } from "@/lib/hr-suggestions";

const STATUS_COLORS: Record<string, string> = {
  new: CHART.teal,
  seen: CHART.info,
  closed: CHART.muted,
};

function formatDayTick(ymd: string): string {
  const [, month, day] = ymd.split("-");
  return `${day}/${month}`;
}

export function SuggestionsDashboardCharts({
  volume,
  byCategory,
  byStatus,
}: {
  volume: SuggestionVolumePoint[];
  byCategory: SuggestionNamedCount[];
  byStatus: SuggestionNamedCount[];
}) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const empty = t("hr.suggestions.charts.empty");
  const hasVolume = volume.some((point) => point.count > 0);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        className="min-w-0 overflow-hidden xl:col-span-2"
        title={t("hr.suggestions.charts.volumeTitle")}
        subtitle={t("hr.suggestions.charts.volumeHint")}
      >
        {!hasVolume ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis
                  dataKey="date"
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={formatDayTick}
                  minTickGap={24}
                />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  labelFormatter={(value) => String(value)}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name={t("hr.suggestions.charts.submitted")}
                  stroke={CHART.ink}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reducedMotion}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        className="min-w-0 overflow-hidden"
        title={t("hr.suggestions.charts.byStatus")}
        subtitle={t("hr.suggestions.charts.byStatusHint")}
      >
        {byStatus.length === 0 ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis
                  dataKey="label"
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(value) => truncateAxisLabel(String(value), 12)}
                />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar
                  dataKey="count"
                  name={t("hr.suggestions.charts.count")}
                  radius={chartBarRadius}
                  maxBarSize={48}
                  isAnimationActive={!reducedMotion}
                >
                  {byStatus.map((row, index) => (
                    <Cell key={row.key} fill={STATUS_COLORS[row.key] ?? seriesColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        className="min-w-0 overflow-hidden"
        title={t("hr.suggestions.charts.byCategory")}
        subtitle={t("hr.suggestions.charts.byCategoryHint")}
      >
        {byCategory.length === 0 ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis
                  dataKey="label"
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(value) => truncateAxisLabel(String(value), 12)}
                />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar
                  dataKey="count"
                  name={t("hr.suggestions.charts.count")}
                  radius={chartBarRadius}
                  maxBarSize={48}
                  isAnimationActive={!reducedMotion}
                >
                  {byCategory.map((row, index) => (
                    <Cell key={row.key} fill={seriesColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
