"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PIE_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#94a3b8"];

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
      <div className="h-64 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">Status distribution</h3>
        <ResponsiveContainer width="100%" height="90%">
          <PieChart>
            <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
              {statusData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">Items by domain</h3>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={byDomain}>
            <XAxis dataKey="domain" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="total" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
