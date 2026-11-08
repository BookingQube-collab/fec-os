"use client";

/* Hallmark · redesign · app dashboard · mockup-faithful Event Attendance
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple)
 * design-system: FEC People/HR · designed-as-app
 */

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { ChartEmpty } from "@/components/charts/chart-card";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  CHART_FONT,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  truncateAxisLabel,
} from "@/lib/chart-theme";
import type {
  DayTrendPoint,
  EventBarPoint,
} from "@/lib/people-event-attendance-overview";
import { cn } from "@/lib/utils";

const EA = {
  purple: "#7c3aed",
  lavender: "#ddd6fe",
  green: "#16a34a",
  orange: "#f59e0b",
  red: "#ef4444",
  muted: "#6b7280",
  grid: "#e5e7eb",
  card: "#ffffff",
  ink: "#111827",
} as const;

const tooltipStyle = {
  ...chartTooltipStyle,
  border: `1px solid ${EA.grid}`,
  color: EA.ink,
};

function Panel({
  title,
  children,
  className,
  headerRight,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
        {headerRight}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function BarTopLabel(props: Record<string, unknown>) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const point = props.payload as EventBarPoint | undefined;
  if (!point) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={EA.ink}
      textAnchor="middle"
      fontSize={11}
      fontFamily={CHART_FONT}
      fontWeight={600}
    >
      {`${point.present}/${point.assigned}`}
      <tspan fill={EA.muted} fontWeight={500}>{`  ${point.pct}%`}</tspan>
    </text>
  );
}

export function PeopleEventWorkforceCharts({
  attendanceByEvent,
  attendanceTrend,
  status,
  avgAttendancePct,
}: {
  attendanceByEvent: EventBarPoint[];
  attendanceTrend: DayTrendPoint[];
  status: { present: number; late: number; absent: number; assigned: number };
  avgAttendancePct: number;
}) {
  const { t } = useTranslation();
  const empty = t("peopleEvent.dashboard.chartsEmpty");
  const reducedMotion = usePrefersReducedMotion();

  const donutData = [
    { key: "present", name: t("peopleEvent.dashboard.statusPresent"), value: status.present, fill: EA.green },
    { key: "late", name: t("peopleEvent.dashboard.statusLate"), value: status.late, fill: EA.orange },
    { key: "absent", name: t("peopleEvent.dashboard.statusAbsent"), value: status.absent, fill: EA.red },
  ].filter((s) => s.value > 0);

  const statusLegend = [
    {
      key: "present",
      label: t("peopleEvent.dashboard.statusPresent"),
      count: status.present,
      pct: status.assigned ? Math.round((status.present / status.assigned) * 1000) / 10 : 0,
      color: EA.green,
    },
    {
      key: "late",
      label: t("peopleEvent.dashboard.statusLate"),
      count: status.late,
      pct: status.assigned ? Math.round((status.late / status.assigned) * 1000) / 10 : 0,
      color: EA.orange,
    },
    {
      key: "absent",
      label: t("peopleEvent.dashboard.statusAbsent"),
      count: status.absent,
      pct: status.assigned ? Math.round((status.absent / status.assigned) * 1000) / 10 : 0,
      color: EA.red,
    },
  ];

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-12">
      <Panel
        className="xl:col-span-5"
        title={t("peopleEvent.dashboard.chartAttendanceByEvent")}
      >
        {attendanceByEvent.length === 0 ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className="h-64 min-w-0 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={attendanceByEvent}
                margin={{ ...CHART_MARGIN, top: 28 }}
                barCategoryGap="28%"
              >
                <CartesianGrid {...chartGridProps} stroke={EA.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={chartTick}
                  stroke={EA.grid}
                  interval={0}
                  tickFormatter={(value) => truncateAxisLabel(String(value), 12)}
                />
                <YAxis tick={chartTick} stroke={EA.grid} allowDecimals={false} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number, name: string) => [
                    value,
                    name === "present"
                      ? t("peopleEvent.dashboard.seriesPresent")
                      : t("peopleEvent.dashboard.seriesAssigned"),
                  ]}
                />
                <Bar
                  dataKey="assigned"
                  name="assigned"
                  fill={EA.lavender}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={!reducedMotion}
                />
                <Bar
                  dataKey="present"
                  name="present"
                  fill={EA.purple}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={!reducedMotion}
                >
                  <LabelList content={BarTopLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        className="xl:col-span-4"
        title={t("peopleEvent.dashboard.chartAttendanceTrends")}
        headerRight={
          <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-[#7c3aed]">
            {t("peopleEvent.dashboard.avgAttendance", { pct: avgAttendancePct })}
          </span>
        }
      >
        {attendanceTrend.every((d) => d.assigned === 0) ? (
          <ChartEmpty label={empty} />
        ) : (
          <div className="h-64 min-w-0 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceTrend} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="eaTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={EA.purple} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={EA.purple} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartGridProps} stroke={EA.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={chartTick}
                  stroke={EA.grid}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={chartTick}
                  stroke={EA.grid}
                  domain={[0, 100]}
                  width={36}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [`${value}%`, t("peopleEvent.dashboard.seriesAttendancePct")]}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke={EA.purple}
                  strokeWidth={2.5}
                  fill="url(#eaTrendFill)"
                  dot={{ r: 4, fill: EA.purple, stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={!reducedMotion}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        className="xl:col-span-3"
        title={t("peopleEvent.dashboard.chartAttendanceStatus")}
      >
        {status.assigned === 0 ? (
          <ChartEmpty label={empty} className="h-56" />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center xl:flex-col">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={72}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={!reducedMotion}
                  >
                    {donutData.map((slice) => (
                      <Cell key={slice.key} fill={slice.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-bold tracking-tight text-foreground">
                  {status.assigned}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("peopleEvent.dashboard.donutAssigned")}
                </span>
              </div>
            </div>
            <ul className="w-full min-w-0 space-y-2.5">
              {statusLegend.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: item.color }}
                      aria-hidden
                    />
                    <span className="truncate text-muted-foreground">{item.label}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {item.count}
                    <span className="ms-1 font-medium text-muted-foreground">({item.pct}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
