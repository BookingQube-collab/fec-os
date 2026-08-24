"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import type { EventMarginPoint } from "@/lib/events/types";

export function EventMarginChart({ points }: { points: EventMarginPoint[] }) {
  const { t } = useTranslation();
  const data = points
    .filter((p) => p.marginPct != null)
    .map((p) => ({
      label: t(`events.budget.trend.${p.key}`, { defaultValue: p.key }),
      margin: Number(p.marginPct?.toFixed(1)),
    }));

  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">{t("events.budget.trendEmpty")}</p>;
  }

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="label" tick={chartTick} stroke={CHART.grid} />
          <YAxis tick={chartTick} stroke={CHART.grid} unit="%" width={40} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            formatter={(value) => [`${value}%`, t("events.budget.margin")]}
          />
          <Line type="monotone" dataKey="margin" stroke={CHART.teal} strokeWidth={2} dot={{ r: 3, fill: CHART.ink }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
