"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Gamepad2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { arcadeCategoryName, KpiTile, StatusBadge } from "@/components/arcade/ui";
import { FecPageHeader } from "@/components/fec";
import { useSites } from "@/hooks/queries/useSites";
import { getArcadeDashboard, syncArcadeAlerts } from "@/lib/arcade.functions";
import { queryKeys } from "@/lib/query-keys";

function siteName(sites: { id: string; name: string }[] | undefined, id: string, fallback: string) {
  return sites?.find((site) => site.id === id)?.name ?? fallback;
}

export function ArcadeDashboard() {
  const { t } = useTranslation();
  const sites = useSites();
  const dashboard = useQuery({
    queryKey: queryKeys.arcade.dashboard(null),
    queryFn: () => getArcadeDashboard({}),
  });
  useEffect(() => {
    void syncArcadeAlerts({}).catch(() => undefined);
  }, []);
  const data = dashboard.data;
  const kpis = data?.kpis;
  return (
    <div className="grid gap-4">
      <FecPageHeader icon={Gamepad2} kicker={t("nav.arcade")} title={t("nav.arcadeDashboard")} subtitle={t("arcadeOps.dashboardSubtitle")} />
      {dashboard.isLoading ? <p className="text-sm text-muted-foreground">{t("arcadeOps.loading")}</p> : null}
      {dashboard.isError ? <p className="text-sm text-destructive">{dashboard.error instanceof Error ? dashboard.error.message : t("arcadeOps.failed")}</p> : null}
      {kpis ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <KpiTile label={t("arcadeOps.totalMachines")} value={kpis.total} href="/arcade/sites" />
          <KpiTile label={t("arcadeOps.working")} value={kpis.working} />
          <KpiTile label={t("arcadeOps.down")} value={kpis.down} href="/arcade/faults?status=DOWN" />
          <KpiTile label={t("arcadeOps.underRepair")} value={kpis.underRepair} />
          <KpiTile label={t("arcadeOps.underObservation")} value={kpis.underObservation} href="/arcade/observation" />
          <KpiTile label={t("arcadeOps.waitingParts")} value={kpis.waitingPart} href="/arcade/parts" />
          <KpiTile label={t("arcadeOps.waitingSupplier")} value={kpis.waitingSupplier} href="/arcade/support" />
          <KpiTile label={t("arcadeOps.pmDue")} value={kpis.pmDue} href="/arcade/pm" />
          <KpiTile label={t("arcadeOps.pmOverdue")} value={kpis.pmOverdue} href="/arcade/pm" />
          <KpiTile label={t("arcadeOps.openFaults")} value={kpis.openFaults} href="/arcade/faults" />
          <KpiTile label={t("arcadeOps.repeatFaults")} value={kpis.repeatFaults} href="/arcade/faults" />
          <KpiTile label={t("arcadeOps.operational")} value={kpis.operationalPercent ?? "—"} hint={kpis.pmCompliance == null ? t("arcadeOps.pmHintEmpty") : t("arcadeOps.pmHint", { percent: kpis.pmCompliance })} />
        </div>
      ) : null}
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">{t("arcadeOps.siteHealth")}</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {(data?.sites ?? []).map((site) => (
            <Link key={site.location_id} href={`/arcade/sites/${site.location_id}`} className="rounded-lg border p-3 hover:bg-muted/40">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{siteName(sites.data, site.location_id, t("common.site"))}</p>
                <p className="text-lg font-semibold tabular-nums">{site.availability ?? "—"}%</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("arcadeOps.siteLine", {
                  machines: site.active_machines,
                  working: site.working,
                  repair: site.under_repair,
                  waiting: site.waiting_part,
                })}
              </p>
            </Link>
          ))}
          {data && data.sites.length === 0 ? <p className="text-sm text-muted-foreground">{t("arcadeOps.emptySites")}</p> : null}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Queue title={t("arcadeOps.critical")} empty={t("arcadeOps.none")} rows={(data?.critical ?? []).map((row) => ({ href: `/arcade/machines/${row.id}`, label: row.name, meta: row.asset_code, status: row.status }))} />
        <Queue title={t("arcadeOps.aged")} empty={t("arcadeOps.none")} rows={(data?.aged ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: row.description, status: row.status }))} />
        <Queue title={t("arcadeOps.waitingSupplier")} empty={t("arcadeOps.none")} rows={(data?.waitingSupplier ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: row.description, status: row.status }))} />
        <Queue title={t("arcadeOps.waitingParts")} empty={t("arcadeOps.none")} rows={(data?.waitingPart ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: row.description, status: row.status }))} />
        <Queue title={t("arcadeOps.repeats")} empty={t("arcadeOps.none")} rows={(data?.repeats ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: t("arcadeOps.repeatMeta", { category: arcadeCategoryName(t, row.category), count: row.repeat_count }), status: "REPEAT" }))} />
        <Queue title={t("arcadeOps.pmDue")} empty={t("arcadeOps.none")} rows={(data?.pmDue ?? []).map((row) => ({ href: `/arcade/machines/${row.id}`, label: row.name, meta: row.next_pm_on ?? "", status: row.status }))} />
        <Queue title={t("arcadeOps.resolved")} empty={t("arcadeOps.none")} rows={(data?.resolved ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? t("arcadeOps.fault"), meta: arcadeCategoryName(t, row.category), status: "RESOLVED" }))} />
      </div>
    </div>
  );
}

function Queue({ title, empty, rows }: { title: string; empty: string; rows: { href: string; label: string; meta: string; status: string }[] }) {
  return (
    <section className="rounded-lg border p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-2 grid gap-2">
        {rows.length === 0 ? <li className="text-sm text-muted-foreground">{empty}</li> : null}
        {rows.map((row) => (
          <li key={row.href + row.label}>
            <Link href={row.href} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">{row.label}</span>
                <span className="mt-0.5 block text-muted-foreground">{row.meta}</span>
              </span>
              <StatusBadge status={row.status} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
