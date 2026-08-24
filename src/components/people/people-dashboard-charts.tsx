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
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { ChartWidget } from "@/components/dashboard/chart-widget";
import {
  CHART,
  CHART_MARGIN,
  CHART_PLOT,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  seriesColor,
  truncateAxisLabel,
} from "@/lib/chart-theme";
import { fmtNumber, fmtQar } from "@/lib/currency";
import type { PeopleDashboardSalaryLocation } from "@/lib/queries/people-dashboard.core";

const STATUS_COLORS: Record<string, string> = {
  active: CHART.teal,
  on_leave: CHART.amber,
  terminated: CHART.red,
};

/** Pie slice labels overlap beyond this count; use a horizontal bar chart instead. */
const POSITION_PIE_MAX_SLICES = 6;

function positionBarChartHeight(count: number): number {
  return Math.min(400, Math.max(224, count * 28));
}

interface PeopleDashboardChartsProps {
  staffByLocation: Array<{ code: string; name: string; count: number }>;
  staffByJobTitle: Array<{ job_title: string; count: number }>;
  staffByDepartment: Array<{ department: string; count: number }>;
  staffByStatus: Array<{ status: string; count: number }>;
}

export function SalaryByLocationChart({
  rows,
}: {
  rows: PeopleDashboardSalaryLocation[];
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t("people.dashboard.salaryByLocation")} subtitle={t("people.dashboard.salaryNote")}>
      {rows.length === 0 ? (
        <ChartEmpty label={t("people.staff.empty")} />
      ) : (
        <div className={CHART_PLOT}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="code" tick={chartTick} stroke={CHART.grid} />
              <YAxis
                tick={chartTick}
                stroke={CHART.grid}
                tickFormatter={(value) => fmtNumber(Number(value))}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipLabelStyle}
                formatter={(value: number) => [fmtQar(value), t("people.dashboard.monthlyQar")]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { code?: string; name?: string } | undefined;
                  return row?.name ? `${row.code} — ${row.name}` : String(_);
                }}
              />
              <Bar dataKey="monthly_salary_qar" fill={CHART.teal} name={t("people.dashboard.monthlyQar")} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
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
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No staff in scope.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staffByLocation} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="code" tick={chartTick} stroke={CHART.grid} />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [value, "Staff"]}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { code?: string; name?: string } | undefined;
                    return row?.name ? `${row.code} — ${row.name}` : String(_);
                  }}
                />
                <Bar dataKey="count" fill={CHART.ink} name="Staff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>

      <ChartWidget title="Staff by position">
        {staffByJobTitle.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
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
                <CartesianGrid {...chartGridProps} />
                <XAxis type="number" tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="job_title"
                  tick={chartTick}
                  stroke={CHART.grid}
                  width={108}
                  tickFormatter={(value) => truncateAxisLabel(String(value))}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [value, "Staff"]}
                  labelFormatter={(label) => String(label)}
                />
                <Bar dataKey="count" name="Staff" radius={[0, 4, 4, 0]}>
                  {staffByJobTitle.map((_, i) => (
                    <Cell key={i} fill={seriesColor(i)} />
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
                    <Cell key={i} fill={seriesColor(i)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Legend wrapperStyle={chartLegendStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartWidget>

      <ChartWidget title="Staff by activity / department">
        <div className="h-56">
          {staffByDepartment.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No department data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={staffByDepartment}
                layout="vertical"
                margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid {...chartGridProps} />
                <XAxis type="number" tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="department"
                  tick={chartTick}
                  stroke={CHART.grid}
                  width={100}
                />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar dataKey="count" fill={CHART.gold} name="Staff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>

      <ChartWidget title="Staff by status">
        <div className="h-56">
          {staffByStatus.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? CHART.muted} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number, name: string) => [value, name.replace(/_/g, " ")]}
                />
                <Legend
                  formatter={(value: string) => value.replace(/_/g, " ")}
                  wrapperStyle={chartLegendStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartWidget>
    </div>
  );
}
