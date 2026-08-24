"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Settings, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { PageHeader } from "@/components/layout/page-header";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getAttendanceHrBootstrap, requestAttendanceDeviceFetch, saveAttendanceDevice, saveAttendanceShiftTemplate } from "@/lib/attendance-hr.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type DeviceRow = {
  id: string;
  location_id: string;
  device_code: string;
  device_name: string;
  serial_number?: string | null;
  last_sync_at?: string | null;
  last_adms_at?: string | null;
  connection_mode?: string | null;
};

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

export default function AttendanceHrSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
    queryFn: () => getAttendanceHrBootstrap(),
    staleTime: STALE.people,
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = hostFromOrigin(origin);
  const pushPath = `${origin}/iclock`;
  const [deviceName, setDeviceName] = useState("ZKTeco Device 2");
  const [deviceCode, setDeviceCode] = useState("ZK-2");
  const [deviceSn, setDeviceSn] = useState("");
  const [locationId, setLocationId] = useState("");
  const [snDrafts, setSnDrafts] = useState<Record<string, string>>({});

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of q.data?.sites ?? []) {
      const loc = s.location as { name?: string; code?: string } | null;
      map.set(s.location_id, loc?.name ? `${loc.code ? `${loc.code} · ` : ""}${loc.name}` : s.location_id);
    }
    return map;
  }, [q.data?.sites]);

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
        deviceName: device.device_name,
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

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        kicker={t("attendanceHr.settings.kicker")}
        title={t("attendanceHr.settings.title")}
        subtitle={t("attendanceHr.settings.subtitle")}
      />
      <AttendanceHrNav />
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
        <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.hourlyHelp")}</p>
      </NeumorphicCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <NeumorphicCard className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">{t("attendanceHr.settings.devices")}</h2>
          {(q.data?.devices ?? []).map((raw) => {
            const d: DeviceRow = {
              id: raw.id,
              location_id: raw.location_id,
              device_code: raw.device_code,
              device_name: raw.device_name,
              serial_number: raw.serial_number == null ? null : String(raw.serial_number),
              last_sync_at: raw.last_sync_at,
              last_adms_at: raw.last_adms_at == null ? null : String(raw.last_adms_at),
              connection_mode: raw.connection_mode == null ? null : String(raw.connection_mode),
            };
            return (
              <div key={d.id} className="space-y-2 rounded-2xl border px-3 py-3">
                <p className="text-sm font-medium">
                  {d.device_name} · {d.device_code}
                </p>
                <p className="text-xs text-muted-foreground">
                  {siteNameById.get(d.location_id) ?? d.location_id}
                  {" · "}
                  {t("attendanceHr.settings.lastSync")}: {d.last_adms_at ?? d.last_sync_at ?? t("attendanceHr.settings.never")}
                </p>
                <Label>{t("attendanceHr.settings.serialNumber")}</Label>
                <div className="flex gap-2">
                  <Input
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
                    disabled={fetchDev.isPending || !(snDrafts[d.id] ?? d.serial_number)}
                    onClick={() => fetchDev.mutate(d)}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    {t("attendanceHr.settings.fetchNow")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.fetchHelp")}</p>
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
