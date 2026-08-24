"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  truncateAxisLabel,
} from "@/lib/chart-theme";
import { fmtQar } from "@/lib/currency";

export type SpendChartRow = {
  label: string;
  budget: number;
  spent: number;
  committed: number;
};

export function EventSpendChart({ rows }: { rows: SpendChartRow[] }) {
  const { t } = useTranslation();
  const data = rows.filter((row) => row.budget > 0 || row.spent > 0 || row.committed > 0);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("events.budget.spendChartEmpty")}</p>;
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            dataKey="label"
            tick={chartTick}
            stroke={CHART.grid}
            interval={0}
            tickFormatter={(v) => truncateAxisLabel(String(v), 12)}
          />
          <YAxis tick={chartTick} stroke={CHART.grid} tickFormatter={(v) => fmtQar(Number(v))} width={72} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            formatter={(value: number, name: string) => [fmtQar(value), name]}
          />
          <Legend wrapperStyle={chartLegendStyle} />
          <Bar dataKey="budget" name={t("events.budget.spendChartBudget")} fill={CHART.ink} radius={[4, 4, 0, 0]} />
          <Bar dataKey="spent" name={t("events.budget.spendChartSpent")} fill={CHART.amber} radius={[4, 4, 0, 0]} />
          <Bar dataKey="committed" name={t("events.budget.spendChartCommitted")} fill={CHART.teal} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
