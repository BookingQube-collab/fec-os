"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartWidget } from "@/components/dashboard/chart-widget";
import { fmtQar } from "@/lib/currency";

export function HomeWoTrendChart({
  data,
}: {
  data: Array<{ month: string; renewals: number; completed: number }>;
}) {
  return (
    <ChartWidget title="Monthly work orders & renewals" menuItems={[{ label: "View maintenance" }, { label: "Export report" }]}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
            <Tooltip />
            <Bar dataKey="renewals" fill="#8B5CF6" radius={[8, 8, 0, 0]} name="Renewals due" />
            <Bar dataKey="completed" fill="#3B82F6" radius={[8, 8, 0, 0]} name="Services done" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWidget>
  );
}

export function HomeBottomCharts({
  siteIssueChart,
  utilityTrend,
}: {
  siteIssueChart: Array<{ site: string; issues: number; critical: number }>;
  utilityTrend: Array<{ month: string; cost: number }>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartWidget title="Site-wise open issues">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={siteIssueChart} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis type="category" dataKey="site" width={56} tick={{ fontSize: 11, fill: "#6B7280" }} />
              <Tooltip />
              <Bar dataKey="issues" fill="#6366F1" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>

      <ChartWidget title="Utility cost trend">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={utilityTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0FF" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip formatter={(v: number) => fmtQar(v)} />
              <Line type="monotone" dataKey="cost" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>
    </div>
  );
}
