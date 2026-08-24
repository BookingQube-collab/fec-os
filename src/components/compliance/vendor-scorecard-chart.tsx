"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  truncateAxisLabel,
} from "@/lib/chart-theme";

type VendorScorecardRow = {
  vendor: string;
  total_spend: number;
};

type VendorScorecardChartProps = {
  rows: VendorScorecardRow[];
};

export function VendorScorecardChart({ rows }: VendorScorecardChartProps) {
  return (
    <ChartCard title="Total spend by vendor" className="mb-4">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows.slice(0, 8)} margin={CHART_MARGIN}>
            <CartesianGrid {...chartGridProps} />
            <XAxis
              dataKey="vendor"
              tick={chartTick}
              stroke={CHART.grid}
              tickFormatter={(v) => truncateAxisLabel(String(v), 12)}
            />
            <YAxis tick={chartTick} stroke={CHART.grid} />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
            <Bar dataKey="total_spend" fill={CHART.ink} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
