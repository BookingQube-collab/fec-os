"use client";

import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
      <div className="h-64 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">Due vs completed</h3>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={months}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="renewals_due" stroke="#f59e0b" />
            <Line type="monotone" dataKey="services_completed" stroke="#22c55e" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">Renewal cost by month</h3>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={months}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="renewal_cost" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
