"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  buildApprovedHistoryByDepartment,
  buildApprovedHistoryByLocation,
  buildApprovedHistoryByStatus,
  buildApprovedHistoryVolumeByDay,
  type ApprovedHistoryRowLike,
} from "@/lib/attendance-hr/missed-punch-approved-history";
import {
  CHART,
  CHART_MARGIN,
  CHART_PLOT,
  chartBarRadius,
  chartBarRadiusH,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  seriesColor,
  truncateAxisLabel,
} from "@/lib/chart-theme";

const STATUS_COLORS: Record<string, string> = {
  approved: CHART.teal,
  in_progress: CHART.amber,
};

function formatDayTick(ymd: string): string {
  const [, month, day] = ymd.split("-");
  return `${day}/${month}`;
}

export function MissedPunchApprovedHistoryCharts({
  rows,
  locationLabel,
}: {
  rows: readonly ApprovedHistoryRowLike[];
  locationLabel: (locationId: string) => string;
}) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const empty = t("hr.me.approvedHistory.chartsEmpty");

  const volume = buildApprovedHistoryVolumeByDay(rows);
  const byDepartment = buildApprovedHistoryByDepartment(
    rows,
    t("hr.me.approvedHistory.unassignedDept"),
  );
  const byLocation = buildApprovedHistoryByLocation(rows, locationLabel);
  const byStatus = buildApprovedHistoryByStatus(rows, {
    approved: t("hr.me.punchApproved"),
    inProgress: t("hr.me.approvedHistory.statusInProgress"),
  });

  const hasVolume = volume.some((point) => point.count > 0);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        className="min-w-0 overflow-hidden xl:col-span-2"
        title={t("hr.me.approvedHistory.volumeTitle")}
        subtitle={t("hr.me.approvedHistory.volumeHint")}
      >
        {!hasVolume ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis
                  dataKey="date"
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={formatDayTick}
                  minTickGap={24}
                />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  labelFormatter={(value) => String(value)}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name={t("hr.me.approvedHistory.approvedCount")}
                  stroke={CHART.ink}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reducedMotion}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        className="min-w-0 overflow-hidden"
        title={t("hr.me.approvedHistory.byLocationTitle")}
        subtitle={t("hr.me.approvedHistory.byLocationHint")}
      >
        {byLocation.length === 0 ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byLocation.slice(0, 8)}
                layout="vertical"
                margin={{ ...CHART_MARGIN, left: 8 }}
              >
                <CartesianGrid {...chartGridProps} horizontal={false} />
                <XAxis type="number" tick={chartTick} stroke={CHART.grid} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(value) => truncateAxisLabel(String(value), 16)}
                />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar
                  dataKey="count"
                  name={t("hr.me.approvedHistory.approvedCount")}
                  radius={chartBarRadiusH}
                  isAnimationActive={!reducedMotion}
                >
                  {byLocation.slice(0, 8).map((row, index) => (
                    <Cell key={row.key} fill={seriesColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        className="min-w-0 overflow-hidden"
        title={t("hr.me.approvedHistory.byDepartmentTitle")}
        subtitle={t("hr.me.approvedHistory.byDepartmentHint")}
      >
        {byDepartment.length === 0 ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDepartment.slice(0, 8)} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis
                  dataKey="name"
                  tick={chartTick}
                  stroke={CHART.grid}
                  interval={0}
                  tickFormatter={(value) => truncateAxisLabel(String(value), 12)}
                />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar
                  dataKey="count"
                  name={t("hr.me.approvedHistory.approvedCount")}
                  fill={CHART.teal}
                  radius={chartBarRadius}
                  isAnimationActive={!reducedMotion}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        className="min-w-0 overflow-hidden xl:col-span-2"
        title={t("hr.me.approvedHistory.byStatusTitle")}
        subtitle={t("hr.me.approvedHistory.byStatusHint")}
      >
        {byStatus.length === 0 ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="name" tick={chartTick} stroke={CHART.grid} />
                <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                <Bar
                  dataKey="count"
                  name={t("hr.me.approvedHistory.approvedCount")}
                  radius={chartBarRadius}
                  isAnimationActive={!reducedMotion}
                >
                  {byStatus.map((row) => (
                    <Cell key={row.key} fill={STATUS_COLORS[row.key] ?? CHART.ink} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
