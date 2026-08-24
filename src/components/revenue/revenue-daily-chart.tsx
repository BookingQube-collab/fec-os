"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import { fmtNumber, fmtQar } from "@/lib/currency";

type RevenueDailyChartProps = {
  series: Array<{ date: string; revenue: number }>;
};

export function RevenueDailyChart({ series }: RevenueDailyChartProps) {
  return (
    <ChartCard title="Daily revenue — last 30 days">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.gold} stopOpacity={0.45} />
                <stop offset="100%" stopColor={CHART.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="date" tick={chartTick} stroke={CHART.grid} />
            <YAxis
              tick={chartTick}
              stroke={CHART.grid}
              tickFormatter={(v) => fmtNumber(Number(v))}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              formatter={(v: number) => fmtQar(Number(v))}
            />
            <Area type="monotone" dataKey="revenue" stroke={CHART.ink} strokeWidth={2} fill="url(#rev)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
