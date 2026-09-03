"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
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
import { useAppStore } from "@/stores/app-store";

function monthAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function ProcurementAnalyticsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState("");
  const [vendorId, setVendorId] = useState("");

  const options = useQuery({
    queryKey: queryKeys.procurement.options(),
    queryFn: () => getProcurementOptions(),
  });
  const filters = useMemo(
    () => ({
      locationId,
      departmentId: departmentId || null,
      vendorId: vendorId || null,
      from,
      to,
    }),
    [locationId, departmentId, vendorId, from, to],
  );
  const analytics = useQuery({
    queryKey: queryKeys.procurement.analytics(filters),
    queryFn: () => getProcurementAnalytics(filters),
  });
  const d = analytics.data;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        kicker={t("procurement.kicker")}
        title={t("procurement.analytics.title")}
        subtitle={t("procurement.analytics.subtitle")}
      />

      <div className="grid gap-3 rounded-2xl border border-border/40 bg-card p-4 shadow-elevated-xs md:grid-cols-5">
        <div className="space-y-1.5">
          <Label>{t("procurement.filters.from")}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("procurement.filters.to")}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("procurement.filters.department")}</Label>
          <Select value={departmentId || "all"} onValueChange={(v) => setDepartmentId(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("procurement.filters.all")}</SelectItem>
              {(options.data?.departments ?? []).map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.path_name ?? dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("procurement.filters.vendor")}</Label>
          <Select value={vendorId || "all"} onValueChange={(v) => setVendorId(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("procurement.filters.all")}</SelectItem>
              {(options.data?.vendors ?? []).map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" onClick={() => analytics.refetch()}>
            {t("procurement.analytics.apply")}
          </Button>
        </div>
      </div>

      {analytics.isError ? (
        <p className="text-sm text-destructive">{t("procurement.dashboard.loadError")}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title={t("procurement.dashboard.cycleVelocity")} value={d ? `${d.avgCycleDays}` : "—"} hint={t("procurement.analytics.cycleUnit")} />
        <Kpi title={t("procurement.analytics.budgetAdherence")} value={d ? `${Math.round(d.budgetAdherence * 100)}%` : "—"} hint={t("procurement.analytics.budgetHint")} />
        <Kpi title={t("procurement.analytics.liability")} value={d ? fmtQar(d.forecastedLiability) : "—"} hint={t("procurement.analytics.liabilityHint")} />
        <Kpi title={t("procurement.analytics.signoff")} value={d ? `${Math.round(d.signoffRate * 100)}%` : "—"} hint={t("procurement.analytics.signoffHint")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NamedChart title={t("procurement.dashboard.spendByDept")} rows={d?.departments ?? []} empty={t("procurement.dashboard.noChartData")} />
        <NamedChart title={t("procurement.dashboard.vendorConcentration")} rows={d?.vendors ?? []} empty={t("procurement.dashboard.noChartData")} />
        <NamedChart
          title={t("procurement.analytics.purposeAllocation")}
          rows={(d?.purposes ?? []).map((row) => ({
            ...row,
            name: t(`procurement.form.categoryOptions.${row.name}`, { defaultValue: row.name }),
          }))}
          empty={t("procurement.dashboard.noChartData")}
        />
        <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
          <h2 className="text-sm font-semibold">{t("procurement.analytics.reconcile")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("procurement.analytics.reconcileHint")}</p>
          <dl className="mt-4 grid gap-2 text-sm">
            <Row label={t("procurement.dashboard.approvedValue")} value={fmtQar(d?.approvedValue ?? 0)} />
            <Row label={t("procurement.analytics.paid")} value={fmtQar(d?.paidValue ?? 0)} />
            <Row label={t("procurement.dashboard.pending")} value={fmtQar(d?.pendingValue ?? 0)} />
            <Row label={t("procurement.analytics.requests")} value={fmtNumber(d?.total ?? 0)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
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

function NamedChart({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ name: string; amount: number }>;
  empty: string;
}) {
  if (!rows.length) {
    return (
      <ChartCard title={title}>
        <ChartEmpty label={empty} />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={260}>
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
