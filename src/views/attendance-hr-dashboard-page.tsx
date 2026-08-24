"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, Suspense } from "react";
import { AlertTriangle, Building2, ClipboardCheck, Clock, Upload, UserX, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AttendanceHrDashboardChart } from "@/components/attendance-hr/attendance-hr-dashboard-charts";
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

type WatchTriple = [string, number, string?];

function monthBounds(month: string) {
  const ym = month.slice(0, 7);
  const [year, mo] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  return { dateFrom: `${ym}-01`, dateTo: `${ym}-${String(last).padStart(2, "0")}` };
}

function ymd(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
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
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("attendanceHr.dashboard.frequentLate", { defaultValue: "Frequent late" })}
          </p>
          <ul className="mb-4 space-y-1 text-sm">
            {(dash.data?.frequentLate ?? []).length === 0 ? (
              <li className="text-muted-foreground">{t("attendanceHr.dashboard.noLate", { defaultValue: "No late pattern yet." })}</li>
            ) : null}
            {(dash.data?.frequentLate ?? []).map((entry) => {
              const [id, n, label] = entry as WatchTriple;
              return (
                <li key={id} className="flex justify-between gap-3">
                  <span className="truncate">{label || id.slice(0, 8)}</span>
                  <span className="shrink-0 tabular-nums">{n} {t("attendanceHr.dashboard.days", { defaultValue: "days" })}</span>
                </li>
              );
            })}
          </ul>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("attendanceHr.dashboard.frequentMissed", { defaultValue: "Frequent missed punches" })}
          </p>
          <ul className="space-y-1 text-sm">
            {(dash.data?.frequentMissed ?? []).length === 0 ? (
              <li className="text-muted-foreground">
                {t("attendanceHr.dashboard.noMissed", { defaultValue: "No missed-punch pattern yet." })}
              </li>
            ) : null}
            {(dash.data?.frequentMissed ?? []).map((entry) => {
              const [id, n, label] = entry as WatchTriple;
              return (
                <li key={id} className="flex justify-between gap-3">
                  <span className="truncate">{label || id.slice(0, 8)}</span>
                  <span className="shrink-0 tabular-nums">{n} {t("attendanceHr.dashboard.days", { defaultValue: "days" })}</span>
                </li>
              );
            })}
          </ul>
        </NeumorphicCard>
      </div>
    </div>
  );
}
