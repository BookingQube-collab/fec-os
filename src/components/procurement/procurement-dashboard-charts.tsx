"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_PLOT,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  seriesColor,
  truncateAxisLabel,
} from "@/lib/chart-theme";
import { fmtNumber, fmtQar } from "@/lib/currency";
import type { PipelineKey, PrDashboardNamedAmount, PrDashboardPipelineStep } from "@/lib/procurement/dashboard";

function namedOrUnassigned(name: string, fallback: string): string {
  return !name || name === "—" ? fallback : name;
}

export function ProcurementDashboardCharts({
  pipeline,
  spendByDepartment,
  spendBySite,
  vendors,
}: {
  pipeline: PrDashboardPipelineStep[];
  spendByDepartment: PrDashboardNamedAmount[];
  spendBySite: PrDashboardNamedAmount[];
  vendors: PrDashboardNamedAmount[];
}) {
  const { t } = useTranslation();
  const noData = t("procurement.dashboard.noChartData");
  const unassigned = t("procurement.dashboard.unassigned");

  const pipelineData = pipeline
    .filter((row) => row.count > 0 || row.amount > 0)
    .map((row) => ({
      ...row,
      label: t(`procurement.dashboard.stages.${row.key}`),
    }));

  const radarData = pipeline.map((row) => ({
    key: row.key as PipelineKey,
    label: t(`procurement.dashboard.stages.${row.key}`),
    count: row.count,
  }));
  const hasRadar = radarData.some((row) => row.count > 0);

  const deptData = spendByDepartment.map((row) => ({
    ...row,
    label: namedOrUnassigned(row.name, unassigned),
  }));
  const siteData = spendBySite.map((row) => ({
    ...row,
    label: namedOrUnassigned(row.name, unassigned),
  }));
  const vendorData = vendors.map((row) => ({
    ...row,
    label: namedOrUnassigned(row.name, t("procurement.dashboard.noVendor")),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title={t("procurement.dashboard.pipelineTitle")} subtitle={t("procurement.dashboard.pipelineHint")}>
        {pipelineData.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pipelineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="prLiquidity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.gold} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHART.gold} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="label" tick={chartTick} stroke={CHART.grid} interval={0} />
                <YAxis
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(v) => `${fmtNumber(Number(v) / 1000)}K`}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [fmtQar(value), t("procurement.dashboard.amount")]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={CHART.ink}
                  strokeWidth={2}
                  fill="url(#prLiquidity)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title={t("procurement.dashboard.stageMix")} subtitle={t("procurement.dashboard.stageMixHint")}>
        {!hasRadar ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke={CHART.grid} />
                <PolarAngleAxis dataKey="label" tick={chartTick} />
                <PolarRadiusAxis tick={{ ...chartTick, fontSize: 9 }} stroke={CHART.grid} />
                <Radar dataKey="count" stroke={CHART.teal} fill={CHART.teal} fillOpacity={0.35} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [value, t("procurement.dashboard.count")]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title={t("procurement.dashboard.spendByDept")} subtitle={t("procurement.dashboard.spendByDeptHint")}>
        {deptData.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className={CHART_PLOT}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis type="number" tick={chartTick} stroke={CHART.grid} tickFormatter={(v) => fmtQar(Number(v))} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={88}
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(v) => truncateAxisLabel(String(v))}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [fmtQar(value), t("procurement.dashboard.amount")]}
                />
                <Bar dataKey="amount" fill={CHART.ink} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title={t("procurement.dashboard.concentrationTitle")}
        subtitle={t("procurement.dashboard.concentrationHint")}
      >
        {vendorData.length === 0 && siteData.length === 0 ? (
          <ChartEmpty label={noData} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <DonutBlock
              label={t("procurement.dashboard.vendorConcentration")}
              data={vendorData}
              empty={noData}
            />
            <DonutBlock
              label={t("procurement.dashboard.siteAllocation")}
              data={siteData.length ? siteData : []}
              empty={noData}
            />
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function DonutBlock({
  label,
  data,
  empty,
}: {
  label: string;
  data: Array<{ label: string; amount: number }>;
  empty: string;
}) {
  const { t } = useTranslation();
  if (!data.length) {
    return (
      <div>
        <p className="mb-2 text-center text-label">{label}</p>
        <ChartEmpty label={empty} />
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-center text-label">{label}</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="label" innerRadius={42} outerRadius={68} paddingAngle={2}>
              {data.map((row, i) => (
                <Cell key={row.label} fill={seriesColor(i)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              formatter={(value: number) => [fmtQar(value), t("procurement.dashboard.amount")]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
