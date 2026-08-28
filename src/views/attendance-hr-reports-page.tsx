"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { FileBarChart, MapPin, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { AttendanceHrReportsKpiStrip } from "@/components/attendance-hr/attendance-hr-reports-kpi-strip";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttendanceRecordsTable } from "@/components/people/attendance-records-table";
import { useSites } from "@/hooks/queries/useSites";
import {
  getAttendanceHrBootstrap,
  getAttendanceHrDaily,
  purgeAttendanceHrImportedData,
} from "@/lib/attendance-hr.functions";
import { ATTENDANCE_STATUSES } from "@/lib/attendance-hr/constants";
import {
  defaultPayrollPeriod,
  formatPayrollRange,
  monthBounds,
  payrollMonthMatchingBounds,
} from "@/lib/attendance-hr/roster-period";
import {
  attendanceHrToListingSource,
  computeAttendanceHrReportKpis,
  formatAttendanceHrLocation,
  type AttendanceHrReportRow,
} from "@/lib/attendance-hr/report";
import { CANONICAL_LOCATION_CODES, formatLocationLabel, rosterSheetLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

export default function AttendanceHrReportsPage() {
  const { t, i18n } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const setCurrentLocationId = useAppStore((s) => s.setCurrentLocationId);
  const qc = useQueryClient();
  const [{ month, dateFrom: from, dateTo: to }, setPeriod] = useState(() =>
    defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" })),
  );
  const [status, setStatus] = useState("");
  const [staffQ, setStaffQ] = useState("");
  const [staffQDebounced, setStaffQDebounced] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: sites } = useSites();

  useEffect(() => {
    const timer = window.setTimeout(() => setStaffQDebounced(staffQ), 300);
    return () => window.clearTimeout(timer);
  }, [staffQ]);

  const bootstrap = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
    queryFn: () => getAttendanceHrBootstrap(),
    staleTime: STALE.people,
  });

  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "daily", locationId, from, to, status, staffQ: staffQDebounced }),
    queryFn: () =>
      getAttendanceHrDaily({
        locationId: locationId || null,
        dateFrom: from,
        dateTo: to,
        status: status || null,
        staffQ: staffQDebounced.trim() || undefined,
      }),
    staleTime: STALE.people,
    placeholderData: keepPreviousData,
  });

  const locationOptions = useMemo(() => {
    const byCode = new Map<string, { id: string; code: string; name: string }>();
    for (const site of sites ?? []) {
      if (site.status === "active") {
        byCode.set(site.code, { id: site.id, code: site.code, name: site.name });
      }
    }
    for (const site of bootstrap.data?.sites ?? []) {
      const loc = site.location as { id?: string; code?: string; name?: string; status?: string } | null;
      if (!loc?.id || !loc.code || (loc.status && loc.status !== "active")) continue;
      if (!byCode.has(loc.code)) {
        byCode.set(loc.code, { id: loc.id, code: loc.code, name: loc.name ?? loc.code });
      }
    }
    const ordered = CANONICAL_LOCATION_CODES.flatMap((code) => {
      const loc = byCode.get(code);
      return loc ? [loc] : [];
    });
    if (locationId) {
      const current =
        [...byCode.values()].find((loc) => loc.id === locationId) ??
        (sites ?? []).find((site) => site.id === locationId);
      if (current && !ordered.some((loc) => loc.id === current.id)) {
        ordered.push({ id: current.id, code: current.code, name: current.name });
      }
    }
    return ordered;
  }, [sites, bootstrap.data?.sites, locationId]);

  const rows = useMemo(() => (q.data ?? []) as AttendanceHrReportRow[], [q.data]);
  const listingRows = useMemo(
    () => rows.map((row) => attendanceHrToListingSource(row, t("attendanceHr.reports.unmapped"))),
    [rows, t],
  );
  const kpis = useMemo(() => computeAttendanceHrReportKpis(rows), [rows]);

  const selectedLocation = locationOptions.find((loc) => loc.id === locationId);
  const locationLabel = selectedLocation
    ? formatAttendanceHrLocation(selectedLocation.code, selectedLocation.name)
    : t("common.allLocations");

  const exportHref = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (locationId) p.set("locationId", locationId);
    if (status) p.set("status", status);
    if (staffQDebounced.trim()) p.set("staffQ", staffQDebounced.trim());
    return `/api/people/attendance-hr/export?${p.toString()}`;
  }, [from, to, locationId, status, staffQDebounced]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });

  const purgeMut = useMutation({
    mutationFn: () => purgeAttendanceHrImportedData({ locationId: locationId || null }),
    onSuccess: (result) => {
      setConfirmOpen(false);
      if (result.punches + result.summaries + result.files + result.corrections === 0) {
        toast.message(t("attendanceHr.reports.removeAllEmpty"));
      } else {
        toast.success(t("attendanceHr.reports.removeAllToast", { punches: result.punches, summaries: result.summaries }));
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emptyImport = !q.isLoading && rows.length === 0 && !staffQDebounced.trim() && !status;
  const emptyFiltered = !q.isLoading && rows.length === 0 && Boolean(staffQDebounced.trim() || status);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileBarChart}
        kicker={t("attendanceHr.reports.kicker")}
        title={t("attendanceHr.reports.title")}
        subtitle={t("attendanceHr.reports.subtitle")}
      />
      <AttendanceHrNav />

      <NeumorphicCard className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {t("attendanceHr.reports.location")}
          </Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("attendanceHr.reports.location")}>
            <button
              type="button"
              className={cn("filter-chip", !locationId && "filter-chip-active")}
              aria-pressed={!locationId}
              onClick={() => setCurrentLocationId(null)}
            >
              {t("common.allLocations")}
            </button>
            {locationOptions.map((site) => {
              const label = formatLocationLabel(site.code, rosterSheetLabel(site.code, site.name));
              return (
              <button
                key={site.id}
                type="button"
                title={label}
                className={cn("filter-chip max-w-[18rem] truncate", locationId === site.id && "filter-chip-active")}
                aria-pressed={locationId === site.id}
                onClick={() => setCurrentLocationId(site.id)}
              >
                {label}
              </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="attendance-hr-staff-search">{t("attendanceHr.reports.staff")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="attendance-hr-staff-search"
                value={staffQ}
                onChange={(e) => setStaffQ(e.target.value)}
                placeholder={t("attendanceHr.reports.staffSearch")}
                autoComplete="off"
                className="ps-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attendance-hr-month">{t("attendanceHr.reports.month")}</Label>
            <Input
              id="attendance-hr-month"
              type="month"
              value={month}
              onChange={(e) => {
                const ym = e.target.value;
                if (!/^\d{4}-\d{2}$/.test(ym)) return;
                setPeriod({ month: ym, ...monthBounds(ym) });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attendance-hr-from">{t("attendanceHr.reports.from")}</Label>
            <Input
              id="attendance-hr-from"
              type="date"
              value={from}
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
            <Label htmlFor="attendance-hr-to">{t("attendanceHr.reports.to")}</Label>
            <Input
              id="attendance-hr-to"
              type="date"
              value={to}
              onChange={(e) =>
                setPeriod((p) => ({
                  dateFrom: p.dateFrom,
                  dateTo: e.target.value,
                  month: payrollMonthMatchingBounds(p.dateFrom, e.target.value) ?? p.month,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("attendanceHr.import.dateRange")}</Label>
            <p className="py-2 text-sm font-medium">{formatPayrollRange(from, to, i18n.language)}</p>
          </div>
          <div className="min-w-44 space-y-1.5">
            <Label>{t("attendanceHr.reports.status")}</Label>
            <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" ? "" : value)}>
              <SelectTrigger aria-label={t("attendanceHr.reports.status")}>
                <SelectValue placeholder={t("attendanceHr.reports.allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("attendanceHr.reports.allStatuses")}</SelectItem>
                {ATTENDANCE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`attendanceHr.reports.statuses.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <a href={exportHref}>{t("attendanceHr.reports.exportExcel")}</a>
          </Button>
          <Button variant="secondary" asChild>
            <a href={`${exportHref}&format=csv`}>{t("attendanceHr.reports.exportCsv")}</a>
          </Button>
          <Button variant="secondary" asChild>
            <a href={`${exportHref}&format=pdf`}>{t("attendanceHr.reports.exportPdf")}</a>
          </Button>
          <CapabilityGate capability="payroll.view">
            <Button variant="secondary" asChild>
              <Link href="/people/payroll">{t("nav.hrPayroll")}</Link>
            </Button>
          </CapabilityGate>
          <CapabilityGate capability="attendance.import">
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" />
              {t("attendanceHr.reports.removeAll")}
            </Button>
          </CapabilityGate>
        </div>
      </NeumorphicCard>

      <AttendanceHrReportsKpiStrip kpis={kpis} isLoading={q.isLoading} />

      {q.isLoading ? (
        <AttendanceRecordsTable
          rows={[]}
          empty={<p className="text-sm text-muted-foreground">{t("attendanceHr.reports.loading")}</p>}
        />
      ) : emptyImport ? (
        <AttendanceRecordsTable
          rows={[]}
          empty={
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t("attendanceHr.reports.empty")}</p>
              <Button asChild size="sm">
                <Link href="/people/attendance/import">
                  <Upload className="h-4 w-4" />
                  {t("attendanceHr.reports.importCta")}
                </Link>
              </Button>
            </div>
          }
        />
      ) : emptyFiltered ? (
        <AttendanceRecordsTable
          rows={[]}
          empty={<p className="text-sm text-muted-foreground">{t("attendanceHr.reports.emptyFiltered")}</p>}
        />
      ) : (
        <AttendanceRecordsTable rows={listingRows} />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && !purgeMut.isPending && setConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendanceHr.reports.removeAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {locationId
                ? t("attendanceHr.reports.removeAllBodyLocation", { location: locationLabel })
                : t("attendanceHr.reports.removeAllBodyAll")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeMut.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={purgeMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                purgeMut.mutate();
              }}
            >
              {t("attendanceHr.reports.removeAllConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
