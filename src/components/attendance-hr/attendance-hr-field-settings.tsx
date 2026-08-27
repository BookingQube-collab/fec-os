"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SITE_GEOFENCE_DEFAULTS } from "@/lib/attendance-hr/geofence";
import {
  getHrFieldSettings,
  listAttendanceGeofences,
  saveAttendanceGeofence,
  saveHrFieldSettings,
} from "@/lib/attendance-hr-field.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type FenceDraft = {
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  mode: "operate" | "restrict";
  active: boolean;
};

export function AttendanceHrFieldSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "field-settings" }),
    queryFn: () => getHrFieldSettings(),
    staleTime: STALE.people,
  });
  const fencesQ = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "geofences" }),
    queryFn: () => listAttendanceGeofences(),
    staleTime: STALE.people,
  });

  const [radius, setRadius] = useState("200");
  const [dup, setDup] = useState("60");
  const [notifyMissed, setNotifyMissed] = useState(true);
  const [notifyLate, setNotifyLate] = useState(true);
  const [notifyExit, setNotifyExit] = useState(true);
  const [notifyCorr, setNotifyCorr] = useState(true);
  const [requireGps, setRequireGps] = useState(true);
  const [requireFace, setRequireFace] = useState(false);
  const [liveness, setLiveness] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, FenceDraft>>({});

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setRadius(String(s.defaultGeofenceRadiusMeters));
    setDup(String(s.duplicateWindowSeconds));
    setNotifyMissed(s.notifyMissedPunch);
    setNotifyLate(s.notifyLate);
    setNotifyExit(s.notifyGeofenceExit);
    setNotifyCorr(s.notifyCorrections);
    setRequireGps(s.requireGpsOnCheckin);
    setRequireFace(s.requireFaceOnCheckin);
    setLiveness(s.faceLivenessRequired);
  }, [settingsQ.data]);

  useEffect(() => {
    const next: Record<string, FenceDraft> = {};
    for (const fence of fencesQ.data ?? []) {
      next[fence.locationId] = {
        name: fence.name,
        latitude: String(fence.latitude),
        longitude: String(fence.longitude),
        radiusMeters: String(fence.radiusMeters),
        mode: fence.mode,
        active: fence.active,
      };
    }
    setDrafts(next);
  }, [fencesQ.data]);

  const saveRules = useMutation({
    mutationFn: () =>
      saveHrFieldSettings({
        defaultGeofenceRadiusMeters: Number(radius) || 200,
        duplicateWindowSeconds: Number(dup) || 60,
        notifyMissedPunch: notifyMissed,
        notifyLate,
        notifyGeofenceExit: notifyExit,
        notifyCorrections: notifyCorr,
        requireGpsOnCheckin: requireGps,
        requireFaceOnCheckin: requireFace,
        faceLivenessRequired: liveness,
      }),
    onSuccess: () => {
      toast.success(t("attendanceHr.hrConfig.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFence = useMutation({
    mutationFn: (locationId: string) => {
      const draft = drafts[locationId];
      if (!draft) throw new Error(t("attendanceHr.hrConfig.missingFence"));
      return saveAttendanceGeofence({
        locationId,
        name: draft.name,
        latitude: Number(draft.latitude),
        longitude: Number(draft.longitude),
        radiusMeters: Number(draft.radiusMeters) || 200,
        mode: draft.mode,
        active: draft.active,
      });
    },
    onSuccess: () => {
      toast.success(t("attendanceHr.hrConfig.fenceSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function patch(locationId: string, patch: Partial<FenceDraft>) {
    setDrafts((prev) => ({ ...prev, [locationId]: { ...prev[locationId], ...patch } }));
  }

  function fillKnown(locationId: string, code: string | null) {
    const known = code ? SITE_GEOFENCE_DEFAULTS[code] : null;
    if (!known) {
      toast.message(t("attendanceHr.hrConfig.noKnownCoords"));
      return;
    }
    patch(locationId, { latitude: String(known.latitude), longitude: String(known.longitude) });
  }

  async function fillGpsLocation(locationId: string) {
    navigator.geolocation.getCurrentPosition(
      (pos) => patch(locationId, { latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }),
      () => toast.error(t("attendanceHr.field.gpsDenied")),
    );
  }

  return (
    <>
      <NeumorphicCard className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">{t("attendanceHr.hrConfig.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("attendanceHr.hrConfig.subtitle")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("attendanceHr.hrConfig.defaultRadius")}</Label>
            <Input type="number" min={20} max={20000} value={radius} onChange={(e) => setRadius(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("attendanceHr.hrConfig.duplicateWindow")}</Label>
            <Input type="number" min={0} max={600} value={dup} onChange={(e) => setDup(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow label={t("attendanceHr.hrConfig.notifyMissed")} checked={notifyMissed} onChange={setNotifyMissed} />
          <ToggleRow label={t("attendanceHr.hrConfig.notifyLate")} checked={notifyLate} onChange={setNotifyLate} />
          <ToggleRow label={t("attendanceHr.hrConfig.notifyExit")} checked={notifyExit} onChange={setNotifyExit} />
          <ToggleRow label={t("attendanceHr.hrConfig.notifyCorr")} checked={notifyCorr} onChange={setNotifyCorr} />
          <ToggleRow label={t("attendanceHr.hrConfig.requireGps")} checked={requireGps} onChange={setRequireGps} />
          <ToggleRow label={t("attendanceHr.hrConfig.requireFace")} checked={requireFace} onChange={setRequireFace} />
          <ToggleRow label={t("attendanceHr.hrConfig.liveness")} checked={liveness} onChange={setLiveness} />
        </div>
        <CapabilityGate capability="attendance.configure">
          <Button disabled={saveRules.isPending} onClick={() => saveRules.mutate()}>
            {t("attendanceHr.hrConfig.saveRules")}
          </Button>
        </CapabilityGate>
      </NeumorphicCard>

      <NeumorphicCard className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">{t("attendanceHr.hrConfig.geofences")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("attendanceHr.hrConfig.geofencesHint")}</p>
        </div>
        {(fencesQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("attendanceHr.hrConfig.noFences")}</p>
        ) : (
          (fencesQ.data ?? []).map((fence) => {
            const draft = drafts[fence.locationId];
            if (!draft) return null;
            return (
              <div key={fence.locationId} className="space-y-2 rounded-2xl border px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {fence.locationCode ? `${fence.locationCode} · ` : ""}
                    {fence.locationName ?? fence.name}
                  </p>
                  <ToggleRow label={t("attendanceHr.hrConfig.active")} checked={draft.active} onChange={(v) => patch(fence.locationId, { active: v })} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input value={draft.latitude} onChange={(e) => patch(fence.locationId, { latitude: e.target.value })} placeholder="lat" />
                  <Input value={draft.longitude} onChange={(e) => patch(fence.locationId, { longitude: e.target.value })} placeholder="lng" />
                  <Input type="number" value={draft.radiusMeters} onChange={(e) => patch(fence.locationId, { radiusMeters: e.target.value })} />
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={draft.mode}
                    onChange={(e) => patch(fence.locationId, { mode: e.target.value as "operate" | "restrict" })}
                  >
                    <option value="operate">{t("attendanceHr.hrConfig.modeOperate")}</option>
                    <option value="restrict">{t("attendanceHr.hrConfig.modeRestrict")}</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => fillKnown(fence.locationId, fence.locationCode)}>
                    {t("attendanceHr.hrConfig.fillKnown")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void fillGpsLocation(fence.locationId)}>
                    {t("attendanceHr.hrConfig.useGps")}
                  </Button>
                  <CapabilityGate capability="attendance.configure">
                    <Button size="sm" disabled={saveFence.isPending} onClick={() => saveFence.mutate(fence.locationId)}>
                      {t("common.save")}
                    </Button>
                  </CapabilityGate>
                </div>
              </div>
            );
          })
        )}
      </NeumorphicCard>
    </>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
