"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Loader2, RefreshCw, Search, Settings, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { PageHeader } from "@/components/layout/page-header";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { isAdmsDeviceOnline } from "@/lib/attendance-hr/constants";
import { qatarTodayYmd } from "@/lib/attendance-hr/dashboard";
import type { AttendanceGapReport } from "@/lib/attendance-hr/gap-check";
import { defaultPayrollPeriod, formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import {
  checkAttendancePunchGaps,
  getAttendanceHrBootstrap,
  requestAttendanceDeviceFetch,
  resyncAttendancePunches,
  saveAttendanceDevice,
  saveAttendanceShiftTemplate,
  type ResyncFetchSkipReason,
} from "@/lib/attendance-hr.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import Link from "next/link";

type DeviceRow = {
  id: string;
  location_id: string;
  device_code: string;
  device_name: string;
  serial_number?: string | null;
  last_sync_at?: string | null;
  last_adms_at?: string | null;
  last_adms_error?: string | null;
  connection_mode?: string | null;
  adms_pending_cmd?: string | null;
  adms_cmd_queued_at?: string | null;
  adms_attlog_stamp?: string | null;
};

type ResyncMode = "fec_month" | "dates";

function isLocalDevHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || h.startsWith("localhost:");
}

function formatAdmsWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" });
}

function hostFromOrigin(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin.replace(/^https?:\/\//, "").split("/")[0] ?? origin;
  }
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function parseDatesInput(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part)),
    ),
  ].sort();
}

export default function AttendanceHrSettingsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
    queryFn: () => getAttendanceHrBootstrap(),
    staleTime: STALE.people,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = hostFromOrigin(origin);
  const admsHost = isLocalDevHost(host) ? "e3fec.vercel.app" : host;
  const pushPath = `${origin}/iclock`;
  const [deviceName, setDeviceName] = useState("ZKTeco Device 2");
  const [deviceCode, setDeviceCode] = useState("ZK-2");
  const [deviceSn, setDeviceSn] = useState("");
  const [locationId, setLocationId] = useState("");
  const [snDrafts, setSnDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});

  const defaultMonth = defaultPayrollPeriod(qatarTodayYmd()).month;
  const [resyncLocationId, setResyncLocationId] = useState("");
  const [resyncDeviceId, setResyncDeviceId] = useState("");
  const [resyncMode, setResyncMode] = useState<ResyncMode>("fec_month");
  const [resyncMonth, setResyncMonth] = useState(defaultMonth);
  const [resyncDatesText, setResyncDatesText] = useState("2026-08-08, 2026-08-18");
  const [gapReport, setGapReport] = useState<AttendanceGapReport | null>(null);
  const [resyncBusyKind, setResyncBusyKind] = useState<"check" | "reprocess" | "fetch" | null>(null);

  const fetchSkipMessage = (reason: ResyncFetchSkipReason | string | null | undefined) => {
    if (reason === "no_serial") return t("attendanceHr.settings.resyncNoSerial");
    if (reason === "device_offline") return t("attendanceHr.settings.resyncDeviceOffline");
    if (typeof reason === "string" && reason.trim()) return reason;
    return null;
  };

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of q.data?.sites ?? []) {
      const loc = s.location as { name?: string; code?: string } | null;
      map.set(s.location_id, loc ? formatLocationLabel(loc.code, loc.name) : s.location_id);
    }
    return map;
  }, [q.data?.sites]);

  const resyncDevices = useMemo(
    () =>
      ((q.data?.devices ?? []) as DeviceRow[]).filter(
        (d) => !resyncLocationId || d.location_id === resyncLocationId,
      ),
    [q.data?.devices, resyncLocationId],
  );

  const selectedResyncDevice = useMemo(
    () => resyncDevices.find((d) => d.id === resyncDeviceId) ?? null,
    [resyncDevices, resyncDeviceId],
  );

  const saveDev = useMutation({
    mutationFn: () =>
      saveAttendanceDevice({
        locationId,
        deviceCode,
        deviceName,
        vendor: "zkteco",
        serialNumber: deviceSn.trim() || null,
        connectionMode: deviceSn.trim() ? "adms" : "file",
      }),
    onSuccess: () => {
      toast.success(t("attendanceHr.settings.deviceSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveSn = useMutation({
    mutationFn: (device: DeviceRow) =>
      saveAttendanceDevice({
        id: device.id,
        locationId: device.location_id,
        deviceCode: device.device_code,
        deviceName: (nameDrafts[device.id] ?? device.device_name).trim() || device.device_name,
        vendor: "zkteco",
        serialNumber: (snDrafts[device.id] ?? device.serial_number ?? "").trim() || null,
        connectionMode: (snDrafts[device.id] ?? device.serial_number ?? "").trim() ? "adms" : "file",
      }),
    onSuccess: () => {
      toast.success(t("attendanceHr.settings.snSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveName = useMutation({
    mutationFn: (device: DeviceRow) => {
      const nextName = (nameDrafts[device.id] ?? device.device_name).trim();
      if (!nextName) throw new Error(t("attendanceHr.settings.nameRequired"));
      return saveAttendanceDevice({
        id: device.id,
        locationId: device.location_id,
        deviceCode: device.device_code,
        deviceName: nextName,
        vendor: "zkteco",
        serialNumber: (snDrafts[device.id] ?? device.serial_number ?? "").trim() || null,
        connectionMode: (snDrafts[device.id] ?? device.serial_number ?? "").trim() ? "adms" : "file",
      });
    },
    onSuccess: () => {
      toast.success(t("attendanceHr.settings.nameSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fetchDev = useMutation({
    mutationFn: (device: DeviceRow) => requestAttendanceDeviceFetch({ deviceId: device.id, hours: 48 }),
    onSuccess: () => {
      toast.success(t("attendanceHr.settings.fetchQueued"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveShift = useMutation({
    mutationFn: () => {
      const companyId = q.data?.companies[0]?.id;
      if (!companyId) throw new Error(t("attendanceHr.settings.noCompany"));
      return saveAttendanceShiftTemplate({
        companyId,
        name: "Ramadan",
        startTime: "09:00",
        endTime: "16:00",
        overnight: false,
        graceMinutes: 15,
        breakMinutes: 30,
        minWorkMinutes: 360,
        overtimeAfterMinutes: 360,
      });
    },
    onSuccess: () => toast.success(t("attendanceHr.settings.shiftSaved")),
    onError: (e: Error) => toast.error(e.message),
  });

  const buildResyncPayload = () => {
    if (!resyncLocationId) throw new Error(t("attendanceHr.settings.resyncNeedSite"));
    if (resyncMode === "fec_month") {
      return {
        locationId: resyncLocationId,
        mode: "fec_month" as const,
        month: resyncMonth,
        deviceId: resyncDeviceId || null,
      };
    }
    const dates = parseDatesInput(resyncDatesText);
    if (!dates.length) throw new Error(t("attendanceHr.settings.resyncNeedDates"));
    return {
      locationId: resyncLocationId,
      mode: "dates" as const,
      dates,
      deviceId: resyncDeviceId || null,
    };
  };

  const assertClientFetchReady = (fetchFromDevice: boolean) => {
    if (!fetchFromDevice) return;
    if (resyncDeviceId && selectedResyncDevice) {
      const sn = String(selectedResyncDevice.serial_number ?? "").trim();
      if (!sn) throw new Error(t("attendanceHr.settings.resyncNoSerial"));
      return;
    }
    const anySn = resyncDevices.some((d) => String(d.serial_number ?? "").trim());
    if (!anySn) throw new Error(t("attendanceHr.settings.resyncNoSerial"));
  };

  const checkGaps = useMutation({
    mutationFn: async () => {
      setResyncBusyKind("check");
      try {
        const result = await checkAttendancePunchGaps(buildResyncPayload());
        if (!result.ok) throw new Error(result.error);
        return result.data;
      } finally {
        setResyncBusyKind(null);
      }
    },
    onSuccess: (report) => {
      setGapReport(report);
      if (report.totals.gaps === 0) {
        toast.success(t("attendanceHr.settings.gapsNone"));
      } else {
        toast.message(t("attendanceHr.settings.gapsFound", { count: report.totals.gaps }));
      }
    },
    onError: (e: Error) => toast.error(e.message || t("attendanceHr.settings.resyncFailed")),
  });

  const resyncMut = useMutation({
    mutationFn: async (opts: { reprocessStored: boolean; fetchFromDevice: boolean }) => {
      setResyncBusyKind(opts.fetchFromDevice ? "fetch" : "reprocess");
      try {
        assertClientFetchReady(opts.fetchFromDevice);
        const result = await resyncAttendancePunches({ ...buildResyncPayload(), ...opts });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      } finally {
        setResyncBusyKind(null);
      }
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
      const skipMsg = fetchSkipMessage(result.fetchSkippedReason);
      if (skipMsg) toast.warning(skipMsg);
      if (result.fetchQueued) {
        toast.success(t("attendanceHr.settings.resyncFetchQueued"));
      } else if (result.reprocessed > 0) {
        toast.success(t("attendanceHr.settings.resyncReprocessed", { count: result.reprocessed }));
      } else if (!skipMsg) {
        toast.success(t("attendanceHr.settings.resyncDone"));
      }
      void checkGaps.mutateAsync().catch(() => undefined);
    },
    onError: (e: Error) => toast.error(e.message || t("attendanceHr.settings.resyncFailed")),
  });

  const gapKindLabel = (kind: string) => {
    if (kind === "all_punches_excluded") return t("attendanceHr.settings.gapKindExcluded");
    if (kind === "missed_punch") return t("attendanceHr.settings.gapKindMissed");
    if (kind === "no_in") return t("attendanceHr.settings.gapKindNoIn");
    return t("attendanceHr.settings.gapKindAbsent");
  };

  const resyncBusy = checkGaps.isPending || resyncMut.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        kicker={t("attendanceHr.settings.kicker")}
        title={t("attendanceHr.settings.title")}
        subtitle={t("attendanceHr.settings.subtitle")}
      />
      <AttendanceHrNav />

      <NeumorphicCard className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">{t("attendanceHr.settings.siteTimingTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("attendanceHr.settings.siteTimingMoved")}</p>
        <Button asChild size="sm" variant="secondary">
          <Link href="/people/hr/shift-policy">{t("attendanceHr.settings.openSiteWorkingHours")}</Link>
        </Button>
      </NeumorphicCard>

      <NeumorphicCard className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <Wifi className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">{t("attendanceHr.settings.admsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("attendanceHr.settings.admsHelp")}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("attendanceHr.settings.serverAddress")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={host} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyText(host).then(() => toast.success(t("attendanceHr.settings.copied")))}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("attendanceHr.settings.serverPort")}</Label>
            <div className="flex gap-2">
              <Input readOnly value="443" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyText("443").then(() => toast.success(t("attendanceHr.settings.copied")))}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("attendanceHr.settings.pushUrlHint", { url: pushPath })}
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("attendanceHr.settings.stepWifi")}</li>
          <li>{t("attendanceHr.settings.stepMenu")}</li>
          <li>{t("attendanceHr.settings.stepDomain")}</li>
          <li>{t("attendanceHr.settings.stepAddress", { host })}</li>
          <li>{t("attendanceHr.settings.stepPort")}</li>
          <li>{t("attendanceHr.settings.stepHttps")}</li>
          <li>{t("attendanceHr.settings.stepSn")}</li>
        </ol>
        <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.securityHint")}</p>
        {isLocalDevHost(host) ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
            {t("attendanceHr.settings.localhostWarning")}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.hourlyHelp")}</p>
      </NeumorphicCard>

      <NeumorphicCard className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">{t("attendanceHr.settings.resyncTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("attendanceHr.settings.resyncHelp")}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.resyncArchitecture")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("attendanceHr.settings.resyncSite")}</Label>
            <SearchableSelect
              value={resyncLocationId}
              onValueChange={(v) => {
                setResyncLocationId(v);
                setResyncDeviceId("");
                setGapReport(null);
              }}
              placeholder={t("attendanceHr.settings.selectSite")}
              emptyOption={{ value: "", label: t("attendanceHr.settings.selectSite") }}
              options={(q.data?.sites ?? []).map((s) => {
                const loc = s.location as { name?: string; code?: string } | null;
                return {
                  value: s.location_id,
                  label: loc ? formatLocationLabel(loc.code, loc.name) : s.location_id,
                  keywords: `${loc?.code ?? ""} ${loc?.name ?? ""}`,
                };
              })}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("attendanceHr.settings.resyncDevice")}</Label>
            <SearchableSelect
              value={resyncDeviceId}
              onValueChange={setResyncDeviceId}
              placeholder={t("attendanceHr.settings.resyncDeviceAny")}
              emptyOption={{ value: "", label: t("attendanceHr.settings.resyncDeviceAny") }}
              options={resyncDevices.map((d) => ({
                value: d.id,
                label: `${d.device_name} · ${d.device_code}`,
                keywords: `${d.serial_number ?? ""} ${d.device_code}`,
              }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("attendanceHr.settings.resyncMode")}>
          <button
            type="button"
            className={`filter-chip ${resyncMode === "fec_month" ? "filter-chip-active" : ""}`}
            aria-pressed={resyncMode === "fec_month"}
            onClick={() => setResyncMode("fec_month")}
          >
            {t("attendanceHr.settings.resyncModeMonth")}
          </button>
          <button
            type="button"
            className={`filter-chip ${resyncMode === "dates" ? "filter-chip-active" : ""}`}
            aria-pressed={resyncMode === "dates"}
            onClick={() => setResyncMode("dates")}
          >
            {t("attendanceHr.settings.resyncModeDates")}
          </button>
        </div>
        {resyncMode === "fec_month" ? (
          <div className="max-w-xs space-y-1">
            <Label htmlFor="resync-month">{t("attendanceHr.settings.resyncMonth")}</Label>
            <Input
              id="resync-month"
              type="month"
              value={resyncMonth}
              onChange={(e) => setResyncMonth(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("attendanceHr.settings.resyncMonthHint", {
                range: formatPayrollRange(
                  defaultPayrollPeriod(`${resyncMonth}-15`).dateFrom,
                  defaultPayrollPeriod(`${resyncMonth}-15`).dateTo,
                  i18n.language,
                ),
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="resync-dates">{t("attendanceHr.settings.resyncDates")}</Label>
            <Input
              id="resync-dates"
              value={resyncDatesText}
              onChange={(e) => setResyncDatesText(e.target.value)}
              placeholder={t("attendanceHr.settings.resyncDatesPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.resyncDatesHint")}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={resyncBusy || !resyncLocationId}
            onClick={() => checkGaps.mutate()}
          >
            {resyncBusyKind === "check" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-1 h-4 w-4" />
            )}
            {resyncBusyKind === "check"
              ? t("attendanceHr.settings.checkingGaps")
              : t("attendanceHr.settings.checkGaps")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={resyncBusy || !resyncLocationId}
            title={t("attendanceHr.settings.reprocessStoredHint")}
            onClick={() => resyncMut.mutate({ reprocessStored: true, fetchFromDevice: false })}
          >
            {resyncBusyKind === "reprocess" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            {resyncBusyKind === "reprocess"
              ? t("attendanceHr.settings.reprocessing")
              : t("attendanceHr.settings.reprocessStored")}
          </Button>
          <Button
            type="button"
            disabled={resyncBusy || !resyncLocationId}
            onClick={() => resyncMut.mutate({ reprocessStored: true, fetchFromDevice: true })}
          >
            {resyncBusyKind === "fetch" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            {resyncBusyKind === "fetch"
              ? t("attendanceHr.settings.fetchingFromDevice")
              : t("attendanceHr.settings.resyncFromDevice")}
          </Button>
        </div>
        {resyncBusy ? (
          <p
            className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-950 dark:text-sky-100"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            {resyncBusyKind === "check"
              ? t("attendanceHr.settings.checkingGaps")
              : resyncBusyKind === "reprocess"
                ? t("attendanceHr.settings.reprocessing")
                : t("attendanceHr.settings.fetchingFromDevice")}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.reprocessStoredHint")}</p>
        {gapReport ? (
          <div className="space-y-3 rounded-2xl border px-4 py-3">
            {gapReport.totals.gaps === 0 ? (
              <p className="text-sm text-muted-foreground">{t("attendanceHr.settings.gapsNoneDetail")}</p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {t("attendanceHr.settings.gapsPrompt", { count: gapReport.totals.gaps })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("attendanceHr.settings.gapsBreakdown", {
                    excluded: gapReport.totals.allExcluded,
                    absent: gapReport.totals.absentRostered,
                    missed: gapReport.totals.missedPunch,
                  })}
                </p>
                {gapReport.reprocessLikelyHelps ? (
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {t("attendanceHr.settings.gapsReprocessHint")}
                  </p>
                ) : null}
                {gapReport.deviceFetchLikelyHelps ? (
                  <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.gapsFetchHint")}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={resyncBusy}
                    onClick={() =>
                      resyncMut.mutate({
                        reprocessStored: true,
                        fetchFromDevice: gapReport.deviceFetchLikelyHelps,
                      })
                    }
                  >
                    {resyncBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    {t("attendanceHr.settings.gapsAskResync")}
                  </Button>
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                  {gapReport.gaps.slice(0, 40).map((gap) => (
                    <li key={`${gap.workDate}-${gap.staffId ?? gap.biometricUserId ?? "x"}-${gap.kind}`}>
                      <span className="font-medium">{gap.workDate}</span>
                      {" · "}
                      {gap.staffName ?? gap.biometricUserId ?? "—"}
                      {" · "}
                      {gapKindLabel(gap.kind)}
                      {gap.rawPunchCount > 0
                        ? ` · ${t("attendanceHr.settings.gapPunches", {
                            raw: gap.rawPunchCount,
                            valid: gap.validPunchCount,
                          })}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </NeumorphicCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <NeumorphicCard className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">{t("attendanceHr.settings.devices")}</h2>
          {(q.data?.devices ?? []).map((raw) => {
            const src = raw as DeviceRow;
            const d: DeviceRow = {
              id: src.id,
              location_id: src.location_id,
              device_code: src.device_code,
              device_name: src.device_name,
              serial_number: src.serial_number == null ? null : String(src.serial_number),
              last_sync_at: src.last_sync_at,
              last_adms_at: src.last_adms_at == null ? null : String(src.last_adms_at),
              last_adms_error: src.last_adms_error == null ? null : String(src.last_adms_error),
              connection_mode: src.connection_mode == null ? null : String(src.connection_mode),
              adms_pending_cmd: src.adms_pending_cmd == null ? null : String(src.adms_pending_cmd),
              adms_cmd_queued_at: src.adms_cmd_queued_at == null ? null : String(src.adms_cmd_queued_at),
              adms_attlog_stamp: src.adms_attlog_stamp == null ? null : String(src.adms_attlog_stamp),
            };
            const savedSerial = (d.serial_number ?? "").trim();
            const lastContact = formatAdmsWhen(d.last_adms_at);
            const lastPunch = d.adms_attlog_stamp ? formatAdmsWhen(d.last_sync_at) : null;
            const fetchPending = Boolean(d.adms_pending_cmd?.trim());
            const fetchDelivered = Boolean(d.adms_cmd_queued_at) && !fetchPending;
            const online = Boolean(savedSerial) && isAdmsDeviceOnline(d.last_adms_at);
            const hasSn = Boolean(savedSerial);
            const fetchDisabled = fetchDev.isPending || !savedSerial || !online;
            const nameDraft = nameDrafts[d.id] ?? d.device_name;
            return (
              <div
                key={d.id}
                className={cn(
                  "space-y-2 rounded-2xl border px-3 py-3 transition-colors",
                  online
                    ? "border-emerald-500 bg-background shadow-[inset_0_0_0_1px_rgba(16,185,129,0.25)]"
                    : hasSn
                      ? "border-amber-400/70 bg-amber-50/80 dark:border-amber-500/50 dark:bg-amber-950/30"
                      : "border-border/70 bg-muted/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    {d.device_name} · {d.device_code}
                  </p>
                  {hasSn ? (
                    <Badge variant={online ? "success" : "warning"}>
                      {online ? t("attendanceHr.settings.deviceOnline") : t("attendanceHr.settings.deviceOffline")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t("attendanceHr.settings.deviceNoSerial")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {siteNameById.get(d.location_id) ?? d.location_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("attendanceHr.settings.lastAdmsContact")}:{" "}
                  {lastContact ?? t("attendanceHr.settings.never")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("attendanceHr.settings.lastPunchUpload")}: {lastPunch ?? t("attendanceHr.settings.never")}
                </p>
                {fetchPending ? (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    {t("attendanceHr.settings.fetchPendingPoll", { when: formatAdmsWhen(d.adms_cmd_queued_at) ?? "" })}
                  </p>
                ) : null}
                {fetchDelivered ? (
                  <p className="text-xs font-medium text-sky-800 dark:text-sky-200">
                    {t("attendanceHr.settings.fetchDeliveredWaitingUpload")}
                  </p>
                ) : null}
                {d.last_adms_error ? (
                  <p className="text-xs text-destructive">
                    {t("attendanceHr.settings.lastAdmsError")}: {d.last_adms_error}
                  </p>
                ) : null}
                {!savedSerial ? (
                  <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.noSerialHint")}</p>
                ) : null}
                <Label htmlFor={`device-name-${d.id}`}>{t("attendanceHr.settings.name")}</Label>
                <div className="flex gap-2">
                  <Input
                    id={`device-name-${d.id}`}
                    value={nameDraft}
                    onChange={(e) => setNameDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    placeholder={t("attendanceHr.settings.namePlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saveName.isPending || !nameDraft.trim() || nameDraft.trim() === d.device_name}
                    onClick={() => saveName.mutate(d)}
                  >
                    {saveName.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    {t("attendanceHr.settings.saveName")}
                  </Button>
                </div>
                <Label htmlFor={`device-sn-${d.id}`}>{t("attendanceHr.settings.serialNumber")}</Label>
                <div className="flex gap-2">
                  <Input
                    id={`device-sn-${d.id}`}
                    value={snDrafts[d.id] ?? d.serial_number ?? ""}
                    onChange={(e) => setSnDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    placeholder={t("attendanceHr.settings.serialPlaceholder")}
                  />
                  <Button
                    variant="secondary"
                    disabled={saveSn.isPending}
                    onClick={() => saveSn.mutate(d)}
                  >
                    {t("attendanceHr.settings.saveSn")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={fetchDisabled}
                    title={
                      !savedSerial
                        ? t("attendanceHr.settings.noSerialHint")
                        : !online
                          ? t("attendanceHr.settings.fetchDisabledOffline")
                          : undefined
                    }
                    onClick={() => fetchDev.mutate(d)}
                  >
                    {fetchDev.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-4 w-4" />
                    )}
                    {t("attendanceHr.settings.fetchNow")}
                  </Button>
                </div>
                {savedSerial && !online ? (
                  <p className="text-xs text-muted-foreground">
                    {t("attendanceHr.settings.fetchOfflineHint", { host: admsHost })}
                  </p>
                ) : savedSerial ? (
                  <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.fetchHelp")}</p>
                ) : null}
              </div>
            );
          })}
          <Label>{t("attendanceHr.settings.site")}</Label>
          <SearchableSelect
            value={locationId}
            onValueChange={setLocationId}
            placeholder={t("attendanceHr.settings.selectSite")}
            emptyOption={{ value: "", label: t("attendanceHr.settings.selectSite") }}
            options={(q.data?.sites ?? []).map((s) => {
              const loc = s.location as { name?: string; code?: string } | null;
              return {
                value: s.location_id,
                label: loc?.name ?? s.location_id,
                keywords: `${loc?.code ?? ""} ${loc?.name ?? ""}`,
              };
            })}
          />
          <Label>{t("attendanceHr.settings.newDeviceCode")}</Label>
          <Input value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)} />
          <Label>{t("attendanceHr.settings.name")}</Label>
          <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          <Label>{t("attendanceHr.settings.serialNumber")}</Label>
          <Input
            value={deviceSn}
            onChange={(e) => setDeviceSn(e.target.value)}
            placeholder={t("attendanceHr.settings.serialPlaceholder")}
          />
          <Button disabled={saveDev.isPending || !locationId} onClick={() => saveDev.mutate()}>
            {t("attendanceHr.settings.addDevice")}
          </Button>
        </NeumorphicCard>
        <NeumorphicCard className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">{t("attendanceHr.settings.shifts")}</h2>
          {(q.data?.shifts ?? []).map((s) => (
            <p key={s.id} className="text-sm">
              {s.name} {s.start_time}–{s.end_time} {s.overnight ? t("attendanceHr.settings.overnight") : ""}
            </p>
          ))}
          <Button variant="secondary" onClick={() => saveShift.mutate()}>
            {t("attendanceHr.settings.addRamadan")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("attendanceHr.settings.duplicateWindow", { seconds: q.data?.defaults.rules.duplicateWindowSeconds })}
          </p>
        </NeumorphicCard>
      </div>
    </div>
  );
}
