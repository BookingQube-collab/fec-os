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

const STATUS_COLORS: Record<string, string> = {
  planned: "#6366F1",
  in_progress: "#3B82F6",
  on_hold: "#F59E0B",
  completed: "#10B981",
  cancelled: "#94A3B8",
};

const CRIT_COLORS: Record<string, string> = {
  low: "#94A3B8",
  medium: "#3B82F6",
  high: "#F59E0B",
  critical: "#EF4444",
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
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94A3B8"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Work orders by kind">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workOrdersByKind}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
              <XAxis dataKey="kind" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366F1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Assets by criticality">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assetsByCriticality} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis
                type="category"
                dataKey="criticality"
                width={72}
                tick={{ fontSize: 11, fill: "#6B7280" }}
              />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                {assetsByCriticality.map((entry) => (
                  <Cell key={entry.criticality} fill={CRIT_COLORS[entry.criticality] ?? "#94A3B8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Top asset categories">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assetsByCategory} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis
                type="category"
                dataKey="category"
                width={100}
                tick={{ fontSize: 10, fill: "#6B7280" }}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#8B5CF6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Work order trend (8 weeks)" className="lg:col-span-2">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={workOrdersTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="created"
                stroke="#6366F1"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Created"
              />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#10B981"
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
              <BarChart data={downtimeByLocation}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
                <XAxis dataKey="code" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <Tooltip formatter={(v: number, name: string) => [v, name === "hours" ? "Hours" : "Events"]} />
                <Legend />
                <Bar dataKey="hours" fill="#EF4444" radius={[8, 8, 0, 0]} name="Hours" />
                <Bar dataKey="events" fill="#F59E0B" radius={[8, 8, 0, 0]} name="Events" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidget>
      )}
    </div>
  );
}
