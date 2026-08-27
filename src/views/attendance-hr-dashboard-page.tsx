"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, Suspense, type ReactNode } from "react";
import { AlertTriangle, Building2, ClipboardCheck, Clock, MapPin, Upload, UserX, Users, CalendarRange, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AttendanceHrDashboardChart } from "@/components/attendance-hr/attendance-hr-dashboard-charts";
import { AttendanceHrTrendsChart } from "@/components/attendance-hr/attendance-hr-trends-chart";
import { AttendanceHrNav, AttendanceHrSitesHint } from "@/components/attendance-hr/attendance-hr-nav";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttendanceHrDashboard } from "@/lib/attendance-hr.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

function monthBounds(month: string) {
  const ym = month.slice(0, 7);
  const [year, mo] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  return { dateFrom: `${ym}-01`, dateTo: `${ym}-${String(last).padStart(2, "0")}` };
}

function ymd(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
}

type WatchlistEntry = {
  id: string;
  count: number;
  name: string;
  locationName?: string | null;
  locationRegion?: string | null;
  locationCode?: string | null;
};

function watchlistLocationLabel(entry: WatchlistEntry): string | null {
  const name = entry.locationName?.trim() || null;
  const region = entry.locationRegion?.trim() || null;
  const code = entry.locationCode?.trim() || null;
  if (name && region) return `${name} · ${region}`;
  return name || code || null;
}

function WatchlistGroup({
  title,
  empty,
  entries,
  pill,
  icon: Icon,
}: {
  title: string;
  empty: string;
  entries: WatchlistEntry[];
  pill: (count: number) => ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/80 px-3 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <WatchlistRow key={entry.id} entry={entry} pill={pill(entry.count)} icon={Icon} />
          ))}
        </div>
      )}
    </div>
  );
}

function WatchlistRow({
  entry,
  pill,
  icon: Icon,
}: {
  entry: WatchlistEntry;
  pill: ReactNode;
  icon: LucideIcon;
}) {
  const location = watchlistLocationLabel(entry);
  return (
    <Link
      href={`/people/staff/${entry.id}`}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-3 py-2.5 hover:bg-secondary/50"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          {location ? (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-xs">{pill}</div>
    </Link>
  );
}

export default function AttendanceHrDashboardPage() {
  return (
    <Suspense fallback={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>}>
      <AttendanceHrDashboardBody />
    </Suspense>
  );
}

function AttendanceHrDashboardBody() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const search = useSearchParams();
  const urlFrom = ymd(search.get("from"));
  const urlTo = ymd(search.get("to"));
  const [monthOverride, setMonthOverride] = useState<string | null>(null);

  const period = useMemo(() => {
    if (monthOverride) return { ...monthBounds(monthOverride), month: monthOverride };
    if (urlFrom && urlTo) return { dateFrom: urlFrom, dateTo: urlTo, month: urlFrom.slice(0, 7) };
    return { dateFrom: undefined as string | undefined, dateTo: undefined as string | undefined, month: undefined as string | undefined };
  }, [monthOverride, urlFrom, urlTo]);

  const dash = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "dashboard",
      locationId,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      month: period.month,
    }),
    queryFn: () =>
      getAttendanceHrDashboard({
        locationId: locationId || null,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        month: period.dateFrom ? undefined : period.month,
      }),
    staleTime: STALE.people,
  });

  const kpis = dash.data?.kpis;
  const sites = dash.data?.sites ?? [];
  const dateFrom = period.dateFrom ?? dash.data?.dateFrom ?? "";
  const dateTo = period.dateTo ?? dash.data?.dateTo ?? "";
  const monthValue = monthOverride ?? dash.data?.month ?? dateFrom.slice(0, 7);
  const periodHint = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "";
  const usedImported = Boolean(dash.data?.usedImportedPeriod) && !monthOverride;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Clock}
        kicker={t("nav.departments.people")}
        title={t("attendanceHr.title", { defaultValue: "Time & Attendance" })}
        subtitle={t("attendanceHr.subtitle", {
          defaultValue: "Combine ZKTeco punches with employee records, flag exceptions, and export HR workbooks.",
        })}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="attendance-hr-dashboard-month">{t("attendanceHr.dashboard.month", { defaultValue: "Month" })}</Label>
              <Input
                id="attendance-hr-dashboard-month"
                type="month"
                value={monthValue}
                onChange={(e) => setMonthOverride(e.target.value || null)}
              />
            </div>
            <Button asChild>
              <Link href="/people/attendance/import">
                <Upload className="h-4 w-4" />
                {t("attendanceHr.importFiles", { defaultValue: "Import files" })}
              </Link>
            </Button>
          </div>
        }
      />
      <AttendanceHrNav />
      <AttendanceHrSitesHint />
      {periodHint ? (
        <p className="text-xs text-muted-foreground">
          {usedImported
            ? t("attendanceHr.dashboard.importedPeriodHint", {
              from: dateFrom,
              to: dateTo,
              defaultValue: "Showing imported period {{from}} – {{to}}.",
            })
            : t("attendanceHr.dashboard.periodHint", {
              from: dateFrom,
              to: dateTo,
              defaultValue: "Tiles are person-days for {{from}} – {{to}}. Unmapped punches stay in Unmatched until Mapping.",
            })}
        </p>
      ) : null}

      {dash.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TintedKpiCard
            title={t("attendanceHr.dashboard.employees", { defaultValue: "Employees" })}
            value={kpis?.employees ?? 0}
            hint={t("attendanceHr.dashboard.employeesHint", { defaultValue: "Active roster at this location" })}
            icon={Users}
            tint="sky"
          />
          <TintedKpiCard
            title={t("attendanceHr.dashboard.present", { defaultValue: "Present" })}
            value={kpis?.present ?? 0}
            hint={t("attendanceHr.dashboard.presentHint", { defaultValue: "Mapped staff with in and out" })}
            icon={Clock}
            tint="green"
          />
          <TintedKpiCard
            title={t("attendanceHr.dashboard.absent", { defaultValue: "Absent" })}
            value={kpis?.absent ?? 0}
            hint={t("attendanceHr.dashboard.absentHint", { defaultValue: "Expected staff with no punch" })}
            icon={UserX}
            tint="red"
          />
          <TintedKpiCard
            title={t("attendanceHr.dashboard.late", { defaultValue: "Late" })}
            value={kpis?.late ?? 0}
            hint={t("attendanceHr.dashboard.lateHint", { defaultValue: "Mapped in after shift start" })}
            icon={AlertTriangle}
            tint="amber"
          />
          <TintedKpiCard
            title={t("attendanceHr.dashboard.missedPunches", { defaultValue: "Missed punches" })}
            value={kpis?.missedPunches ?? 0}
            hint={t("attendanceHr.dashboard.missedHint", { defaultValue: "Mapped in without out, or out without in" })}
            icon={ClipboardCheck}
            tint="orange"
          />
          <TintedKpiCard
            title={t("attendanceHr.dashboard.unmatched", { defaultValue: "Unmatched User IDs" })}
            value={kpis?.unmatched ?? 0}
            hint={t("attendanceHr.dashboard.unmatchedHint", { defaultValue: "Not counted as Present until mapped" })}
            icon={Users}
            tint="slate"
            href="/people/attendance/mapping"
          />
          <TintedKpiCard
            title={t("attendanceHr.dashboard.pendingCorrections", { defaultValue: "Pending corrections" })}
            value={kpis?.pendingCorrections ?? 0}
            icon={ClipboardCheck}
            tint="sky"
            href="/people/attendance/corrections"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TintedKpiCard
          title={t("attendanceHr.dashboard.history")}
          value={dash.data?.trends?.history.present ?? 0}
          hint={t("attendanceHr.dashboard.historyHint")}
          icon={CalendarRange}
          tint="slate"
        />
        <TintedKpiCard
          title={t("attendanceHr.dashboard.currentVisits")}
          value={dash.data?.trends?.current.visits ?? 0}
          hint={t("attendanceHr.dashboard.currentVisitsHint")}
          icon={MapPin}
          tint="sky"
          href="/people/attendance/field"
        />
        <TintedKpiCard
          title={t("attendanceHr.dashboard.upcomingRoster")}
          value={dash.data?.trends?.upcoming.rostered ?? 0}
          hint={t("attendanceHr.dashboard.upcomingHint")}
          icon={Users}
          tint="green"
        />
      </div>

      <AttendanceHrTrendsChart trends={dash.data?.trends} />

      <AttendanceHrDashboardChart
        sites={sites.map((site) => ({
          code: site.code,
          in: site.in,
          out: site.out,
          late: site.late,
        }))}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <NeumorphicCard className="p-5">
          <h2 className="mb-3 text-sm font-semibold">
            {t("attendanceHr.dashboard.bySite", { defaultValue: "Attendance by site" })}
          </h2>
          <div className="space-y-2">
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("attendanceHr.dashboard.noSites", { defaultValue: "No attendance sites yet." })}
              </p>
            ) : (
              sites.map((site) => (
                <Link
                  key={site.locationId}
                  href={`/people/attendance/sites/${site.locationId}`}
                  className="flex items-center justify-between rounded-2xl border border-border/60 px-3 py-2.5 hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{site.name ?? site.locationId}</p>
                      <p className="text-xs text-muted-foreground">{site.region ?? site.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="success">{site.in} {t("attendanceHr.dashboard.in", { defaultValue: "in" })}</Badge>
                    <Badge variant="destructive">{site.out} {t("attendanceHr.dashboard.out", { defaultValue: "out" })}</Badge>
                    <Badge variant="warning">{site.late} {t("attendanceHr.dashboard.late", { defaultValue: "late" })}</Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </NeumorphicCard>
        <NeumorphicCard className="p-5">
          <h2 className="mb-3 text-sm font-semibold">
            {t("attendanceHr.dashboard.watchlist", { defaultValue: "Watchlist" })}
          </h2>
          {(dash.data?.frequentLate ?? []).length === 0 && (dash.data?.frequentMissed ?? []).length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/80 px-3 py-6 text-center text-sm text-muted-foreground">
              {t("attendanceHr.dashboard.watchlistEmpty", { defaultValue: "No one on the watchlist for this period." })}
            </p>
          ) : (
            <div className="space-y-4">
              <WatchlistGroup
                title={t("attendanceHr.dashboard.frequentLate", { defaultValue: "Frequent late" })}
                empty={t("attendanceHr.dashboard.noLate", { defaultValue: "No late pattern yet." })}
                entries={dash.data?.frequentLate ?? []}
                pill={(count) => (
                  <Badge variant="warning">
                    {count} {t("attendanceHr.dashboard.late", { defaultValue: "late" })}
                  </Badge>
                )}
                icon={AlertTriangle}
              />
              <WatchlistGroup
                title={t("attendanceHr.dashboard.frequentMissed", { defaultValue: "Frequent missed punches" })}
                empty={t("attendanceHr.dashboard.noMissed", { defaultValue: "No missed-punch pattern yet." })}
                entries={dash.data?.frequentMissed ?? []}
                pill={(count) => (
                  <Badge variant="destructive">
                    {count} {t("attendanceHr.dashboard.missed", { defaultValue: "Missed" })}
                  </Badge>
                )}
                icon={ClipboardCheck}
              />
            </div>
          )}
        </NeumorphicCard>
      </div>
    </div>
  );
}
