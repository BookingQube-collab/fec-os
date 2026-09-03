"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, Filter, Target, TrendingUp, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/page-header";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { chartGridProps, chartTick, chartTooltipStyle, seriesColor } from "@/lib/chart-theme";
import { fmtNumber, fmtQar } from "@/lib/currency";
import { getProcurementAnalytics, getProcurementOptions } from "@/lib/procurement.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

type PeriodPreset = "monthly" | "quarterly" | "custom";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const PIE_COLORS = [seriesColor(0), seriesColor(1), seriesColor(2), seriesColor(3), seriesColor(4)];

export default function ProcurementAnalyticsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [preset, setPreset] = useState<PeriodPreset>("monthly");
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [projectName, setProjectName] = useState("");

  const applyPreset = (next: PeriodPreset) => {
    setPreset(next);
    if (next === "monthly") setFrom(isoDaysAgo(30));
    if (next === "quarterly") setFrom(isoDaysAgo(90));
    if (next !== "custom") setTo(new Date().toISOString().slice(0, 10));
  };

  const options = useQuery({
    queryKey: queryKeys.procurement.options(),
    queryFn: () => getProcurementOptions(),
  });
  const filters = useMemo(
    () => ({
      locationId,
      departmentId: departmentId || null,
      vendorId: vendorId || null,
      projectName: projectName || null,
      from,
      to,
    }),
    [locationId, departmentId, vendorId, projectName, from, to],
  );
  const analytics = useQuery({
    queryKey: queryKeys.procurement.analytics(filters),
    queryFn: () => getProcurementAnalytics(filters),
  });
  const d = analytics.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("procurement.analytics.consoleTitle")}
        subtitle={t("procurement.analytics.consoleSubtitle")}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["monthly", t("procurement.analytics.monthlyView")],
            ["quarterly", t("procurement.analytics.quarterlyView")],
            ["custom", t("procurement.analytics.customRange")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            className={cn("filter-chip", preset === id && "filter-chip-active")}
          >
            {id === "monthly" ? <Filter className="me-1.5 h-3.5 w-3.5" /> : null}
            {label}
          </button>
        ))}
        <Select value={departmentId || "all"} onValueChange={(v) => setDepartmentId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-auto min-w-40 rounded-full">
            <SelectValue placeholder={t("procurement.filters.department")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("procurement.filters.department")}</SelectItem>
            {(options.data?.departments ?? []).map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.path_name ?? dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectName || "all"} onValueChange={(v) => setProjectName(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-auto min-w-36 rounded-full">
            <SelectValue placeholder={t("procurement.analytics.projects")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("procurement.analytics.projects")}</SelectItem>
            {(d?.projects ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={vendorId || "all"} onValueChange={(v) => setVendorId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-auto min-w-36 rounded-full">
            <SelectValue placeholder={t("procurement.filters.vendor")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("procurement.filters.vendor")}</SelectItem>
            {(options.data?.vendors ?? []).map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" ? (
        <div className="grid gap-3 rounded-2xl border border-border/40 bg-card p-4 shadow-elevated-xs sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("procurement.filters.from")}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("procurement.filters.to")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => analytics.refetch()}>
              {t("procurement.analytics.apply")}
            </Button>
          </div>
        </div>
      ) : null}

      {analytics.isError ? (
        <p className="text-sm text-destructive">{t("procurement.dashboard.loadError")}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title={t("procurement.dashboard.cycleVelocity")}
          value={d ? `${d.avgCycleDays}` : "—"}
          hint={t("procurement.analytics.cycleHintE3")}
          badge={t("procurement.analytics.cycleUnit")}
          icon={Clock}
        />
        <Kpi
          title={t("procurement.analytics.budgetAdherence")}
          value={d ? `${Math.round(d.budgetAdherence * 100)}%` : "—"}
          hint={t("procurement.analytics.budgetHintE3")}
          badge={t("procurement.analytics.signoffHint")}
          icon={Target}
        />
        <Kpi
          title={t("procurement.analytics.liability")}
          value={d ? fmtQar(d.forecastedLiability) : "—"}
          hint={t("procurement.analytics.liabilityHintE3")}
          badge={t("procurement.analytics.overdueLiability", { amount: fmtQar(d?.overdueValue ?? 0) })}
          icon={TrendingUp}
          alert={Boolean(d?.overdueValue)}
        />
        <Kpi
          title={t("procurement.analytics.savings")}
          value={d ? fmtQar(d.savings) : "—"}
          hint={t("procurement.analytics.savingsHint")}
          badge={t("procurement.dashboard.deptBadge", { n: d?.departments?.length ?? 0 })}
          icon={Zap}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <NamedBar
          title={t("procurement.analytics.departmentYield")}
          subtitle={t("procurement.analytics.spentVsSavings")}
          rows={d?.departments ?? []}
          empty={t("procurement.dashboard.noChartData")}
        />
        <div className="space-y-4">
          <NamedPie
            title={t("procurement.dashboard.vendorConcentration")}
            rows={d?.vendors ?? []}
            empty={t("procurement.dashboard.noChartData")}
          />
          <NamedPie
            title={t("procurement.analytics.purposeAllocation")}
            rows={(d?.purposes ?? []).map((row) => ({
              ...row,
              name: t(`procurement.form.categoryOptions.${row.name}`, { defaultValue: row.name }),
            }))}
            empty={t("procurement.dashboard.noChartData")}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
        <h2 className="text-sm font-semibold">{t("procurement.analytics.reconcile")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("procurement.analytics.reconcileHint")}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("procurement.analytics.filterContext")}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <Row label={t("procurement.dashboard.approvedValue")} value={fmtQar(d?.approvedValue ?? 0)} />
          <Row label={t("procurement.analytics.paid")} value={fmtQar(d?.paidValue ?? 0)} />
          <Row label={t("procurement.dashboard.pending")} value={fmtQar(d?.pendingValue ?? 0)} />
          <Row label={t("procurement.analytics.requests")} value={fmtNumber(d?.total ?? 0)} />
        </dl>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
  badge,
  icon: Icon,
  alert,
}: {
  title: string;
  value: string;
  hint: string;
  badge: string;
  icon: typeof Clock;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{hint}</p>
      <p className={cn("mt-3 text-[10px] font-semibold uppercase tracking-wide", alert ? "text-destructive" : "text-primary")}>
        {badge}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function NamedBar({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ name: string; amount: number }>;
  empty: string;
}) {
  if (!rows.length) {
    return (
      <ChartCard title={title}>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{subtitle}</p>
        <ChartEmpty label={empty} />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title}>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{subtitle}</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 12 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis type="number" tick={chartTick} />
          <YAxis type="category" dataKey="name" width={110} tick={chartTick} />
          <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => fmtQar(Number(v))} />
          <Bar dataKey="amount" fill={seriesColor(0)} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function NamedPie({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ name: string; amount: number }>;
  empty: string;
}) {
  return (
    <ChartCard title={title}>
      {!rows.length ? (
        <ChartEmpty label={empty} />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={rows} dataKey="amount" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3}>
              {rows.map((row, i) => (
                <Cell key={row.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => fmtQar(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
