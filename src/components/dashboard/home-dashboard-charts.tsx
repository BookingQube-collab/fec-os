"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_MARGIN,
  CHART_PLOT,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import { fmtQar } from "@/lib/currency";

function hasSeries(rows: Array<Record<string, number | string>>, keys: string[]) {
  return rows.some((row) => keys.some((key) => Number(row[key] ?? 0) > 0));
}

export function HomeCommandCharts({
  woTrend,
  siteIssueChart,
  utilityTrend,
}: {
  woTrend: Array<{ month: string; renewals: number; completed: number }>;
  siteIssueChart: Array<{ site: string; issues: number; critical: number }>;
  utilityTrend: Array<{ month: string; cost: number }>;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-3">
      <ChartCard title={t("home.woTrend")}>
        {!hasSeries(woTrend, ["renewals", "completed"]) ? (
          <ChartEmpty label={t("home.woTrendEmpty")} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={woTrend} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="month" tick={chartTick} stroke={CHART.grid} />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar dataKey="completed" fill={CHART.ink} radius={[4, 4, 0, 0]} name={t("home.servicesDone")} />
                <Bar dataKey="renewals" fill={CHART.amber} radius={[4, 4, 0, 0]} name={t("home.renewalsDue")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title={t("home.siteIssuesChart")}>
        {!hasSeries(siteIssueChart, ["issues"]) ? (
          <ChartEmpty label={t("home.siteIssuesEmpty")} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={siteIssueChart} layout="vertical" margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis type="number" tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <YAxis type="category" dataKey="site" width={64} tick={chartTick} stroke={CHART.grid} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar dataKey="issues" fill={CHART.ink} radius={[0, 6, 6, 0]} name={t("home.tableIssues")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title={t("home.utilityTrendChart")}>
        {!hasSeries(utilityTrend, ["cost"]) ? (
          <ChartEmpty label={t("home.utilityTrendEmpty")} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={utilityTrend} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="month" tick={chartTick} stroke={CHART.grid} />
                <YAxis width={56} tick={chartTick} stroke={CHART.grid} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(v: number) => fmtQar(v)}
                />
                <Line type="monotone" dataKey="cost" stroke={CHART.teal} strokeWidth={2} dot={{ r: 3, fill: CHART.ink }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
