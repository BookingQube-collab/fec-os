"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartWidget } from "@/components/dashboard/chart-widget";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";

const STATUS_COLORS: Record<string, string> = {
  planned: CHART.info,
  in_progress: CHART.gold,
  on_hold: CHART.amber,
  completed: CHART.teal,
  cancelled: CHART.muted,
};

const CRIT_COLORS: Record<string, string> = {
  low: CHART.muted,
  medium: CHART.info,
  high: CHART.amber,
  critical: CHART.red,
};

interface MaintenanceDashboardChartsProps {
  workOrdersByStatus: Array<{ status: string; count: number }>;
  workOrdersByKind: Array<{ kind: string; count: number }>;
  assetsByCriticality: Array<{ criticality: string; count: number }>;
  assetsByCategory: Array<{ category: string; count: number }>;
  workOrdersTrend: Array<{ week: string; created: number; completed: number }>;
  downtimeByLocation: Array<{ code: string; hours: number; events: number }>;
}

export function MaintenanceDashboardCharts({
  workOrdersByStatus,
  workOrdersByKind,
  assetsByCriticality,
  assetsByCategory,
  workOrdersTrend,
  downtimeByLocation,
}: MaintenanceDashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <ChartWidget title="Open work orders by status">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={workOrdersByStatus}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ status, count }) => `${status} (${count})`}
              >
                {workOrdersByStatus.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? CHART.muted} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Work orders by kind">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workOrdersByKind} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="kind" tick={chartTick} stroke={CHART.grid} />
              <YAxis allowDecimals={false} tick={chartTick} stroke={CHART.grid} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="count" fill={CHART.ink} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Assets by criticality">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assetsByCriticality} layout="vertical" margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis type="number" allowDecimals={false} tick={chartTick} stroke={CHART.grid} />
              <YAxis
                type="category"
                dataKey="criticality"
                width={72}
                tick={chartTick}
                stroke={CHART.grid}
              />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                {assetsByCriticality.map((entry) => (
                  <Cell key={entry.criticality} fill={CRIT_COLORS[entry.criticality] ?? CHART.muted} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Top asset categories">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assetsByCategory} layout="vertical" margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis type="number" allowDecimals={false} tick={chartTick} stroke={CHART.grid} />
              <YAxis
                type="category"
                dataKey="category"
                width={100}
                tick={chartTick}
                stroke={CHART.grid}
              />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Bar dataKey="count" fill={CHART.gold} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Work order trend (8 weeks)" className="lg:col-span-2">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={workOrdersTrend} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="week" tick={chartTick} stroke={CHART.grid} />
              <YAxis allowDecimals={false} tick={chartTick} stroke={CHART.grid} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
              <Legend wrapperStyle={chartLegendStyle} />
              <Line
                type="monotone"
                dataKey="created"
                stroke={CHART.ink}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Created"
              />
              <Line
                type="monotone"
                dataKey="completed"
                stroke={CHART.teal}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Completed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      {downtimeByLocation.length > 0 && (
        <ChartWidget title="Downtime by location (this month)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={downtimeByLocation} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="code" tick={chartTick} stroke={CHART.grid} />
                <YAxis tick={chartTick} stroke={CHART.grid} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(v: number, name: string) => [v, name === "hours" ? "Hours" : "Events"]}
                />
                <Legend wrapperStyle={chartLegendStyle} />
                <Bar dataKey="hours" fill={CHART.red} radius={[8, 8, 0, 0]} name="Hours" />
                <Bar dataKey="events" fill={CHART.amber} radius={[8, 8, 0, 0]} name="Events" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidget>
      )}
    </div>
  );
}
