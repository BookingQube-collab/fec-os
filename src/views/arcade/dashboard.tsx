"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  Clock,
  Gamepad2,
  Gauge,
  Package,
  Repeat2,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";

import { arcadeCategoryName, SiteHealthCard, StatusBadge } from "@/components/arcade/ui";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { FecLoader, FecPageHeader } from "@/components/fec";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { Button } from "@/components/ui/button";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { getArcadeContext, getArcadeDashboard, setArcadeListHidden, syncArcadeAlerts } from "@/lib/arcade.functions";
import { getArcadePicture } from "@/lib/arcade-work.functions";
import { CHART, chartTooltipStyle } from "@/lib/chart-theme";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";

const ALERTS_FLAG = "arcade-alerts-synced";
const MONTHS = ["current", "previous", "overall"] as const;
type MonthPeriod = (typeof MONTHS)[number];

function signed(value: number) {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${text}` : text;
}

function monthName(iso: string, language: string) {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return iso;
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function ArcadeDashboard() {
  const { t } = useTranslation();
  const sites = useSites();
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const dashboard = useQuery({
    queryKey: queryKeys.arcade.dashboard(null),
    queryFn: () => getArcadeDashboard({}),
  });
  const picture = useQuery({
    queryKey: [...queryKeys.arcade.all, "picture"],
    queryFn: () => getArcadePicture({}),
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
  const nameFor = (id: string) => venueTitle(sites.data?.find((site) => site.id === id), t("common.site"));

  return (
    <div className="grid gap-5">
      <FecPageHeader icon={Gamepad2} kicker={t("nav.arcade")} title={t("nav.arcadeDashboard")} subtitle={t("arcadeOps.dashboardSubtitle")} />
      {context.data?.isSupervisor ? <p className="text-base font-medium">{t("arcadeSimple.yourChecklist")}</p> : null}
      {context.data?.isTechnician ? <p className="text-base font-medium">{t("arcadeSimple.yourRepair")}</p> : null}
      <MonthCompare
        loading={picture.isLoading}
        error={picture.isError ? (picture.error instanceof Error ? picture.error.message : t("arcadeOps.failed")) : null}
        picture={picture.data}
      />
      {dashboard.isLoading ? <FecLoader label={t("arcadeOps.loading")} /> : null}
      {dashboard.isError && !picture.isError ? <p className="text-sm text-destructive">{dashboard.error instanceof Error ? dashboard.error.message : t("arcadeOps.failed")}</p> : null}
      {kpis ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TintedKpiCard
              tint="green"
              icon={Gauge}
              title={t("arcadeOps.operational")}
              value={kpis.operationalPercent == null ? "—" : `${kpis.operationalPercent}%`}
              hint={kpis.pmCompliance == null ? t("arcadeOps.pmHintEmpty") : t("arcadeOps.pmHint", { percent: kpis.pmCompliance })}
              href="/arcade/sites"
              viewLabel={t("common.view")}
            />
            <TintedKpiCard tint="sky" icon={CircleCheck} title={t("arcadeOps.working")} value={kpis.working} hint={t("arcadeOps.fleetCount", { count: kpis.total })} href="/arcade/sites" viewLabel={t("common.view")} />
            <TintedKpiCard tint="red" icon={CircleX} title={t("arcadeOps.down")} value={kpis.down} href="/arcade/faults" viewLabel={t("common.view")} />
            <TintedKpiCard tint="orange" icon={Wrench} title={t("arcadeOps.openFaults")} value={kpis.openFaults} href="/arcade/faults" viewLabel={t("common.view")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Link key={chip.href + chip.label} href={chip.href} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                    />
                  );
                })}
              </div>
              {data && data.sites.length === 0 ? <p className="text-sm text-muted-foreground">{t("arcadeOps.emptySites")}</p> : null}
            </section>
          </div>
          <Attention
            queues={[
              { id: "critical", title: t("arcadeOps.critical"), rows: (data?.critical ?? []).map((row) => ({ href: `/arcade/machines/${row.id}`, label: row.name, meta: `${row.asset_code} · ${nameFor(row.location_id)}`, status: row.status })) },
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
      <LocationGames
        loading={picture.isLoading}
        error={picture.isError ? (picture.error instanceof Error ? picture.error.message : t("arcadeOps.failed")) : null}
        picture={picture.data}
        nameFor={nameFor}
        availabilityFor={(id) => data?.sites.find((site) => site.location_id === id)?.availability ?? null}
      />
    </div>
  );
}

function MonthCompare({
  loading,
  error,
  picture,
}: {
  loading: boolean;
  error: string | null;
  picture: Awaited<ReturnType<typeof getArcadePicture>> | undefined;
}) {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<MonthPeriod>("current");
  if (loading) return <FecLoader label={t("arcadeOps.loading")} />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!picture) return null;
  const counts = picture.comparison[period];
  const metrics = [
    { key: "opened", label: t("arcadeSimple.opened"), current: picture.comparison.current.repairsOpened, previous: picture.comparison.previous.repairsOpened },
    { key: "finished", label: t("arcadeSimple.finished"), current: picture.comparison.current.repairsFinished, previous: picture.comparison.previous.repairsFinished },
    { key: "downtime", label: t("arcadeSimple.downtime"), current: picture.comparison.current.downtimeHours, previous: picture.comparison.previous.downtimeHours },
    { key: "checks", label: t("arcadeSimple.checks"), current: picture.comparison.current.checksRecorded, previous: picture.comparison.previous.checksRecorded },
  ];
  const caption =
    period === "overall"
      ? t("arcadeSimple.overallNote")
      : monthName(period === "current" ? picture.windows.currentStart : picture.windows.previousStart, i18n.language);
  const versus = (metric: (typeof metrics)[number]) => {
    if (period === "overall") return t("arcadeSimple.monthPair", { current: metric.current, previous: metric.previous });
    if (period === "previous") return t("arcadeSimple.vsThis", { value: metric.current });
    const delta = Math.round((metric.current - metric.previous) * 10) / 10;
    return delta === 0 ? t("arcadeSimple.sameAsLast") : t("arcadeSimple.vsLast", { delta: signed(delta) });
  };

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">{t("arcadeSimple.monthTitle")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("arcadeSimple.monthHint")}</p>
      </div>
      <div role="tablist" aria-label={t("arcadeSimple.monthTabs")} className="flex flex-wrap gap-2">
        {MONTHS.map((item, index) => (
          <button
            key={item}
            id={`arcade-month-tab-${item}`}
            type="button"
            role="tab"
            aria-selected={period === item}
            aria-controls="arcade-month-panel"
            tabIndex={period === item ? 0 : -1}
            className={pillTabItemClass(period === item)}
            onClick={() => setPeriod(item)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next =
                event.key === "Home" ? 0 : event.key === "End" ? MONTHS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + MONTHS.length) % MONTHS.length;
              setPeriod(MONTHS[next]);
              document.getElementById(`arcade-month-tab-${MONTHS[next]}`)?.focus();
            }}
          >
            {item === "current" ? t("arcadeSimple.thisMonth") : item === "previous" ? t("arcadeSimple.lastMonth") : t("arcadeSimple.overall")}
          </button>
        ))}
      </div>
      <div id="arcade-month-panel" role="tabpanel" aria-labelledby={`arcade-month-tab-${period}`} className="grid gap-3">
        <p className="text-sm text-muted-foreground">{caption}</p>
        {period === "current" ? (
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-background px-4 py-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("arcadeSimple.openNow")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{picture.openRepairsNow}</p>
            </div>
            <p className="max-w-sm text-xs text-muted-foreground">{t("arcadeSimple.liveHint")}</p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.key} className="rounded-xl border bg-background px-4 py-3">
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {counts[metric.key === "opened" ? "repairsOpened" : metric.key === "finished" ? "repairsFinished" : metric.key === "checks" ? "checksRecorded" : "downtimeHours"]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{versus(metric)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LocationGames({
  loading,
  error,
  picture,
  nameFor,
  availabilityFor,
}: {
  loading: boolean;
  error: string | null;
  picture: Awaited<ReturnType<typeof getArcadePicture>> | undefined;
  nameFor: (id: string) => string;
  availabilityFor: (id: string) => number | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const allowed = usePermission("arcade.manage");
  const canManage = allowed && Boolean(picture?.canManageList);
  const [pending, setPending] = useState<string | null>(null);
  const hide = useMutation({
    mutationFn: (input: { kind: "location" | "game"; id: string; hidden: boolean }) => setArcadeListHidden(input),
    onSuccess: async (_result, input) => {
      setPending(null);
      toast.success(input.hidden ? t("arcadeSimple.listHidden") : t("arcadeSimple.listRestored"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : t("arcadeOps.failed"));
    },
  });
  if (loading && !picture) return null;
  if (error && !picture) return null;
  if (!picture) return null;
  const gamesByLocation = new Map<string, typeof picture.games>();
  for (const game of picture.games) {
    const list = gamesByLocation.get(game.locationId) ?? [];
    list.push(game);
    gamesByLocation.set(game.locationId, list);
  }
  const locationIds = [...new Set([...picture.sites.map((site) => site.locationId), ...gamesByLocation.keys()])].sort((a, b) => {
    const availability = (availabilityFor(a) ?? 101) - (availabilityFor(b) ?? 101);
    if (availability !== 0) return availability;
    return nameFor(a).localeCompare(nameFor(b));
  });

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold">{t("arcadeSimple.locations")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("arcadeSimple.locationsHint")}</p>
      </div>
      {picture.truncated ? <p className="text-sm text-muted-foreground">{t("arcadeSimple.truncated")}</p> : null}
      {locationIds.length === 0 ? <p className="text-sm text-muted-foreground">{t("arcadeSimple.noLocations")}</p> : null}
      {locationIds.map((locationId) => {
        const site = picture.sites.find((row) => row.locationId === locationId);
        const games = gamesByLocation.get(locationId) ?? [];
        const name = nameFor(locationId);
        return (
          <article key={locationId} className="overflow-hidden rounded-2xl border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">
                  <Link href={`/arcade/sites/${locationId}`} className="underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {name}
                  </Link>
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("arcadeSimple.games", { count: site?.games ?? games.length })}
                  {" · "}
                  {t("arcadeSimple.working", { count: site?.working ?? games.filter((game) => game.status === "WORKING").length })}
                  {" · "}
                  {t("arcadeSimple.down", { count: site?.down ?? games.filter((game) => game.status === "DOWN").length })}
                </p>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t("arcadeSimple.removeLocationNamed", { name })}
                  disabled={hide.isPending}
                  onClick={() => setPending(pending === locationId ? null : locationId)}
                >
                  {t("arcadeSimple.removeLocation")}
                </Button>
              ) : null}
            </header>
            {pending === locationId ? (
              <div className="grid gap-2 border-b bg-muted/40 px-4 py-3">
                <p className="text-sm">{t("arcadeSimple.removeLocationConfirm")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={hide.isPending} onClick={() => hide.mutate({ kind: "location", id: locationId, hidden: true })}>
                    {t("arcadeSimple.confirmRemove")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPending(null)}>
                    {t("arcadeSimple.cancelRemove")}
                  </Button>
                </div>
              </div>
            ) : null}
            {games.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">{t("arcadeSimple.noGames")}</p> : null}
            <ul className="divide-y">
              {games.map((game) => {
                const detail = game.elements.map((element) => `${t(`arcadeSimple.element.${element.key}`)} ${element.value}`).join(" · ");
                const gamePending = pending === game.id;
                return (
                  <li key={game.id} className="grid gap-2 px-4 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/arcade/machines/${game.id}`} className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {game.name}
                        </Link>
                        {detail ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{detail}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={game.status} />
                        {canManage ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={t("arcadeSimple.removeGameNamed", { name: game.name })}
                            disabled={hide.isPending}
                            onClick={() => setPending(gamePending ? null : game.id)}
                          >
                            {t("arcadeSimple.removeGame")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {gamePending ? (
                      <div className="grid gap-2 rounded-xl bg-muted/40 px-3 py-2">
                        <p className="text-sm">{t("arcadeSimple.removeGameConfirm")}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" disabled={hide.isPending} onClick={() => hide.mutate({ kind: "game", id: game.id, hidden: true })}>
                            {t("arcadeSimple.confirmRemove")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setPending(null)}>
                            {t("arcadeSimple.cancelRemove")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
      {canManage && (picture.removed.locations.length > 0 || picture.removed.games.length > 0) ? (
        <div className="grid gap-2 rounded-2xl border bg-card p-4">
          <div>
            <h3 className="text-base font-semibold">{t("arcadeSimple.removedTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("arcadeSimple.removedHint")}</p>
          </div>
          <ul className="grid gap-2">
            {picture.removed.locations.map((row) => {
              const name = nameFor(row.locationId);
              return (
                <li key={row.locationId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{name}</span>
                  <Button type="button" variant="outline" size="sm" aria-label={t("arcadeSimple.restoreNamed", { name })} disabled={hide.isPending} onClick={() => hide.mutate({ kind: "location", id: row.locationId, hidden: false })}>
                    {t("arcadeSimple.restore")}
                  </Button>
                </li>
              );
            })}
            {picture.removed.games.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{row.name}</span>
                  <span className="mt-0.5 block text-muted-foreground">{nameFor(row.locationId)}</span>
                </span>
                <Button type="button" variant="outline" size="sm" aria-label={t("arcadeSimple.restoreNamed", { name: row.name })} disabled={hide.isPending} onClick={() => hide.mutate({ kind: "game", id: row.id, hidden: false })}>
                  {t("arcadeSimple.restore")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const ATTENTION_ICONS: Record<string, LucideIcon> = {
  critical: AlertTriangle,
  aged: Clock,
  supplier: Truck,
  parts: Package,
  repeats: Repeat2,
  pm: Wrench,
  resolved: CircleCheck,
};

function Attention({ queues }: { queues: { id: string; title: string; rows: { href: string; label: string; meta: string; status: string }[] }[] }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const activeId = picked && queues.some((queue) => queue.id === picked) ? picked : (queues.find((queue) => queue.rows.length > 0)?.id ?? queues[0]?.id);
  const active = queues.find((queue) => queue.id === activeId) ?? queues[0];
  if (!active) return null;
  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">{t("arcadeOps.needsAttention")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("arcadeOps.attentionHint")}</p>
      </div>
      <PillTabScroller label={t("arcadeOps.needsAttention")}>
        {queues.map((queue) => {
          const Icon = ATTENTION_ICONS[queue.id] ?? AlertTriangle;
          return (
            <button key={queue.id} type="button" aria-pressed={queue.id === active.id} className={pillTabItemClass(queue.id === active.id)} onClick={() => setPicked(queue.id)}>
              <Icon aria-hidden />
              {queue.title}
            </button>
          );
        })}
      </PillTabScroller>
      <ul className="grid gap-2">
        {active.rows.length === 0 ? <li className="text-sm text-muted-foreground">{t("arcadeOps.none")}</li> : null}
        {active.rows.map((row) => (
          <li key={row.href}>
            <Link href={row.href} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="min-w-0">
                <span className="block font-medium">{row.label}</span>
                <span className="mt-0.5 block truncate text-muted-foreground">{row.meta}</span>
              </span>
              <StatusBadge status={row.status} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
