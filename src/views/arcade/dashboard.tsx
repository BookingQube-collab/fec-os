"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Gamepad2 } from "lucide-react";

import { KpiTile, StatusBadge } from "@/components/arcade/ui";
import { FecPageHeader } from "@/components/fec";
import { useSites } from "@/hooks/queries/useSites";
import { getArcadeDashboard, syncArcadeAlerts } from "@/lib/arcade.functions";
import { queryKeys } from "@/lib/query-keys";

function siteName(sites: { id: string; name: string }[] | undefined, id: string) {
  return sites?.find((site) => site.id === id)?.name ?? "Site";
}

export function ArcadeDashboard() {
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
      <FecPageHeader icon={Gamepad2} kicker="Arcade Technical" title="Dashboard" subtitle="Machine health, open faults, and work that needs a technician today." />
      {dashboard.isLoading ? <p className="text-sm text-muted-foreground">Loading operational counts…</p> : null}
      {dashboard.isError ? <p className="text-sm text-destructive">{dashboard.error instanceof Error ? dashboard.error.message : "Dashboard failed"}</p> : null}
      {kpis ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <KpiTile label="Total machines" value={kpis.total} href="/arcade/sites" />
          <KpiTile label="Working" value={kpis.working} />
          <KpiTile label="Down" value={kpis.down} href="/arcade/faults?status=DOWN" />
          <KpiTile label="Under repair" value={kpis.underRepair} />
          <KpiTile label="Under observation" value={kpis.underObservation} href="/arcade/observation" />
          <KpiTile label="Waiting for parts" value={kpis.waitingPart} href="/arcade/parts" />
          <KpiTile label="Waiting for supplier" value={kpis.waitingSupplier} href="/arcade/support" />
          <KpiTile label="PM due" value={kpis.pmDue} href="/arcade/pm" />
          <KpiTile label="PM overdue" value={kpis.pmOverdue} href="/arcade/pm" />
          <KpiTile label="Open faults" value={kpis.openFaults} href="/arcade/faults" />
          <KpiTile label="Repeat faults" value={kpis.repeatFaults} href="/arcade/faults" />
          <KpiTile label="Operational %" value={kpis.operationalPercent ?? "—"} hint={kpis.pmCompliance == null ? "PM compliance needs completed and overdue work" : `PM compliance ${kpis.pmCompliance}%`} />
        </div>
      ) : null}
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Site health</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {(data?.sites ?? []).map((site) => (
            <Link key={site.location_id} href={`/arcade/sites/${site.location_id}`} className="rounded-lg border p-3 hover:bg-muted/40">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{siteName(sites.data, site.location_id)}</p>
                <p className="text-lg font-semibold tabular-nums">{site.availability ?? "—"}%</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {site.active_machines} machines · {site.working} working · {site.under_repair} under repair · {site.waiting_part} waiting part
              </p>
            </Link>
          ))}
          {data && data.sites.length === 0 ? <p className="text-sm text-muted-foreground">No arcade machines yet. Add the first asset from Sites & Games.</p> : null}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Queue title="Critical issues" rows={(data?.critical ?? []).map((row) => ({ href: `/arcade/machines/${row.id}`, label: row.name, meta: row.asset_code, status: row.status }))} />
        <Queue title="Pending more than 7 days" rows={(data?.aged ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? "Fault", meta: row.description, status: row.status }))} />
        <Queue title="Waiting for supplier" rows={(data?.waitingSupplier ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? "Fault", meta: row.description, status: row.status }))} />
        <Queue title="Waiting for parts" rows={(data?.waitingPart ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? "Fault", meta: row.description, status: row.status }))} />
        <Queue title="Repeat failures" rows={(data?.repeats ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? "Fault", meta: `${row.category} · ${row.repeat_count} previous`, status: "REPEAT" }))} />
        <Queue title="PM due" rows={(data?.pmDue ?? []).map((row) => ({ href: `/arcade/machines/${row.id}`, label: row.name, meta: row.next_pm_on ?? "", status: row.status }))} />
        <Queue title="Recently resolved" rows={(data?.resolved ?? []).map((row) => ({ href: `/arcade/faults/${row.id}`, label: row.ticket_number ?? "Fault", meta: row.category, status: "RESOLVED" }))} />
      </div>
    </div>
  );
}

function Queue({ title, rows }: { title: string; rows: { href: string; label: string; meta: string; status: string }[] }) {
  return (
    <section className="rounded-lg border p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-2 grid gap-2">
        {rows.length === 0 ? <li className="text-sm text-muted-foreground">None</li> : null}
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
