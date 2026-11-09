"use client";

/* Hallmark · redesign · Event Attendance charts · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · records tab)
 * Note: LabelList content uses LabelProps — never Record<string, unknown>.
 */

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import type { DayTrendPoint } from "@/lib/people-event-attendance-display";
import { cn } from "@/lib/utils";

const EA = {
  purple: "#7c3aed",
  green: "#16a34a",
  orange: "#f59e0b",
  red: "#ef4444",
  muted: "#6b7280",
  grid: "#e5e7eb",
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

export function EventAttendanceCharts({
  status,
  attendanceTrend,
  avgAttendancePct,
}: {
  status: { complete: number; late: number; missing: number; total: number };
  attendanceTrend: DayTrendPoint[];
  avgAttendancePct: number;
}) {
  const { t } = useTranslation();
  const empty = t("peopleEvent.dashboard.chartsEmpty");
  const reducedMotion = usePrefersReducedMotion();

  const donutData = [
    {
      key: "complete",
      name: t("peopleEvent.attendance.statusComplete"),
      value: status.complete,
      fill: EA.green,
    },
    {
      key: "late",
      name: t("peopleEvent.attendance.statusLate"),
      value: status.late,
      fill: EA.orange,
    },
    {
      key: "missing",
      name: t("peopleEvent.attendance.statusMissing"),
      value: status.missing,
      fill: EA.red,
    },
  ].filter((s) => s.value > 0);

  const statusLegend = [
    {
      key: "complete",
      label: t("peopleEvent.attendance.statusComplete"),
      count: status.complete,
      pct: status.total ? Math.round((status.complete / status.total) * 1000) / 10 : 0,
      color: EA.green,
    },
    {
      key: "late",
      label: t("peopleEvent.attendance.statusLate"),
      count: status.late,
      pct: status.total ? Math.round((status.late / status.total) * 1000) / 10 : 0,
      color: EA.orange,
    },
    {
      key: "missing",
      label: t("peopleEvent.attendance.statusMissing"),
      count: status.missing,
      pct: status.total ? Math.round((status.missing / status.total) * 1000) / 10 : 0,
      color: EA.red,
    },
  ];

  const trendEmpty = attendanceTrend.length === 0 || attendanceTrend.every((d) => d.assigned === 0);
  const yDomain = (() => {
    if (trendEmpty) return [90, 100] as [number, number];
    const values = attendanceTrend.filter((d) => d.assigned > 0).map((d) => d.pct);
    if (!values.length) return [90, 100] as [number, number];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const floor = Math.max(0, Math.floor(min / 5) * 5 - 5);
    const ceil = Math.min(100, Math.ceil(max / 5) * 5 + 5);
    return [Math.min(floor, 90), Math.max(ceil, 100)] as [number, number];
  })();

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Panel title={t("peopleEvent.attendance.chartByStatus")}>
        {status.total === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 text-center">
            <p className="text-sm text-muted-foreground">{empty}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="relative h-48 w-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={78}
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
                  {status.total.toLocaleString()}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("peopleEvent.attendance.donutRecords")}
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
                    {item.count.toLocaleString()}
                    <span className="ms-1 font-medium text-muted-foreground">({item.pct}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel
        title={t("peopleEvent.attendance.chartTrend")}
        headerRight={
          <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-[#7c3aed]">
            {t("peopleEvent.dashboard.avgAttendance", { pct: avgAttendancePct })}
          </span>
        }
      >
        {trendEmpty ? (
          <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 text-center">
            <p className="text-sm text-muted-foreground">{empty}</p>
          </div>
        ) : (
          <div className="h-56 min-w-0 sm:h-64">
            <p className="mb-2 text-xs text-muted-foreground">
              {t("peopleEvent.attendance.chartTrendHint")}
            </p>
            <ResponsiveContainer width="100%" height="90%">
              <AreaChart data={attendanceTrend} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="eaRecordsTrendFill" x1="0" y1="0" x2="0" y2="1">
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
                  domain={yDomain}
                  width={36}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(value: number) => [
                    `${value}%`,
                    t("peopleEvent.dashboard.seriesAttendancePct"),
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke={EA.purple}
                  strokeWidth={2.5}
                  fill="url(#eaRecordsTrendFill)"
                  dot={{ r: 4, fill: EA.purple, stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={!reducedMotion}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}
