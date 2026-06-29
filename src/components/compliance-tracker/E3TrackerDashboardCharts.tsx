"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={statusByLocation}>
            <XAxis dataKey="location" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            {STATUS_ORDER.map((status) => (
              <Bar key={status} dataKey={status} stackId="a" fill={PIE_COLORS[status]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Status Distribution">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={statusPie} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
              {statusPie.map((entry) => (
                <Cell key={entry.status} fill={PIE_COLORS[entry.status] ?? "#94A3B8"} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Items by Category">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={categoryChart} layout="vertical">
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#0B1F3A" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <h3 className="font-display mb-2 text-base font-semibold text-[#0B1F3A]">{title}</h3>
      {children}
    </div>
  );
}

export { STATUS_ORDER, PIE_COLORS };
