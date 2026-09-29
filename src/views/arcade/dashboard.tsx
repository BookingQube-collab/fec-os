"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, Gamepad2, Gauge, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { arcadeCategoryName, SiteHealthCard, StatusBadge } from "@/components/arcade/ui";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { AppCard, EmptyState, LoadingState, MetricCard, SegmentControl } from "@/components/ds";
import { FecPageHeader } from "@/components/fec";
import { useSites } from "@/hooks/queries/useSites";
import { getArcadeDashboard, syncArcadeAlerts } from "@/lib/arcade.functions";
import { CHART, chartTooltipStyle } from "@/lib/chart-theme";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";

const ALERTS_FLAG = "arcade-alerts-synced";

export function ArcadeDashboard() {
  const { t } = useTranslation();
  const sites = useSites();
  const dashboard = useQuery({
    queryKey: queryKeys.arcade.dashboard(null),
    queryFn: () => getArcadeDashboard({}),
  });
  useEffect(() => {
    if (!dashboard.isSuccess) return;
    try {
      if (sessionStorage.getItem(ALERTS_FLAG)) return;
    } catch {
      return;
    }
    const id = window.setTimeout(() => {
      try {
        if (sessionStorage.getItem(ALERTS_FLAG)) return;
        sessionStorage.setItem(ALERTS_FLAG, "1");
      } catch {
        return;
      }
      void syncArcadeAlerts({}).catch(() => undefined);
    }, 2000);
    return () => window.clearTimeout(id);
  }, [dashboard.isSuccess]);

  const data = dashboard.data;
  const kpis = data?.kpis;
  const siteCards = [...(data?.sites ?? [])].sort((a, b) => (a.availability ?? 101) - (b.availability ?? 101));
  const slices = kpis
    ? [
        { key: "working", name: t("arcadeOps.working"), value: kpis.working, fill: CHART.teal },
        { key: "down", name: t("arcadeOps.down"), value: kpis.down, fill: CHART.red },
        { key: "repair", name: t("arcadeOps.underRepair"), value: kpis.underRepair, fill: CHART.amber },
        { key: "watch", name: t("arcadeOps.underObservation"), value: kpis.underObservation, fill: CHART.info },
        { key: "part", name: t("arcadeOps.waitingParts"), value: kpis.waitingPart, fill: CHART.gold },
        { key: "supplier", name: t("arcadeOps.waitingSupplier"), value: kpis.waitingSupplier, fill: CHART.ink },
        { key: "out", name: t("arcadeStatus.OUT_OF_SERVICE"), value: kpis.outOfService, fill: CHART.muted },
      ].filter((slice) => slice.value > 0)
    : [];
  const chips = kpis
    ? [
        { href: "/arcade/faults", label: t("arcadeOps.underRepair"), value: kpis.underRepair },
        { href: "/arcade/observation", label: t("arcadeOps.underObservation"), value: kpis.underObservation },
        { href: "/arcade/parts", label: t("arcadeOps.waitingParts"), value: kpis.waitingPart },
        { href: "/arcade/support", label: t("arcadeOps.waitingSupplier"), value: kpis.waitingSupplier },
        { href: "/arcade/pm", label: t("arcadeOps.pmDue"), value: kpis.pmDue },
        { href: "/arcade/pm", label: t("arcadeOps.pmOverdue"), value: kpis.pmOverdue },
        { href: "/arcade/faults", label: t("arcadeOps.repeatFaults"), value: kpis.repeatFaults },
      ]
    : [];

  return (
    <div className="grid gap-5">
      <FecPageHeader icon={Gamepad2} kicker={t("nav.arcade")} title={t("nav.arcadeDashboard")} subtitle={t("arcadeOps.dashboardSubtitle")} />
      {dashboard.isLoading ? <LoadingState label={t("arcadeOps.loading")} count={4} /> : null}
      {dashboard.isError ? <p className="text-sm text-destructive">{dashboard.error instanceof Error ? dashboard.error.message : t("arcadeOps.failed")}</p> : null}
      {kpis ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Gauge}
              tone="success"
              title={t("arcadeOps.operational")}
              value={kpis.operationalPercent == null ? "—" : `${kpis.operationalPercent}%`}
              hint={kpis.pmCompliance == null ? t("arcadeOps.pmHintEmpty") : t("arcadeOps.pmHint", { percent: kpis.pmCompliance })}
              href="/arcade/sites"
            />
            <MetricCard icon={CircleCheck} tone="info" title={t("arcadeOps.working")} value={kpis.working} hint={t("arcadeOps.fleetCount", { count: kpis.total })} href="/arcade/sites" />
            <MetricCard icon={CircleX} tone={kpis.down > 0 ? "danger" : "success"} title={t("arcadeOps.down")} value={kpis.down} href="/arcade/faults" pulse={kpis.down > 0} empty={kpis.down === 0} />
            <MetricCard icon={Wrench} tone={kpis.openFaults > 0 ? "warning" : "success"} title={t("arcadeOps.openFaults")} value={kpis.openFaults} href="/arcade/faults" />
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Link key={chip.href + chip.label} href={chip.href} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted/50">
                <span className="text-muted-foreground">{chip.label}</span>
                <span className="font-semibold tabular-nums">{chip.value}</span>
              </Link>
            ))}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
            <ChartCard title={t("arcadeOps.fleetHealth")} subtitle={t("arcadeOps.fleetCount", { count: kpis.total })}>
              {slices.length === 0 ? (
                <ChartEmpty label={t("arcadeOps.emptySites")} className="h-40" />
              ) : (
                <div className="grid gap-3">
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={slices} dataKey="value" nameKey="name" innerRadius={52} outerRadius={74} paddingAngle={2} stroke="transparent">
                          {slices.map((slice) => (
                            <Cell key={slice.key} fill={slice.fill} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="grid gap-1.5">
                    {slices.map((slice) => (
                      <li key={slice.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.fill }} />
                          <span className="truncate">{slice.name}</span>
                        </span>
                        <span className="tabular-nums font-medium">{slice.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ChartCard>
            <section className="grid gap-3">
              <h2 className="text-base font-semibold">{t("arcadeOps.siteHealth")}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {siteCards.map((site) => {
                  const location = sites.data?.find((row) => row.id === site.location_id);
                  return (
                    <SiteHealthCard
                      key={site.location_id}
                      href={`/arcade/sites/${site.location_id}`}
                      title={venueTitle(location, t("common.site"))}
                      code={location?.code}
                      availability={site.availability}
                      meterLabel={t("arcadeScreens.availability")}
                      detail={t("arcadeScreens.siteLineShort", {
                        machines: site.active_machines,
                        working: site.working,
                        down: site.down,
                      })}
                      alert={site.down > 0 ? t("arcadeOps.down") : null}
                    />
                  );
                })}
              </div>
              {data && data.sites.length === 0 ? <EmptyState title={t("arcadeOps.emptySites")} /> : null}
            </section>
          </div>
          <Attention
            queues={[
              { id: "critical", title: t("arcadeOps.critical"), rows: (data?.critical ?? []).map((row) => ({ href: `/arcade/machines/${row.id}`, label: row.name, meta: `${row.asset_code} · ${venueTitle(sites.data?.find((site) => site.id === row.location_id), t("common.site"))}`, status: row.status })) },
              { id: "aged", title: t("arcadeOps.aged"), rows: (data?.aged ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: row.description, status: row.status })) },
              { id: "supplier", title: t("arcadeOps.waitingSupplier"), rows: (data?.waitingSupplier ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: row.description, status: row.status })) },
              { id: "parts", title: t("arcadeOps.waitingParts"), rows: (data?.waitingPart ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: row.description, status: row.status })) },
              { id: "repeats", title: t("arcadeOps.repeats"), rows: (data?.repeats ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: t("arcadeOps.repeatMeta", { category: arcadeCategoryName(t, row.category), count: row.repeat_count }), status: "REPEAT" })) },
              { id: "pm", title: t("arcadeOps.pmDue"), rows: (data?.pmDue ?? []).map((row) => ({ href: `/arcade/machines/${row.id}`, label: row.name, meta: row.next_pm_on ?? "", status: row.status })) },
              { id: "resolved", title: t("arcadeOps.resolved"), rows: (data?.resolved ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: arcadeCategoryName(t, row.category), status: "RESOLVED" })) },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

function Attention({ queues }: { queues: { id: string; title: string; rows: { href: string; label: string; meta: string; status: string }[] }[] }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const activeId = picked && queues.some((queue) => queue.id === picked) ? picked : (queues.find((queue) => queue.rows.length > 0)?.id ?? queues[0]?.id);
  const active = queues.find((queue) => queue.id === activeId) ?? queues[0];
  if (!active) return null;
  return (
    <AppCard className="grid gap-3 p-4">
      <div>
        <h2 className="text-base font-semibold">{t("arcadeOps.needsAttention")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("arcadeOps.attentionHint")}</p>
      </div>
      <SegmentControl
        layout="scroll"
        ariaLabel={t("arcadeOps.needsAttention")}
        value={active.id}
        onValueChange={setPicked}
        options={queues.map((queue) => ({ value: queue.id, label: queue.title }))}
      />
      <div key={active.id} className="ds-enter">
        {active.rows.length === 0 ? <EmptyState title={t("arcadeOps.none")} /> : (
          <ul className="grid gap-2">
            {active.rows.map((row, index) => (
              <li key={row.href} className={index < 12 ? "ds-enter" : undefined} style={index < 12 ? { animationDelay: `${index * 20}ms` } : undefined}>
                <Link href={row.href} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0">
                    <span className="block font-medium">{row.label}</span>
                    {row.meta ? <span className="mt-0.5 block truncate text-muted-foreground">{row.meta}</span> : null}
                  </span>
                  <StatusBadge status={row.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppCard>
  );
}
