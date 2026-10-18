"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CircleCheck,
  Gamepad2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";

import { ArcadeEmpty, arcadeCategoryName, StatusBadge } from "@/components/arcade/ui";
import { FecLoader } from "@/components/fec";
import { pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { Button } from "@/components/ui/button";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { getArcadeContext, getArcadeDashboard, setArcadeListHidden, syncArcadeAlerts } from "@/lib/arcade.functions";
import { getArcadePicture } from "@/lib/arcade-work.functions";
import { uniqueById, uniqueByKey } from "@/lib/arcade/unique-by-id";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";

const ALERTS_FLAG = "arcade-alerts-synced";
const MONTHS = ["current", "previous", "overall"] as const;
type MonthPeriod = (typeof MONTHS)[number];

const HEALTH_TOOLTIP = {
  background: "var(--af-card)",
  border: "1px solid var(--af-line)",
  borderRadius: 12,
  color: "var(--af-ink)",
  fontSize: 12,
};

function signed(value: number) {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${text}` : text;
}

function localDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dueTone(iso: string | null) {
  if (!iso) return "later" as const;
  const day = iso.slice(0, 10);
  const today = localDay(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localDay(tomorrowDate);
  if (day < today) return "over" as const;
  if (day === today) return "today" as const;
  if (day === tomorrow) return "tomorrow" as const;
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  if (day <= localDay(soon)) return "soon" as const;
  return "later" as const;
}

function dueText(iso: string | null, language: string, t: (key: string) => string) {
  if (!iso) return t("arcadeScreens.notRecorded");
  const tone = dueTone(iso);
  if (tone === "today") return t("arcadeFlow.dueToday");
  if (tone === "tomorrow") return t("arcadeFlow.dueTomorrow");
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}

function relativeTime(iso: string | null, language: string) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (abs < 60) return format.format(seconds, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86400), "day");
}

function monthName(iso: string, language: string) {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return iso;
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function ArcadeDashboard() {
  const { t, i18n } = useTranslation();
  const sites = useSites();
  const [siteId, setSiteId] = useState<string | null>(null);
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

  const canManage = usePermission("arcade.manage");
  const data = dashboard.data;
  const kpis = data?.kpis;
  const nameFor = (id: string) => venueTitle(sites.data?.find((site) => site.id === id), t("common.site"));
  const staffLocationId = context.data?.staff?.location_id ?? null;
  const siteRows = uniqueByKey(data?.sites ?? [], (site) => site.location_id);
  const siteLine = staffLocationId
    ? t("arcadeFlow.yourSite", { name: nameFor(staffLocationId) })
    : siteRows.length > 0
      ? t("arcadeFlow.siteCount", { count: siteRows.length })
      : null;

  const selectedSite = siteId ? siteRows.find((site) => site.location_id === siteId) ?? null : null;
  const shown = kpis
    ? selectedSite
      ? {
          total: selectedSite.active_machines,
          working: selectedSite.working,
          underRepair: selectedSite.under_repair,
          outOfService: selectedSite.out_of_service,
          pmDue: selectedSite.pm_due,
          operationalPercent: selectedSite.availability,
          pmCompliance: null as number | null,
        }
      : {
          total: kpis.total,
          working: kpis.working,
          underRepair: kpis.underRepair,
          outOfService: kpis.outOfService,
          pmDue: kpis.pmDue,
          operationalPercent: kpis.operationalPercent,
          pmCompliance: kpis.pmCompliance,
        }
    : null;
  const share = (part: number, total: number) => (total > 0 ? Math.max(0, Math.min(100, Math.round((part / total) * 100))) : 0);
  const dashError = dashboard.isError ? (dashboard.error instanceof Error ? dashboard.error.message : t("arcadeOps.failed")) : null;
  const onSite = <T extends { location_id: string }>(rows: T[]) => (siteId ? rows.filter((row) => row.location_id === siteId) : rows);
  const techName = (id: string | null | undefined) => (id ? context.data?.technicians.find((tech) => tech.id === id)?.full_name ?? null : null);
  const openOrders = uniqueById([
    ...onSite(data?.aged ?? []).map((row) => ({
      id: row.id,
      ticket: row.ticket_number,
      detail: row.description,
      status: row.status,
      severity: row.severity,
      locationId: row.location_id,
      technicianId: row.technician_staff_id,
    })),
    ...onSite(data?.waitingSupplier ?? []).map((row) => ({
      id: row.id,
      ticket: row.ticket_number,
      detail: row.description,
      status: row.status,
      severity: row.severity,
      locationId: row.location_id,
      technicianId: row.technician_staff_id,
    })),
    ...onSite(data?.waitingPart ?? []).map((row) => ({
      id: row.id,
      ticket: row.ticket_number,
      detail: row.description,
      status: row.status,
      severity: row.severity,
      locationId: row.location_id,
      technicianId: row.technician_staff_id,
    })),
    ...onSite(data?.repeats ?? []).map((row) => ({
      id: row.id,
      ticket: row.ticket_number,
      detail: row.description?.trim()
        ? row.description
        : t("arcadeOps.repeatMeta", { category: arcadeCategoryName(t, row.category), count: row.repeat_count }),
      status: row.status,
      severity: row.severity,
      locationId: row.location_id,
      technicianId: row.technician_staff_id,
    })),
  ]);
  const recent = uniqueById(onSite(data?.resolved ?? []));
  const criticalGames = uniqueById(onSite(data?.critical ?? []));
  const schedule = uniqueById(onSite(data?.pmDue ?? []));
  const pmOverdue = selectedSite ? selectedSite.pm_overdue : kpis?.pmOverdue ?? null;
  const todayLabel = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", year: "numeric" }).format(new Date());
  const healthShown = shown
    ? [
        { key: "working", name: t("arcadeFlow.operational"), value: shown.working, fill: "var(--af-success)" },
        { key: "repair", name: t("arcadeOps.underRepair"), value: shown.underRepair, fill: "var(--af-warning)" },
        { key: "out", name: t("arcadeStatus.OUT_OF_SERVICE"), value: shown.outOfService, fill: "var(--af-critical)" },
      ]
    : [
        { key: "working", name: t("arcadeFlow.operational"), value: 0, fill: "var(--af-success)" },
        { key: "repair", name: t("arcadeOps.underRepair"), value: 0, fill: "var(--af-warning)" },
        { key: "out", name: t("arcadeStatus.OUT_OF_SERVICE"), value: 0, fill: "var(--af-critical)" },
      ];
  const plottedShown = shown ? healthShown.filter((slice) => slice.value > 0) : [];
  const missing = !dashError ? "—" : /forbidden/i.test(dashError) ? "Forbidden" : dashError;
  const percentHint = (value: number | null | undefined) => (value == null ? "" : `${value}%`);
  const tiles = [
    { key: "total", icon: Gamepad2, tone: "info" as const, label: t("arcadeFlow.totalGames"), value: shown ? shown.total : missing, bar: shown && shown.total > 0 ? 100 : 0, hint: shown ? t("arcadeOps.fleetCount", { count: shown.total }) : "" },
    { key: "working", icon: CircleCheck, tone: "ok" as const, label: t("arcadeFlow.operational"), value: shown ? shown.working : missing, bar: shown?.operationalPercent ?? 0, hint: percentHint(shown?.operationalPercent) },
    { key: "repair", icon: Wrench, tone: "wait" as const, label: t("arcadeOps.underRepair"), value: shown ? shown.underRepair : missing, bar: shown ? share(shown.underRepair, shown.total) : 0, hint: shown ? percentHint(share(shown.underRepair, shown.total)) : "" },
    { key: "out", icon: AlertTriangle, tone: "bad" as const, label: t("arcadeStatus.OUT_OF_SERVICE"), value: shown ? shown.outOfService : missing, bar: shown ? share(shown.outOfService, shown.total) : 0, hint: shown ? percentHint(share(shown.outOfService, shown.total)) : "" },
    { key: "pm", icon: CalendarDays, tone: "wait" as const, label: t("arcadeFlow.maintenanceDue"), value: shown ? shown.pmDue : missing, bar: shown ? share(shown.pmDue, shown.total) : 0, hint: shown ? percentHint(share(shown.pmDue, shown.total)) : "" },
  ];
  const complianceLines = [
    shown?.pmCompliance != null ? { key: "pm", label: t("arcadeFlow.pmLine"), value: `${shown.pmCompliance}%` } : null,
    pmOverdue != null ? { key: "overdue", label: t("arcadeFlow.overdueLine"), value: String(pmOverdue) } : null,
  ].filter((line): line is { key: string; label: string; value: string } => Boolean(line));

  return (
    <div className="cc-page">
      <header className="cc-head">
        <div>
          {siteLine ? <p className="cc-note">{siteLine}</p> : null}
          <h1>{t("arcadeFlow.commandTitle")}</h1>
          <p>{t("arcadeFlow.commandSubtitle")}</p>
          <p className="cc-links">
            <Link href="/arcade/faults/new">{t("arcadeScreens.reportFault")}</Link>
            {canManage ? <Link href={siteId ? `/arcade/machines/new?locationId=${siteId}` : "/arcade/machines/new"}>{t("arcadeFlow.addGame")}</Link> : null}
          </p>
        </div>
        <time className="cc-date" dateTime={localDay(new Date())}>
          <CalendarDays aria-hidden="true" />
          <span>{t("arcadeFlow.today")}</span>
          <strong>{todayLabel}</strong>
        </time>
      </header>
      {context.data?.isSupervisor ? <p className="cc-note">{t("arcadeSimple.yourChecklist")}</p> : null}
      {context.data?.isTechnician ? <p className="cc-note">{t("arcadeSimple.yourRepair")}</p> : null}
      {dashboard.isLoading ? <FecLoader label={t("arcadeOps.loading")} /> : null}
      <div className="cc-sites" role="list" aria-label={t("arcadeOps.siteHealth")}>
        <button type="button" className={`arcade-chip${!siteId ? " is-current" : ""}`} aria-pressed={!siteId} onClick={() => setSiteId(null)}>
          {t("arcadeFlow.allSites")}
          {shown ? <span className="arcade-chip__count">{shown.total}</span> : null}
        </button>
        {siteRows.map((site) => (
          <button
            key={site.location_id}
            type="button"
            className={`arcade-chip${siteId === site.location_id ? " is-current" : ""}`}
            aria-pressed={siteId === site.location_id}
            onClick={() => setSiteId(site.location_id)}
          >
            {nameFor(site.location_id)}
            <span className="arcade-chip__count">{site.active_machines}</span>
          </button>
        ))}
      </div>
      <div className="cc-kpis">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <article key={tile.key} className={`cc-kpi cc-kpi--${tile.tone}`}>
              <span className="cc-kpi__icon" aria-hidden="true"><Icon /></span>
              <p className="cc-kpi__value">{tile.value}</p>
              <p className="cc-kpi__label">{tile.label}</p>
              <div className="cc-kpi__bar" aria-hidden="true"><span style={{ width: `${tile.bar}%` }} /></div>
              <p className="cc-kpi__hint">{tile.hint}</p>
            </article>
          );
        })}
      </div>
      <div className="cc-split">
        <section className="cc-card">
          <h2>{t("arcadeFlow.machineHealth")}</h2>
          <p className="cc-note">{t("arcadeFlow.healthHint")}</p>
          {dashError && !shown ? <p className="cc-note">{dashError}</p> : null}
          <div className="cc-donut">
            {plottedShown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={plottedShown} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="transparent">
                    {plottedShown.map((slice) => (
                      <Cell key={slice.key} fill={slice.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={HEALTH_TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="cc-donut__hole"><span>{shown ? t("arcadeFlow.healthEmpty") : t("arcadeFlow.insufficient")}</span></p>
            )}
            {plottedShown.length > 0 ? (
              <div className="cc-donut__hole">
                <strong>{shown?.total ?? "—"}</strong>
                <span>{t("arcadeOps.totalMachines")}</span>
              </div>
            ) : null}
          </div>
          <ul className="cc-legend">
            {healthShown.map((slice) => (
              <li key={slice.key}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="arcade-swatch" style={{ background: slice.fill }} />
                  <span className="truncate">{slice.name}</span>
                </span>
                <span className="tabular-nums font-medium">{shown && shown.total > 0 ? `${slice.value} (${share(slice.value, shown.total)}%)` : slice.value}</span>
              </li>
            ))}
            <li>
              <span className="flex min-w-0 items-center gap-2">
                <span className="arcade-swatch" style={{ background: "var(--af-primary)" }} />
                <span className="truncate">{t("arcadeFlow.maintenanceDue")}</span>
              </span>
              <span className="tabular-nums font-medium">{shown ? shown.pmDue : "—"}</span>
            </li>
          </ul>
        </section>
        <section className="cc-card">
          <h2>{t("arcadeFlow.compliance")}</h2>
          {dashError && !shown ? <p className="cc-note">{dashError}</p> : null}
          <div className="cc-comply">
            <div className="arcade-ring cc-ring" style={{ ["--pct" as string]: String(shown?.pmCompliance ?? 0) }} aria-hidden="true">
              <span>{shown?.pmCompliance == null ? "—" : `${shown.pmCompliance}%`}</span>
            </div>
            {complianceLines.length > 0 ? (
              <ul>
                {complianceLines.map((line) => (
                  <li key={line.key}>
                    <span>{line.label}</span>
                    <strong>{line.value}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-note">{t("arcadeFlow.insufficient")}</p>
            )}
          </div>
        </section>
      </div>
      <div className="cc-split">
        <section className="cc-card">
          <div className="cc-card__head">
            <h2>{t("arcadeFlow.recentActivity")}</h2>
            <Link href="/arcade/history">{t("arcadeFlow.viewAll")}</Link>
          </div>
          {dashError && recent.length === 0 && criticalGames.length === 0 ? <p className="cc-note">{dashError}</p> : null}
          {recent.length === 0 && criticalGames.length === 0 && !dashError ? <p className="cc-note">{t("arcadeFlow.activityEmpty")}</p> : null}
          <ul className="cc-activity">
            {criticalGames.map((row) => (
              <li key={`game-${row.id}`}>
                <Link href={`/arcade/machines/${row.id}`} className="cc-act">
                  <span className="cc-act__icon cc-act__icon--bad" aria-hidden="true"><AlertTriangle /></span>
                  <span className="min-w-0">
                    <span className="cc-act__title">{t("arcadeFlow.activityDown", { name: row.name })}</span>
                    <span className="cc-note">{row.asset_code} · {nameFor(row.location_id)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {recent.map((row) => (
              <li key={`fault-${row.id}`}>
                <Link href={`/arcade/faults/${row.id}`} className="cc-act">
                  <span className="cc-act__icon cc-act__icon--ok" aria-hidden="true"><CircleCheck /></span>
                  <span className="min-w-0">
                    <span className="cc-act__title">{t("arcadeFlow.activityResolved", { ticket: row.ticket_number ?? t("arcadeOps.fault") })}</span>
                    <span className="cc-note">{arcadeCategoryName(t, row.category)} · {nameFor(row.location_id)}</span>
                  </span>
                  {relativeTime(row.resolved_at, i18n.language) ? <time className="cc-act__time" dateTime={row.resolved_at ?? undefined}>{relativeTime(row.resolved_at, i18n.language)}</time> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="cc-card">
          <div className="cc-card__head">
            <h2>{t("arcadeFlow.openOrders")}</h2>
            <Link href="/arcade/faults">{t("arcadeFlow.viewAll")}</Link>
          </div>
          {dashError && openOrders.length === 0 ? <p className="cc-note">{dashError}</p> : null}
          {openOrders.length === 0 && !dashError ? <p className="cc-note">{t("arcadeFlow.workEmpty")}</p> : null}
          <div className="cc-orders">
            {openOrders.map((row) => {
              const assignee = techName(row.technicianId);
              return (
                <Link key={row.id} href={`/arcade/faults/${row.id}`} className="cc-order">
                  <span className="cc-order__thumb" aria-hidden="true"><Wrench /></span>
                  <span className="cc-order__main">
                    <span className="cc-order__top">
                      <span className="font-semibold">{row.ticket ?? t("arcadeOps.fault")}</span>
                      {row.severity ? <StatusBadge status={row.severity} /> : null}
                    </span>
                    <span className="cc-order__issue">{row.detail}</span>
                    <span className="cc-note">{nameFor(row.locationId)}</span>
                    <span className="cc-order__foot">
                      <StatusBadge status={row.status} />
                      <span>{assignee ?? t("arcadeScreens.unassigned")}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
      <section className="cc-card">
        <div className="cc-card__head">
          <h2>{t("arcadeFlow.scheduleNext")}</h2>
          <Link href="/arcade/pm">{t("arcadeFlow.viewAll")}</Link>
        </div>
        {dashError && schedule.length === 0 ? <p className="cc-note">{dashError}</p> : null}
        {schedule.length === 0 && !dashError ? <p className="cc-note">{t("arcadeFlow.scheduleEmpty")}</p> : null}
        <div className="arcade-schedule">
          {schedule.map((row) => (
            <article key={row.id} className="arcade-schedule__card">
              <span className={`cc-due cc-due--${dueTone(row.next_pm_on)}`}>{dueText(row.next_pm_on, i18n.language, t)}</span>
              <Link href={`/arcade/machines/${row.id}`} className="font-semibold">{row.name}</Link>
              <Link href={`/arcade/pm?machineId=${row.id}`}>{t("arcadeScreens.completePm")}</Link>
              <span className="cc-note">{nameFor(row.location_id)}</span>
              <StatusBadge status={row.status} />
            </article>
          ))}
        </div>
      </section>
      <MonthCompare
        loading={picture.isLoading}
        error={picture.isError ? (picture.error instanceof Error ? picture.error.message : t("arcadeOps.failed")) : null}
        picture={picture.data}
      />
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
    <section className="arcade-panel">
      <div className="arcade-panel__head">
        <div>
          <h2 className="arcade-panel__title">{t("arcadeSimple.monthTitle")}</h2>
          <p className="arcade-panel__hint">{t("arcadeSimple.monthHint")}</p>
        </div>
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
          <div className="arcade-live">
            <div>
              <p className="arcade-metric__label">{t("arcadeSimple.openNow")}</p>
              <p className="arcade-metric__value">{picture.openRepairsNow}</p>
            </div>
            <p className="max-w-sm text-xs text-muted-foreground">{t("arcadeSimple.liveHint")}</p>
          </div>
        ) : null}
        <div className="arcade-metrics">
          {metrics.map((metric) => (
            <div key={metric.key} className="arcade-metric">
              <span className="arcade-metric__value">
                {counts[metric.key === "opened" ? "repairsOpened" : metric.key === "finished" ? "repairsFinished" : metric.key === "checks" ? "checksRecorded" : "downtimeHours"]}
              </span>
              <span className="arcade-metric__label">{metric.label}</span>
              <span className="arcade-metric__hint">{versus(metric)}</span>
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
    <section className="arcade-stack">
      <div>
        <h2 className="arcade-panel__title">{t("arcadeSimple.locations")}</h2>
        <p className="arcade-panel__hint">{t("arcadeSimple.locationsHint")}</p>
      </div>
      {picture.truncated ? <p className="text-sm text-muted-foreground">{t("arcadeSimple.truncated")}</p> : null}
      {locationIds.length === 0 ? <ArcadeEmpty title={t("arcadeSimple.noLocations")} /> : null}
      {locationIds.map((locationId) => {
        const site = picture.sites.find((row) => row.locationId === locationId);
        const games = gamesByLocation.get(locationId) ?? [];
        const name = nameFor(locationId);
        return (
          <article key={locationId} className="arcade-panel arcade-panel--flush">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--af-line)] px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">
                  <span>{name}</span>
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
        <div className="arcade-panel">
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

