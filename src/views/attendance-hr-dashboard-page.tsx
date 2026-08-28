"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, Suspense, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Building2, ClipboardCheck, Clock, MapPin, Upload, UserX, Users, CalendarRange, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

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
import {
  defaultPayrollPeriod,
  formatPayrollDate,
  monthBounds,
  payrollMonthMatchingBounds,
  payrollMonthOf,
} from "@/lib/attendance-hr/roster-period";
import { formatLocationLabel, formatLocationName, formatLocationRecord } from "@/lib/locations/normalize";
import { retryImport } from "@/lib/retry-import";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

const AttendanceHrTrendsChart = dynamic(
  () =>
    retryImport(() =>
      import("@/components/attendance-hr/attendance-hr-trends-chart").then((m) => m.AttendanceHrTrendsChart),
    ),
  { ssr: false, loading: () => <Skeleton className="h-64 rounded-2xl" /> },
);

const AttendanceHrDashboardChart = dynamic(
  () =>
    retryImport(() =>
      import("@/components/attendance-hr/attendance-hr-dashboard-charts").then((m) => m.AttendanceHrDashboardChart),
    ),
  { ssr: false, loading: () => <Skeleton className="h-64 rounded-2xl" /> },
);

function ymd(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
}

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
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
  const name = formatLocationName(entry.locationName, entry.locationRegion);
  const code = entry.locationCode?.trim() || null;
  if (!name && !code) return null;
  return formatLocationLabel(code, name);
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
  const { t, i18n } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const search = useSearchParams();
  const urlFrom = ymd(search.get("from"));
  const urlTo = ymd(search.get("to"));

  const [{ month, dateFrom, dateTo }, setPeriod] = useState(() => {
    if (urlFrom && urlTo) {
      return {
        month: payrollMonthMatchingBounds(urlFrom, urlTo) ?? payrollMonthOf(urlTo),
        dateFrom: urlFrom,
        dateTo: urlTo,
      };
    }
    return defaultPayrollPeriod(todayYmd());
  });

  const applyMonth = (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    setPeriod({ month: ym, ...monthBounds(ym) });
  };

  const dash = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "dashboard",
      locationId,
      dateFrom,
      dateTo,
      month,
    }),
    queryFn: () =>
      getAttendanceHrDashboard({
        locationId: locationId || null,
        dateFrom,
        dateTo,
        month,
      }),
    staleTime: STALE.people,
  });

  const kpis = dash.data?.kpis;
  const sites = dash.data?.sites ?? [];
  const fromLabel = dateFrom ? formatPayrollDate(dateFrom, i18n.language) : "";
  const toLabel = dateTo ? formatPayrollDate(dateTo, i18n.language) : "";
  const usedImported = Boolean(dash.data?.usedImportedPeriod) && !payrollMonthMatchingBounds(dateFrom, dateTo);

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
              <Label htmlFor="attendance-hr-dashboard-month">{t("attendanceHr.dashboard.month")}</Label>
              <Input
                id="attendance-hr-dashboard-month"
                type="month"
                value={month}
                onChange={(e) => applyMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attendance-hr-dashboard-from">{t("attendanceHr.dashboard.from")}</Label>
              <Input
                id="attendance-hr-dashboard-from"
                type="date"
                value={dateFrom}
                onChange={(e) =>
                  setPeriod((p) => ({
                    dateFrom: e.target.value,
                    dateTo: p.dateTo,
                    month: payrollMonthMatchingBounds(e.target.value, p.dateTo) ?? p.month,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attendance-hr-dashboard-to">{t("attendanceHr.dashboard.to")}</Label>
              <Input
                id="attendance-hr-dashboard-to"
                type="date"
                value={dateTo}
                onChange={(e) =>
                  setPeriod((p) => ({
                    dateFrom: p.dateFrom,
                    dateTo: e.target.value,
                    month: payrollMonthMatchingBounds(p.dateFrom, e.target.value) ?? p.month,
                  }))
                }
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
      {fromLabel && toLabel ? (
        <p className="text-xs text-muted-foreground">
          {usedImported
            ? t("attendanceHr.dashboard.importedPeriodHint", { from: fromLabel, to: toLabel })
            : t("attendanceHr.dashboard.periodHint", { from: fromLabel, to: toLabel })}
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
          label: formatLocationRecord(site),
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
                      <p className="text-sm font-medium" title={formatLocationRecord(site)}>
                        {formatLocationRecord(site)}
                      </p>
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
