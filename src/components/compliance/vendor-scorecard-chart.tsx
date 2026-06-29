"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type VendorScorecardRow = {
  vendor: string;
  total_spend: number;
};

type VendorScorecardChartProps = {
  rows: VendorScorecardRow[];
};

export function VendorScorecardChart({ rows }: VendorScorecardChartProps) {
  return (
    <div className="mb-4 h-56 rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-medium">Total spend by vendor</h3>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={rows.slice(0, 8)}>
          <XAxis dataKey="vendor" tick={{ fontSize: 9 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="total_spend" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
