"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import type { NamedCount } from "@/lib/hr-overview";

const DOC_COLORS: Record<string, string> = {
  expired: CHART.red,
  expiring: CHART.amber,
  qid: CHART.info,
  passport: CHART.teal,
};

function CountBars({
  rows,
  seriesName,
  colorFor,
}: {
  rows: Array<{ key: string; label: string; count: number }>;
  seriesName: string;
  colorFor?: (key: string, index: number) => string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            dataKey="label"
            tick={chartTick}
            stroke={CHART.grid}
            interval={0}
            tickFormatter={(value) => truncateAxisLabel(String(value), 14)}
          />
          <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
          <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
          <Bar
            dataKey="count"
            name={seriesName}
            radius={chartBarRadius}
            maxBarSize={48}
            isAnimationActive={!reducedMotion}
          >
            {rows.map((row, index) => (
              <Cell key={row.key} fill={colorFor ? colorFor(row.key, index) : seriesColor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HrDashboardCharts({
  byLocation,
  byCategory,
  documents,
}: {
  byLocation: NamedCount[];
  byCategory: NamedCount[];
  documents: Array<{ key: string; label: string; count: number }>;
}) {
  const { t } = useTranslation();
  const empty = t("hr.dashboard.charts.empty");
  const seriesName = t("hr.dashboard.charts.count");
  const docsHaveCounts = documents.some((row) => row.count > 0);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        className="min-w-0 overflow-hidden"
        title={t("hr.dashboard.byLocation")}
        subtitle={t("hr.dashboard.charts.locationHint")}
      >
        {byLocation.length === 0 ? <ChartEmpty label={empty} /> : <CountBars rows={byLocation} seriesName={seriesName} />}
      </ChartCard>
      <ChartCard
        className="min-w-0 overflow-hidden"
        title={t("hr.dashboard.byCategory")}
        subtitle={t("hr.dashboard.charts.categoryHint")}
      >
        {byCategory.length === 0 ? <ChartEmpty label={empty} /> : <CountBars rows={byCategory} seriesName={seriesName} />}
      </ChartCard>
      <ChartCard
        className="min-w-0 overflow-hidden xl:col-span-2"
        title={t("hr.dashboard.charts.documentExpiry")}
        subtitle={t("hr.dashboard.charts.documentExpiryHint")}
      >
        {docsHaveCounts ? (
          <CountBars
            rows={documents}
            seriesName={seriesName}
            colorFor={(key, index) => DOC_COLORS[key] ?? seriesColor(index)}
          />
        ) : (
          <ChartEmpty label={empty} />
        )}
      </ChartCard>
    </div>
  );
}
