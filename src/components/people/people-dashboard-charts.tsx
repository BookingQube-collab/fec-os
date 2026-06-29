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
  active: "#10B981",
  on_leave: "#F59E0B",
  terminated: "#EF4444",
};

const PIE_COLORS = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6"];

/** Pie slice labels overlap beyond this count; use a horizontal bar chart instead. */
const POSITION_PIE_MAX_SLICES = 6;

function positionBarChartHeight(count: number): number {
  return Math.min(400, Math.max(224, count * 28));
}

function truncateAxisLabel(label: string, maxLen = 16): string {
  return label.length > maxLen ? `${label.slice(0, maxLen - 1)}…` : label;
}

interface PeopleDashboardChartsProps {
  staffByLocation: Array<{ code: string; name: string; count: number }>;
  staffByJobTitle: Array<{ job_title: string; count: number }>;
  staffByDepartment: Array<{ department: string; count: number }>;
  staffByStatus: Array<{ status: string; count: number }>;
}

export function PeopleDashboardCharts({
  staffByLocation,
  staffByJobTitle,
  staffByDepartment,
  staffByStatus,
}: PeopleDashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">
      <ChartWidget title="Staff by location">
        <div className="h-56">
          {staffByLocation.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No staff in scope.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staffByLocation} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => [value, "Staff"]}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { code?: string; name?: string } | undefined;
                    return row?.name ? `${row.code} — ${row.name}` : String(_);
                  }}
                />
                <Bar dataKey="count" fill="#6366F1" name="Staff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>

      <ChartWidget title="Staff by position">
        {staffByJobTitle.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
            No position data.
          </div>
        ) : staffByJobTitle.length > POSITION_PIE_MAX_SLICES ? (
          <div
            className={staffByJobTitle.length > 8 ? "max-h-[26rem] overflow-y-auto pr-1" : undefined}
            style={{ height: positionBarChartHeight(staffByJobTitle.length) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={staffByJobTitle}
                layout="vertical"
                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="job_title"
                  tick={{ fontSize: 9 }}
                  width={108}
                  tickFormatter={(value) => truncateAxisLabel(String(value))}
                />
                <Tooltip
                  formatter={(value: number) => [value, "Staff"]}
                  labelFormatter={(label) => String(label)}
                />
                <Bar dataKey="count" name="Staff" radius={[0, 4, 4, 0]}>
                  {staffByJobTitle.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={staffByJobTitle}
                  dataKey="count"
                  nameKey="job_title"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={72}
                >
                  {staffByJobTitle.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartWidget>

      <ChartWidget title="Staff by activity / department">
        <div className="h-56">
          {staffByDepartment.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No department data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={staffByDepartment}
                layout="vertical"
                margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="department"
                  tick={{ fontSize: 9 }}
                  width={100}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" name="Staff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>

      <ChartWidget title="Staff by status">
        <div className="h-56">
          {staffByStatus.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No status data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={staffByStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={72}
                >
                  {staffByStatus.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#94A3B8"} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [value, name.replace(/_/g, " ")]} />
                <Legend
                  formatter={(value: string) => value.replace(/_/g, " ")}
                  wrapperStyle={{ fontSize: 10 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>
    </div>
  );
}
