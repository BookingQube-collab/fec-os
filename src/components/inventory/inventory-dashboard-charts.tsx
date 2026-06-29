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

import { ChartWidget } from "@/components/dashboard/chart-widget";

const STATUS_COLORS: Record<string, string> = {
  ok: "#10B981",
  low: "#F59E0B",
  out: "#EF4444",
};

interface InventoryDashboardChartsProps {
  stockByLocation: Array<{ code: string; units: number }>;
  stockBySize: Array<{ size: string; units: number }>;
  stockByStatus: Array<{ status: string; count: number }>;
}

export function InventoryDashboardCharts({
  stockByLocation,
  stockBySize,
  stockByStatus,
}: InventoryDashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <ChartWidget title="Units on hand by branch">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stockByLocation} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="code" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="units" fill="#6366F1" name="Units" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Grip socks by size">
        <div className="h-56">
          {stockBySize.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No sized sock stock in scope.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockBySize} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="size" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="units" fill="#3B82F6" name="Pairs" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>

      <ChartWidget title="Stock health">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stockByStatus.filter((s) => s.count > 0)}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ status, count }) => `${status} (${count})`}
              >
                {stockByStatus.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94A3B8"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>
    </div>
  );
}
