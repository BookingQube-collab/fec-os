"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";

type TrendMonth = {
  month: number | string;
  renewals_due: number;
  services_completed: number;
  renewal_cost: number;
};

type ComplianceTrendChartsProps = {
  months: TrendMonth[];
};

export function ComplianceTrendCharts({ months }: ComplianceTrendChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Due vs completed">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={months} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="month" tick={chartTick} stroke={CHART.grid} />
              <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Line type="monotone" dataKey="renewals_due" stroke={CHART.amber} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="services_completed" stroke={CHART.teal} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard title="Renewal cost by month">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="month" tick={chartTick} stroke={CHART.grid} />
              <YAxis tick={chartTick} stroke={CHART.grid} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="renewal_cost" fill={CHART.ink} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
