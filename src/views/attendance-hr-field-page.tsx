"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinned, Radio, RefreshCw, ScanFace, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FaceCaptureDialog } from "@/components/attendance-hr/face-capture-dialog";
import { AttendanceHrFieldSettings } from "@/components/attendance-hr/attendance-hr-field-settings";
import { queueOrSubmitFieldCheckIn } from "@/components/attendance-hr/hr-field-sync";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getFieldCheckInContext,
  listStaffLastKnownLocations,
  listStaffLocationEvents,
  notifyAttendanceDeviations,
  saveStaffFaceEnrollment,
} from "@/lib/attendance-hr-field.functions";
import { listFieldCheckInQueue, removeFieldCheckIn } from "@/lib/attendance-hr/offline-queue";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";

function osmEmbed(lat: number, lng: number) {
  const d = 0.01;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export default function AttendanceHrFieldPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [online, setOnline] = useState(true);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [pendingSelfie, setPendingSelfie] = useState<{ dataUrl: string; livenessPassed: boolean } | null>(null);
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof listFieldCheckInQueue>>>([]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const refreshQueue = async () => {
    try {
      setQueue(await listFieldCheckInQueue());
    } catch {
      setQueue([]);
    }
  };

  useEffect(() => {
    void refreshQueue();
  }, [online]);

  const ctx = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "field-context" }),
    queryFn: () => getFieldCheckInContext(),
    staleTime: STALE.people,
  });
  const tracking = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "tracking" }),
    queryFn: () => listStaffLastKnownLocations(),
    staleTime: STALE.people,
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "field-events", locationId }),
    queryFn: () => listStaffLocationEvents({ locationId: locationId || null, limit: 80 }),
    staleTime: STALE.people,
  });

  const from = useMemo(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), []);
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    void refreshQueue();
  };

  const checkIn = useMutation({
    mutationFn: async (eventType: "check_in" | "check_out" | "ping") => {
      const settings = ctx.data?.settings;
      if (settings?.requireFaceOnCheckin && eventType !== "ping" && !pendingSelfie) {
        setSelfieOpen(true);
        throw new Error(t("attendanceHr.field.needSelfie"));
      }
      const coords = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error(t("attendanceHr.field.noGps")));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error(t("attendanceHr.field.gpsDenied"))), {
          enableHighAccuracy: true,
          timeout: 12_000,
        });
      });
      return queueOrSubmitFieldCheckIn({
        latitude: coords.coords.latitude,
        longitude: coords.coords.longitude,
        accuracyMeters: coords.coords.accuracy,
        eventType,
        locationId: locationId || ctx.data?.staff?.locationId || null,
        faceLivenessPassed: pendingSelfie?.livenessPassed ?? null,
        photoBase64: pendingSelfie?.dataUrl ?? null,
        recordedAt: new Date().toISOString(),
      });
    },
    onSuccess: (result) => {
      setPendingSelfie(null);
      toast.success(result.queued ? t("attendanceHr.field.queued") : t("attendanceHr.field.checkedIn"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enroll = useMutation({
    mutationFn: saveStaffFaceEnrollment,
    onSuccess: () => {
      toast.success(t("attendanceHr.field.enrolled"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notify = useMutation({
    mutationFn: () => notifyAttendanceDeviations({ locationId: locationId || null, dateFrom: from, dateTo: to }),
    onSuccess: (res) => toast.success(t("attendanceHr.field.notifySent", { count: res.sent })),
    onError: (e: Error) => toast.error(e.message),
  });

  const last = tracking.data?.[0];
  const mapLat = last?.latitude;
  const mapLng = last?.longitude;

  return (
    <HrShell>
      <HrSection
        icon={MapPinned}
        kicker={t("hr.field.kicker")}
        title={t("hr.field.title")}
        subtitle={t("hr.field.subtitle")}
      >
        {!online ? (
          <p className="flex items-center gap-2 rounded-[1.25rem] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm hr-enter">
            <WifiOff className="h-4 w-4" />
            {t("attendanceHr.field.offlineBanner")}
          </p>
        ) : null}

        {queue.length > 0 ? (
          <HrPanel delay={0}>
            <div className="space-y-2 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("attendanceHr.field.pendingSync")}</h2>
              <p className="text-xs text-muted-foreground">{t("attendanceHr.field.pendingHint")}</p>
              {queue.map((item) => (
                <div key={item.clientEventId} className="hr-list-row text-sm">
                  <span>
                    {item.payload.eventType} · {new Date(item.queuedAt).toLocaleString()}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => void removeFieldCheckIn(item.clientEventId).then(refreshQueue)}>
                    {t("attendanceHr.field.discard")}
                  </Button>
                </div>
              ))}
            </div>
          </HrPanel>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <HrPanel delay={1}>
            <div className="space-y-3 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("attendanceHr.field.checkIn")}</h2>
              <p className="text-xs text-muted-foreground">{t("attendanceHr.field.checkInHint")}</p>
              {ctx.data?.staff ? (
                <p className="text-sm">
                  {ctx.data.staff.fullName} · {ctx.data.staff.employeeCode}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("attendanceHr.field.noStaffLink")}</p>
              )}
              {pendingSelfie ? (
                <Badge variant={pendingSelfie.livenessPassed ? "success" : "warning"}>
                  {pendingSelfie.livenessPassed ? t("attendanceHr.field.livenessOk") : t("attendanceHr.field.livenessFail")}
                </Badge>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button disabled={!ctx.data?.staff || checkIn.isPending} onClick={() => checkIn.mutate("check_in")}>
                  {t("attendanceHr.field.checkInBtn")}
                </Button>
                <Button variant="secondary" disabled={!ctx.data?.staff || checkIn.isPending} onClick={() => checkIn.mutate("check_out")}>
                  {t("attendanceHr.field.checkOutBtn")}
                </Button>
                <Button variant="secondary" disabled={!ctx.data?.staff || checkIn.isPending} onClick={() => checkIn.mutate("ping")}>
                  <Radio className="mr-1 h-4 w-4" />
                  {t("attendanceHr.field.ping")}
                </Button>
                <Button variant="secondary" onClick={() => setSelfieOpen(true)}>
                  <ScanFace className="mr-1 h-4 w-4" />
                  {t("attendanceHr.field.selfie")}
                </Button>
              </div>
            </div>
          </HrPanel>

          <HrPanel delay={2}>
            <div className="space-y-3 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("attendanceHr.field.faceTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("attendanceHr.field.faceHint")}</p>
              <Badge variant={ctx.data?.enrollment.status === "enrolled" ? "success" : "muted"}>
                {ctx.data?.enrollment.status === "enrolled" ? t("attendanceHr.field.enrolledBadge") : t("attendanceHr.field.notEnrolled")}
              </Badge>
              <Button variant="secondary" onClick={() => setEnrollOpen(true)}>
                {t("attendanceHr.field.enrollFace")}
              </Button>
            </div>
          </HrPanel>
        </div>

        <HrPanel delay={3}>
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">{t("attendanceHr.field.lastKnown")}</h2>
              <Button size="sm" variant="secondary" onClick={() => void tracking.refetch()}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {t("attendanceHr.field.refresh")}
              </Button>
            </div>
            {typeof mapLat === "number" && typeof mapLng === "number" ? (
              <iframe title={t("attendanceHr.field.mapTitle")} className="h-56 w-full rounded-[1.15rem] border border-[var(--hr-border)]" src={osmEmbed(mapLat, mapLng)} />
            ) : (
              <HrEmptyState message={t("attendanceHr.field.noPositions")} icon={MapPinned} />
            )}
            <div className="hr-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("attendanceHr.field.colStaff")}</th>
                    <th>{t("attendanceHr.field.colWhere")}</th>
                    <th>{t("attendanceHr.field.colFence")}</th>
                    <th>{t("attendanceHr.field.colWhen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(tracking.data ?? []).map((row) => (
                    <tr key={row.staffId}>
                      <td>
                        {row.staffName ?? "—"}
                        {row.isRoaming ? (
                          <Badge variant="info" className="ms-2">
                            {t("attendanceHr.mapping.multiSite")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="text-xs text-muted-foreground">{row.locationLabel ?? `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`}</td>
                      <td>
                        {row.insideGeofence == null ? (
                          "—"
                        ) : (
                          <Badge variant={row.insideGeofence ? "success" : "destructive"}>
                            {row.insideGeofence ? t("attendanceHr.field.inside") : t("attendanceHr.field.outside")}
                          </Badge>
                        )}
                      </td>
                      <td className="text-xs">{new Date(row.recordedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </HrPanel>

        <HrPanel delay={4}>
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">{t("attendanceHr.field.visitLog")}</h2>
              <CapabilityGate capability="attendance.approve">
                <Button variant="secondary" disabled={notify.isPending} onClick={() => notify.mutate()}>
                  {t("attendanceHr.field.notifyDeviations")}
                </Button>
              </CapabilityGate>
            </div>
            {(events.data ?? []).length === 0 ? (
              <HrEmptyState message={t("attendanceHr.field.noEvents")} icon={MapPinned} />
            ) : (
              <div className="space-y-2">
                {(events.data ?? []).slice(0, 20).map((row) => (
                  <div key={row.id} className="hr-list-row text-sm">
                    <div>
                      <p className="font-medium">
                        {row.staffName} · {row.eventType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.locationLabel ?? "—"}
                        {row.distanceMeters != null ? ` · ${row.distanceMeters} m` : ""}
                        {row.queuedOffline ? ` · ${t("attendanceHr.field.synced")}` : ""}
                      </p>
                    </div>
                    <Badge variant={row.insideGeofence === false ? "destructive" : row.insideGeofence ? "success" : "muted"}>
                      {row.insideGeofence == null ? t("attendanceHr.field.noFence") : row.insideGeofence ? t("attendanceHr.field.inside") : t("attendanceHr.field.outside")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </HrPanel>

        <AttendanceHrFieldSettings />

        <FaceCaptureDialog
          open={selfieOpen}
          onOpenChange={setSelfieOpen}
          onCaptured={(result) => {
            setPendingSelfie(result);
            toast.message(result.livenessPassed ? t("attendanceHr.field.livenessOk") : t("attendanceHr.field.livenessFail"));
          }}
        />
        <FaceCaptureDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          title={t("attendanceHr.field.enrollFace")}
          description={t("attendanceHr.field.faceHint")}
          onCaptured={(result) => {
            enroll.mutate({ photoBase64: result.dataUrl, livenessPassed: result.livenessPassed });
          }}
        />
      </HrSection>
    </HrShell>
  );
}
