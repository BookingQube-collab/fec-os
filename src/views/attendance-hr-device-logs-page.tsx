"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, ScrollText, Search } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSites } from "@/hooks/queries/useSites";
import { getAttendanceHrBootstrap, listAttendanceDeviceLogs } from "@/lib/attendance-hr.functions";
import {
  DEVICE_LOG_PAGE_SIZE,
  deviceLogKpis,
  deviceLogPunchSide,
  deviceLogRawDeviceId,
  formatDeviceLogDate,
} from "@/lib/attendance-hr/device-logs";
import {
  defaultPayrollPeriod,
  formatPayrollRange,
  monthBounds,
  payrollMonthMatchingBounds,
} from "@/lib/attendance-hr/roster-period";
import { formatPunchTime12h } from "@/lib/attendance-display";
import { CANONICAL_LOCATION_CODES, formatLocationLabel, rosterSheetLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

const HEAD_CLASS = "whitespace-nowrap text-xs uppercase tracking-wider";

type DeviceOption = {
  id: string;
  location_id: string;
  device_name: string;
  serial_number?: string | null;
  device_code?: string | null;
};

function dash(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : "—";
}

export default function AttendanceHrDeviceLogsPage() {
  const { t, i18n } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const setCurrentLocationId = useAppStore((s) => s.setCurrentLocationId);
  const [{ month, dateFrom: from, dateTo: to }, setPeriod] = useState(() =>
    defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" })),
  );
  const [deviceId, setDeviceId] = useState("");
  const [qText, setQText] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const { data: sites } = useSites();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startTransition(() => setQDebounced(qText));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [qText]);

  useEffect(() => {
    setPage(1);
  }, [locationId, deviceId, from, to, qDebounced]);

  const bootstrap = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
    queryFn: () => getAttendanceHrBootstrap(),
    staleTime: STALE.people,
  });

  const logs = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "device-logs",
      locationId,
      deviceId,
      from,
      to,
      q: qDebounced,
    }),
    queryFn: () =>
      listAttendanceDeviceLogs({
        locationId: locationId || null,
        deviceId: deviceId || null,
        dateFrom: from,
        dateTo: to,
        q: qDebounced.trim() || undefined,
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

  const deviceOptions = useMemo(() => {
    const list = (bootstrap.data?.devices ?? []) as DeviceOption[];
    return locationId ? list.filter((device) => device.location_id === locationId) : list;
  }, [bootstrap.data?.devices, locationId]);

  useEffect(() => {
    if (!deviceId) return;
    if (!deviceOptions.some((device) => device.id === deviceId)) setDeviceId("");
  }, [deviceId, deviceOptions]);

  const rows = logs.data?.rows ?? [];
  const total = logs.data?.total ?? 0;
  const capped = Boolean(logs.data?.capped);
  const kpis = useMemo(() => deviceLogKpis(rows), [rows]);
  const pages = Math.max(1, Math.ceil(rows.length / DEVICE_LOG_PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * DEVICE_LOG_PAGE_SIZE, page * DEVICE_LOG_PAGE_SIZE);
  const searchBusy = qText !== qDebounced || (logs.isFetching && !logs.isLoading);
  const rowFilterOn = Boolean(qDebounced.trim() || deviceId);
  const empty = !logs.isLoading && !logs.isError && rows.length === 0;

  function punchTimeCell(row: (typeof rows)[number], side: "in" | "out"): string {
    const punchSide = deviceLogPunchSide(row.inOutStatus);
    // Unclassified punches still show a time so the row is not blank.
    const show = punchSide === side || (punchSide == null && side === "in");
    return show ? formatPunchTime12h(row.punchAt) || "—" : "—";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ScrollText}
        kicker={t("attendanceHr.deviceLogs.kicker")}
        title={t("attendanceHr.deviceLogs.title")}
        subtitle={t("attendanceHr.deviceLogs.subtitle")}
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
            <Label htmlFor="attendance-device-log-search">{t("attendanceHr.deviceLogs.search")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="attendance-device-log-search"
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder={t("attendanceHr.deviceLogs.searchPlaceholder")}
                autoComplete="off"
                aria-busy={searchBusy}
                className={cn("ps-9", searchBusy && "pe-9")}
              />
              {searchBusy ? (
                <Loader2
                  className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attendance-device-log-month">{t("attendanceHr.reports.month")}</Label>
            <Input
              id="attendance-device-log-month"
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
            <Label htmlFor="attendance-device-log-from">{t("attendanceHr.reports.from")}</Label>
            <Input
              id="attendance-device-log-from"
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
            <Label htmlFor="attendance-device-log-to">{t("attendanceHr.reports.to")}</Label>
            <Input
              id="attendance-device-log-to"
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
          {deviceOptions.length > 1 ? (
            <div className="min-w-52 space-y-1.5">
              <Label>{t("attendanceHr.deviceLogs.device")}</Label>
              <Select value={deviceId || "all"} onValueChange={(value) => setDeviceId(value === "all" ? "" : value)}>
                <SelectTrigger aria-label={t("attendanceHr.deviceLogs.device")}>
                  <SelectValue placeholder={t("attendanceHr.deviceLogs.allDevices")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("attendanceHr.deviceLogs.allDevices")}</SelectItem>
                  {deviceOptions.map((device) => {
                    const serial = device.serial_number?.trim();
                    const label = serial ? `${device.device_name} · ${serial}` : device.device_name;
                    return (
                      <SelectItem key={device.id} value={device.id}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </NeumorphicCard>

      {logs.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-[1.25rem]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="region" aria-label={t("attendanceHr.deviceLogs.kpiStrip")}>
          <TintedKpiCard
            title={t("attendanceHr.deviceLogs.kpiRecords")}
            value={total}
            hint={capped ? t("attendanceHr.deviceLogs.capped", { shown: rows.length, total }) : undefined}
            tint="sky"
            compact
          />
          <TintedKpiCard
            title={t("attendanceHr.deviceLogs.kpiUsers")}
            value={kpis.deviceUsers}
            hint={capped ? t("attendanceHr.deviceLogs.kpiLoadedHint") : undefined}
            tint="sky"
            compact
          />
          <TintedKpiCard
            title={t("attendanceHr.deviceLogs.kpiDevices")}
            value={kpis.devices}
            hint={capped ? t("attendanceHr.deviceLogs.kpiLoadedHint") : undefined}
            tint="slate"
            compact
          />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface/60 hover:bg-surface/60">
              <TableHead className={HEAD_CLASS}>{t("attendanceHr.deviceLogs.colDeviceId")}</TableHead>
              <TableHead className={HEAD_CLASS}>{t("attendanceHr.deviceLogs.colUserId")}</TableHead>
              <TableHead className={HEAD_CLASS}>{t("attendanceHr.deviceLogs.colName")}</TableHead>
              <TableHead className={HEAD_CLASS}>{t("attendanceHr.deviceLogs.colDate")}</TableHead>
              <TableHead className={HEAD_CLASS}>{t("attendanceHr.deviceLogs.colPunchIn")}</TableHead>
              <TableHead className={HEAD_CLASS}>{t("attendanceHr.deviceLogs.colPunchOut")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  {t("attendanceHr.deviceLogs.loading")}
                </TableCell>
              </TableRow>
            ) : logs.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-destructive">
                  {t("attendanceHr.deviceLogs.loadError")}
                </TableCell>
              </TableRow>
            ) : empty ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  {rowFilterOn ? t("attendanceHr.deviceLogs.emptyFiltered") : t("attendanceHr.deviceLogs.empty")}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {dash(deviceLogRawDeviceId(row))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{dash(row.biometricUserId)}</TableCell>
                  <TableCell className="whitespace-nowrap">{dash(row.deviceUserName)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDeviceLogDate(row.punchAt) || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{punchTimeCell(row, "in")}</TableCell>
                  <TableCell className="whitespace-nowrap">{punchTimeCell(row, "out")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!logs.isLoading && rows.length > DEVICE_LOG_PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>
              {t("common.page", { page, pages })}
              {capped ? ` · ${t("attendanceHr.deviceLogs.capped", { shown: rows.length, total })}` : ` · ${rows.length}`}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("common.prev")}
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        ) : capped && !logs.isLoading ? (
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {t("attendanceHr.deviceLogs.capped", { shown: rows.length, total })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
