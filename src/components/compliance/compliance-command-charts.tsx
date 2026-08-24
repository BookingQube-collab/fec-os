"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  seriesColor,
  truncateAxisLabel,
} from "@/lib/chart-theme";

type StatusDatum = { name: string; value: number };

type DomainDatum = {
  domain: string;
  total: number;
};

type ComplianceCommandChartsProps = {
  statusData: StatusDatum[];
  byDomain: DomainDatum[];
};

export function ComplianceCommandCharts({ statusData, byDomain }: ComplianceCommandChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Status distribution">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                {statusData.map((_, i) => (
                  <Cell key={i} fill={seriesColor(i)} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard title="Items by domain">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDomain} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis
                dataKey="domain"
                tick={chartTick}
                stroke={CHART.grid}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={60}
                tickFormatter={(v) => truncateAxisLabel(String(v), 12)}
              />
              <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="total" fill={CHART.ink} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
