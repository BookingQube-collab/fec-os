"use client";

/* Hallmark · redesign · app dashboard · preserve FEC People/HR tokens
 * macrostructure: Stat-Led workbench · tone: utilitarian ops · enrichment: none
 */

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
  CHART,
  CHART_MARGIN,
  CHART_PLOT,
  chartBarRadius,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  seriesColor,
  truncateAxisLabel,
} from "@/lib/chart-theme";

export type NamedCount = { key: string; label: string; count: number };
export type DayCount = { date: string; label: string; count: number };

function CountBars({
  rows,
  seriesName,
}: {
  rows: NamedCount[];
  seriesName: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            dataKey="label"
            tick={chartTick}
            stroke={CHART.grid}
            interval={0}
            tickFormatter={(value) => truncateAxisLabel(String(value), 14)}
          />
          <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
          <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
          <Bar
            dataKey="count"
            name={seriesName}
            radius={chartBarRadius}
            maxBarSize={48}
            isAnimationActive={!reducedMotion}
          >
            {rows.map((row, index) => (
              <Cell key={row.key} fill={seriesColor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PeopleEventWorkforceCharts({
  crewByType,
  attendanceByStatus,
  attendanceByDay,
  crewByEvent,
  payrollByStatus,
  showCrew,
  showAttendance,
  showPayroll,
}: {
  crewByType: NamedCount[];
  attendanceByStatus: NamedCount[];
  attendanceByDay: DayCount[];
  crewByEvent: NamedCount[];
  payrollByStatus: NamedCount[];
  showCrew: boolean;
  showAttendance: boolean;
  showPayroll: boolean;
}) {
  const { t } = useTranslation();
  const empty = t("peopleEvent.dashboard.chartsEmpty");
  const reducedMotion = usePrefersReducedMotion();

  const cards: Array<{ key: string; node: ReactNode }> = [];

  if (showCrew) {
    cards.push({
      key: "crew-type",
      node: (
        <ChartCard
          title={t("peopleEvent.dashboard.chartCrewByType")}
          subtitle={t("peopleEvent.dashboard.chartCrewByTypeHint")}
        >
          {crewByType.length === 0 ? (
            <ChartEmpty label={empty} />
          ) : (
            <CountBars rows={crewByType} seriesName={t("peopleEvent.dashboard.seriesAssignments")} />
          )}
        </ChartCard>
      ),
    });
    cards.push({
      key: "crew-event",
      node: (
        <ChartCard
          title={t("peopleEvent.dashboard.chartCrewByEvent")}
          subtitle={t("peopleEvent.dashboard.chartCrewByEventHint")}
        >
          {crewByEvent.length === 0 ? (
            <ChartEmpty label={empty} />
          ) : (
            <CountBars rows={crewByEvent} seriesName={t("peopleEvent.dashboard.seriesAssignments")} />
          )}
        </ChartCard>
      ),
    });
  }

  if (showAttendance) {
    cards.push({
      key: "att-status",
      node: (
        <ChartCard
          title={t("peopleEvent.dashboard.chartAttendanceStatus")}
          subtitle={t("peopleEvent.dashboard.chartAttendanceStatusHint")}
        >
          {attendanceByStatus.length === 0 ? (
            <ChartEmpty label={empty} />
          ) : (
            <CountBars
              rows={attendanceByStatus}
              seriesName={t("peopleEvent.dashboard.seriesDays")}
            />
          )}
        </ChartCard>
      ),
    });
    cards.push({
      key: "att-day",
      node: (
        <ChartCard
          title={t("peopleEvent.dashboard.chartAttendanceTrend")}
          subtitle={t("peopleEvent.dashboard.chartAttendanceTrendHint")}
        >
          {attendanceByDay.length === 0 ? (
            <ChartEmpty label={empty} />
          ) : (
            <div className={`${CHART_PLOT} min-w-0 overflow-hidden`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={attendanceByDay} margin={CHART_MARGIN}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis
                    dataKey="label"
                    tick={chartTick}
                    stroke={CHART.grid}
                    interval="preserveStartEnd"
                    tickFormatter={(value) => truncateAxisLabel(String(value), 10)}
                  />
                  <YAxis tick={chartTick} stroke={CHART.grid} allowDecimals={false} width={36} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                  <Legend wrapperStyle={chartLegendStyle} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name={t("peopleEvent.dashboard.seriesDays")}
                    stroke={CHART.gold}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={!reducedMotion}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      ),
    });
  }

  if (showPayroll) {
    cards.push({
      key: "pay-status",
      node: (
        <ChartCard
          title={t("peopleEvent.dashboard.chartPayrollStatus")}
          subtitle={t("peopleEvent.dashboard.chartPayrollStatusHint")}
        >
          {payrollByStatus.length === 0 ? (
            <ChartEmpty label={empty} />
          ) : (
            <CountBars
              rows={payrollByStatus}
              seriesName={t("peopleEvent.dashboard.seriesPeriods")}
            />
          )}
        </ChartCard>
      ),
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {cards.map((card) => (
        <div key={card.key} className="min-w-0">
          {card.node}
        </div>
      ))}
    </div>
  );
}
