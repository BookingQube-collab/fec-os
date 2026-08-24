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

import { ChartCard } from "@/components/charts/chart-card";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import { E3_STATUS_COLORS } from "@/lib/compliance-tracker/constants";

const STATUS_ORDER = ["Compliant", "Upcoming", "Warning", "Critical", "Overdue", "Missing"] as const;

const PIE_COLORS: Record<string, string> = {
  Compliant: E3_STATUS_COLORS.Compliant.bg,
  Upcoming: E3_STATUS_COLORS.Upcoming.bg,
  Warning: E3_STATUS_COLORS.Warning.bg,
  Critical: E3_STATUS_COLORS.Critical.bg,
  Overdue: E3_STATUS_COLORS.Overdue.bg,
  Missing: E3_STATUS_COLORS.Missing.bg,
};

interface E3TrackerDashboardChartsProps {
  statusByLocation: Record<string, string | number>[];
  statusPie: { status: string; count: number }[];
  categoryChart: { category: string; count: number }[];
}

export function E3TrackerDashboardCharts({
  statusByLocation,
  statusPie,
  categoryChart,
}: E3TrackerDashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <ChartCard title="Status by Location">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusByLocation} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="location" tick={chartTick} stroke={CHART.grid} />
              <YAxis allowDecimals={false} tick={chartTick} stroke={CHART.grid} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Legend wrapperStyle={chartLegendStyle} />
              {STATUS_ORDER.map((status) => (
                <Bar key={status} dataKey={status} stackId="a" fill={PIE_COLORS[status]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Status Distribution">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusPie} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {statusPie.map((entry) => (
                  <Cell key={entry.status} fill={PIE_COLORS[entry.status] ?? CHART.muted} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Legend wrapperStyle={chartLegendStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Items by Category">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryChart} layout="vertical" margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis type="number" allowDecimals={false} tick={chartTick} stroke={CHART.grid} />
              <YAxis type="category" dataKey="category" width={120} tick={chartTick} stroke={CHART.grid} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="count" fill={CHART.ink} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

export { STATUS_ORDER, PIE_COLORS };
