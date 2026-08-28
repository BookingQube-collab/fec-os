"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTranslation } from "react-i18next";

import { ChartWidget } from "@/components/dashboard/chart-widget";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  truncateAxisLabel,
} from "@/lib/chart-theme";
import { formatLocationLabel } from "@/lib/locations/normalize";

const STATUS_COLORS: Record<string, string> = {
  ok: CHART.teal,
  low: CHART.amber,
  out: CHART.red,
};

interface InventoryDashboardChartsProps {
  stockByLocation: Array<{ code: string; name?: string; units: number }>;
  stockBySize: Array<{ size: string; units: number }>;
  stockByStatus: Array<{ status: string; count: number }>;
}

export function InventoryDashboardCharts({
  stockByLocation,
  stockBySize,
  stockByStatus,
}: InventoryDashboardChartsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <ChartWidget title={t("inventory.charts.byBranch")}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stockByLocation.map((row) => ({ ...row, label: formatLocationLabel(row.code, row.name) }))}
              margin={CHART_MARGIN}
            >
              <CartesianGrid {...chartGridProps} />
              <XAxis
                dataKey="label"
                tick={chartTick}
                stroke={CHART.grid}
                interval={0}
                tickFormatter={(value) => truncateAxisLabel(String(value), 18)}
              />
              <YAxis tick={chartTick} stroke={CHART.grid} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="units" fill={CHART.ink} name={t("inventory.charts.units")} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title={t("inventory.charts.bySize")}>
        <div className="h-56">
          {stockBySize.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("inventory.charts.noSized")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockBySize} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="size" tick={chartTick} stroke={CHART.grid} />
                <YAxis tick={chartTick} stroke={CHART.grid} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar dataKey="units" fill={CHART.gold} name={t("inventory.charts.pairs")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>

      <ChartWidget title={t("inventory.charts.health")}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stockByStatus.filter((s) => s.count > 0).map((s) => ({
                  ...s,
                  label: t(`inventory.status.${s.status}`, { defaultValue: s.status }),
                }))}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ label, count }) => `${label} (${count})`}
              >
                {stockByStatus.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? CHART.muted} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Legend wrapperStyle={chartLegendStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>
    </div>
  );
}
