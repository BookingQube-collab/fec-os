"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Package,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

import { ChartCard } from "@/components/charts/chart-card";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import {
  CHART,
  CHART_PLOT,
  CHART_SERIES,
  chartGridProps,
  chartLegendStyle,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  truncateAxisLabel,
} from "@/lib/chart-theme";
import { fmtNumber, fmtQar } from "@/lib/currency";
import type {
  EventReportVisualModel,
  ReportBarSpec,
  ReportDonutSpec,
  ReportGroupedSpec,
} from "@/lib/events/report-visuals";

const INK = CHART.ink;
const TEAL = CHART.teal;
const AMBER = CHART.amber;
const RED = CHART.red;
const GOLD = CHART.gold;
const SLATE = CHART.muted;
const SERIES = CHART_SERIES;
const PLOT = CHART_PLOT;

const HEALTH_FILL: Record<string, string> = {
  green: TEAL,
  amber: AMBER,
  red: RED,
  critical: "#7f1d1d",
};

const SEVERITY_FILL: Record<string, string> = {
  low: SLATE,
  medium: GOLD,
  normal: SLATE,
  high: AMBER,
  urgent: AMBER,
  critical: RED,
};

const YESNO_FILL: Record<string, string> = {
  yes: TEAL,
  no: AMBER,
};

const KPI_ICON: Record<string, LucideIcon> = {
  events: CalendarDays,
  criticalHealth: AlertTriangle,
  avgReadiness: Gauge,
  items: ClipboardList,
  complete: CheckCircle2,
  requiredOpen: AlertTriangle,
  departments: BarChart3,
  avgCompletion: Gauge,
  overdue: AlertTriangle,
  blocked: ShieldAlert,
  rows: ClipboardList,
  revised: Wallet,
  actual: Wallet,
  remaining: Wallet,
  forecastVariance: Wallet,
  overBudget: AlertTriangle,
  revenue: Wallet,
  profit: Wallet,
  avgMargin: Gauge,
  pending: ClipboardList,
  amount: Wallet,
  prs: ClipboardList,
  risks: ShieldAlert,
  critical: AlertTriangle,
  snags: AlertTriangle,
  safety: ShieldAlert,
  missing: Package,
  qty: Package,
  approved: CheckCircle2,
  goLivePending: AlertTriangle,
  open: AlertTriangle,
  withLessons: ClipboardList,
  checklistDone: CheckCircle2,
};

function useLabeler() {
  const { t } = useTranslation();
  return (kind: ReportDonutSpec["labelKind"], key: string) => {
    if (key === "—" || key === "") return t("events.reports.unassigned");
    if (kind === "health") return t(`events.rag.${key}`, { defaultValue: key });
    if (kind === "yesno") return t(`events.reports.${key}`, { defaultValue: key });
    if (kind === "severity") {
      return t(`events.risk.${key}`, {
        defaultValue: t(`events.priority.${key}`, { defaultValue: key }),
      });
    }
    if (kind === "reason") return t(`events.reports.reason.${key}`, { defaultValue: key });
    if (kind === "kind") return t(`events.reports.kind.${key}`, { defaultValue: key });
    if (kind === "status") {
      const paths = [
        `events.status.${key}`,
        `events.taskStatus.${key}`,
        `events.issueStatus.${key}`,
        `events.assetStatus.${key}`,
        `events.risk.${key}`,
        `events.payableStatus.${key}`,
        `events.invoiceStatus.${key}`,
        `procurement.status.${key}`,
      ];
      for (const path of paths) {
        const label = t(path);
        if (label !== path) return label;
      }
      return key;
    }
    return key;
  };
}

function fillFor(kind: ReportDonutSpec["labelKind"], key: string, index: number): string {
  if (kind === "health") return HEALTH_FILL[key] ?? SERIES[index % SERIES.length];
  if (kind === "severity") return SEVERITY_FILL[key] ?? SERIES[index % SERIES.length];
  if (kind === "yesno") return YESNO_FILL[key] ?? SERIES[index % SERIES.length];
  if (key === "overdue" || key === "blocked" || key === "missing" || key === "critical") return RED;
  return SERIES[index % SERIES.length];
}

function formatTick(value: number, format: "number" | "pct" | "money"): string {
  if (format === "money") return Math.abs(value) >= 1000 ? `${fmtNumber(value / 1000)}K` : fmtQar(value);
  if (format === "pct") return `${Math.round(value)}%`;
  return fmtNumber(value);
}

function formatTooltip(value: number, format: "number" | "pct" | "money"): string {
  if (format === "money") return fmtQar(value);
  if (format === "pct") return `${Math.round(value)}%`;
  return fmtNumber(value);
}

function DonutPlot({ spec, labeler }: { spec: ReportDonutSpec; labeler: (kind: ReportDonutSpec["labelKind"], key: string) => string }) {
  const { t } = useTranslation();
  const data = spec.data.map((row, i) => ({
    ...row,
    label: labeler(spec.labelKind, row.key),
    fill: fillFor(spec.labelKind, row.key, i),
  }));
  return (
    <ChartCard title={t(spec.titleKey)}>
      <div className={PLOT}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={74} paddingAngle={2}>
              {data.map((row) => (
                <Cell key={row.key} fill={row.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              formatter={(value: number) => [fmtNumber(value), t("events.reports.series.count")]}
            />
            <Legend
              wrapperStyle={chartLegendStyle}
              formatter={(value) => <span className="text-muted-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function BarPlot({ spec }: { spec: ReportBarSpec }) {
  const { t } = useTranslation();
  const data = spec.data.map((row) => ({ ...row, label: row.key }));
  const vertical = spec.layout === "vertical";
  return (
    <ChartCard title={t(spec.titleKey)}>
      <div className={PLOT}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout={vertical ? "horizontal" : "vertical"}
            margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid {...chartGridProps} />
            {vertical ? (
              <>
                <XAxis
                  dataKey="label"
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(v) => truncateAxisLabel(String(v), 12)}
                  interval={0}
                />
                <YAxis
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(v) => formatTick(Number(v), spec.format)}
                />
              </>
            ) : (
              <>
                <XAxis
                  type="number"
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(v) => formatTick(Number(v), spec.format)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={96}
                  tick={chartTick}
                  stroke={CHART.grid}
                  tickFormatter={(v) => truncateAxisLabel(String(v))}
                />
              </>
            )}
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              formatter={(value: number) => [formatTooltip(value, spec.format), t("events.reports.series.count")]}
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="value" fill={INK} radius={vertical ? [6, 6, 0, 0] : [0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function GroupedPlot({ spec }: { spec: ReportGroupedSpec }) {
  const { t } = useTranslation();
  const data = spec.data.map((row) => ({ ...row, label: row.key }));
  return (
    <ChartCard title={t(spec.titleKey)}>
      <div className={PLOT}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis
              dataKey="label"
              tick={chartTick}
              stroke={CHART.grid}
              tickFormatter={(v) => truncateAxisLabel(String(v), 12)}
              interval={0}
            />
            <YAxis
              tick={chartTick}
              stroke={CHART.grid}
              tickFormatter={(v) => formatTick(Number(v), spec.format)}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              formatter={(value: number, name: string) => [
                formatTooltip(value, spec.format),
                t(`events.reports.series.${name}`, { defaultValue: name }),
              ]}
            />
            <Legend wrapperStyle={chartLegendStyle} />
            {spec.series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={t(s.labelKey)} fill={SERIES[i % SERIES.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function EventReportsVisuals({
  model,
  loading,
}: {
  model: EventReportVisualModel;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const labeler = useLabeler();

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[6.5rem] animate-pulse rounded-2xl bg-muted/70" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted/70" />
          ))}
        </div>
      </div>
    );
  }

  const charts: Array<{ key: string; node: ReactNode }> = [
    ...model.donuts.map((spec) => ({ key: `d-${spec.id}`, node: <DonutPlot spec={spec} labeler={labeler} /> })),
    ...model.grouped.map((spec) => ({ key: `g-${spec.id}`, node: <GroupedPlot spec={spec} /> })),
    ...model.bars.map((spec) => ({ key: `b-${spec.id}`, node: <BarPlot spec={spec} /> })),
  ];

  if (!model.kpis.length && !charts.length) return null;

  return (
    <div className="space-y-4">
      {model.kpis.length ? (
        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${model.kpis.length > 3 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
        >
          {model.kpis.map((k) => (
            <TintedKpiCard
              key={k.id}
              title={t(k.labelKey)}
              value={k.format === "money" ? fmtQar(k.value) : k.format === "pct" ? `${Math.round(k.value)}%` : fmtNumber(k.value)}
              tint={k.tint}
              icon={KPI_ICON[k.id] ?? BarChart3}
              empty={k.value === 0}
            />
          ))}
        </div>
      ) : null}
      {charts.length ? (
        <div className={`grid gap-4 ${charts.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {charts.map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

