"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, ScanFace, Share, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FaceCaptureDialog } from "@/components/attendance-hr/face-capture-dialog";
import { queueOrSubmitFieldCheckIn } from "@/components/attendance-hr/hr-field-sync";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFieldCheckInContext, saveStaffFaceEnrollment } from "@/lib/attendance-hr-field.functions";
import { getMyAttendance } from "@/lib/hr-employee.functions";
import {
  getLeaveBalanceSummary,
  listLeaveRequests,
  reviewLeaveRequest,
  submitLeaveRequest,
} from "@/lib/hr-leave.functions";
import { listAnnouncements } from "@/lib/hr-announcements.functions";
import {
  getEmployeeDocumentUrl,
  listEmployeeDocuments,
  uploadEmployeeDocument,
} from "@/lib/hr-documents.functions";
import { listFieldCheckInQueue, removeFieldCheckIn } from "@/lib/attendance-hr/offline-queue";
import { formatWorkDateDdMmYyyy, formatPunchTime12h, formatHoursValue, computeHoursWorked } from "@/lib/attendance-display";
import { useNotifications } from "@/hooks/queries/useNotifications";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { HR_LEAVE_TYPES } from "@/lib/hr-leave";
import { HR_DOC_TYPES, type LeaveConflict } from "@/lib/hr-advanced";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export default function EmployeeMePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [pendingSelfie, setPendingSelfie] = useState<{ dataUrl: string; livenessPassed: boolean } | null>(null);
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof listFieldCheckInQueue>>>([]);
  const [leaveType, setLeaveType] = useState<(typeof HR_LEAVE_TYPES)[number]>("annual");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveConflicts, setLeaveConflicts] = useState<LeaveConflict[]>([]);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [docType, setDocType] = useState<(typeof HR_DOC_TYPES)[number]>("qid");
  const [docExpiry, setDocExpiry] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);

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
  const attendance = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "my-attendance" }),
    queryFn: () => getMyAttendance({}),
    staleTime: STALE.people,
  });
  const leave = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "my-leave" }),
    queryFn: () => listLeaveRequests({ mineOnly: true }),
    staleTime: STALE.people,
  });
  const balances = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ mine: true }),
    queryFn: () => getLeaveBalanceSummary({}),
    staleTime: STALE.people,
  });
  const announcements = useQuery({
    queryKey: queryKeys.people.hrAnnouncements({ mine: true }),
    queryFn: () => listAnnouncements({}),
    staleTime: STALE.people,
  });
  const myDocs = useQuery({
    queryKey: queryKeys.people.hrDocs({ mine: true }),
    queryFn: () => listEmployeeDocuments({ mineOnly: true }),
    staleTime: STALE.people,
  });
  const notes = useNotifications({ limit: 12 });

  const lastDay = attendance.data?.rows[0];
  const ios = useMemo(() => isIos(), []);

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
        locationId: ctx.data?.staff?.locationId || null,
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
    mutationFn: async (payload: { photoBase64: string; livenessPassed: boolean }) => {
      const result = await saveStaffFaceEnrollment(payload);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("attendanceHr.field.enrolled"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canEnrollSelf = Boolean(ctx.data?.staff?.id);

  function openEnroll() {
    if (!canEnrollSelf) {
      toast.error(t("attendanceHr.field.enrollNeedStaff"));
      return;
    }
    setEnrollOpen(true);
  }

  const askLeave = useMutation({
    mutationFn: (acknowledgeConflicts?: boolean) =>
      submitLeaveRequest({
        leaveType,
        dateFrom: leaveFrom,
        dateTo: leaveTo || leaveFrom,
        reason: leaveReason || null,
        acknowledgeConflicts: acknowledgeConflicts ?? false,
      }),
    onSuccess: (res) => {
      if (res.requiresAck) {
        setLeaveConflicts(res.conflicts);
        toast.message(t("hr.leave.conflictWarn"));
        return;
      }
      toast.success(t("hr.leave.submitted"));
      setLeaveReason("");
      setLeaveConflicts([]);
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrLeaveBalances() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDoc = useMutation({
    mutationFn: getEmployeeDocumentUrl,
    onSuccess: (res) => window.open(res.url, "_blank", "noopener,noreferrer"),
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error(t("hr.me.needFile"));
      const data_base64 = await fileToBase64(docFile);
      return uploadEmployeeDocument({
        docType,
        filename: docFile.name,
        data_base64,
        content_type: docFile.type || "application/pdf",
        expiryDate: docExpiry || null,
        title: docFile.name,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.docs.uploaded"));
      setDocFile(null);
      setDocExpiry("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelLeave = useMutation({
    mutationFn: (id: string) => reviewLeaveRequest({ id, status: "cancelled" }),
    onSuccess: () => {
      toast.success(t("hr.leave.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <HrShell className="mx-auto max-w-lg px-1">
    <div className="space-y-4">
      {!installDismissed ? (
        <section className="hr-notice hr-enter text-sm">
          <div>
            <p className="font-semibold tracking-tight">{t("hr.me.installTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {ios ? t("hr.me.installIos") : t("hr.me.installAndroid")}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setInstallDismissed(true)}>
                {t("hr.me.installDismiss")}
              </Button>
              {ios ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Share className="h-3.5 w-3.5" />
                  {t("hr.me.shareHint")}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {!online ? (
        <p className="flex items-center gap-2 rounded-[1.25rem] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <WifiOff className="h-4 w-4" />
          {t("attendanceHr.field.offlineBanner")}
        </p>
      ) : null}

      <section className="hr-panel-shell hr-enter">
        <div className="hr-panel p-4">
        <h1 className="text-lg font-semibold tracking-tight">{ctx.data?.staff?.fullName ?? t("hr.me.unlinked")}</h1>
        <p className="text-xs text-muted-foreground">{ctx.data?.staff?.employeeCode}</p>
        {lastDay ? (
          <p className="mt-2 text-sm">
            {t("hr.me.lastStatus")}: {lastDay.status} · {formatWorkDateDdMmYyyy(lastDay.workDate)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("hr.me.noStatus")}</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button className="min-h-12" disabled={!ctx.data?.staff || checkIn.isPending} onClick={() => checkIn.mutate("check_in")}>
            {t("attendanceHr.field.checkInBtn")}
          </Button>
          <Button className="min-h-12" variant="secondary" disabled={!ctx.data?.staff || checkIn.isPending} onClick={() => checkIn.mutate("check_out")}>
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
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Badge variant={ctx.data?.enrollment?.status === "enrolled" ? "success" : "muted"}>
            {ctx.data?.enrollment?.status === "enrolled" ? t("attendanceHr.field.enrolledBadge") : t("attendanceHr.field.notEnrolled")}
          </Badge>
          <Button size="sm" variant="ghost" disabled={!canEnrollSelf || enroll.isPending} onClick={openEnroll}>
            {t("attendanceHr.field.enrollFace")}
          </Button>
        </div>
        {!canEnrollSelf ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("attendanceHr.field.enrollNeedStaff")}</p>
        ) : null}
        </div>
      </section>

      {queue.length > 0 ? (
        <section className="hr-panel-shell">
          <div className="hr-panel space-y-2 p-4">
          <h2 className="text-sm font-semibold tracking-tight">{t("attendanceHr.field.pendingSync")}</h2>
          {queue.map((item) => (
            <div key={item.clientEventId} className="flex items-center justify-between text-sm">
              <span>
                {item.payload.eventType} · {new Date(item.queuedAt).toLocaleString()}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void removeFieldCheckIn(item.clientEventId).then(refreshQueue)}>
                {t("attendanceHr.field.discard")}
              </Button>
            </div>
          ))}
          </div>
        </section>
      ) : null}

      <section className="hr-panel-shell">
        <div className="hr-panel p-4">
        <h2 className="text-sm font-semibold tracking-tight">{t("hr.me.myAttendance")}</h2>
        <p className="text-xs text-muted-foreground">
          {attendance.data ? `${attendance.data.dateFrom} → ${attendance.data.dateTo}` : t("common.loading")}
        </p>
        <div className="mt-2 space-y-2">
          {(attendance.data?.rows ?? []).map((row) => (
            <div key={row.id} className="hr-list-row !py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span>{formatWorkDateDdMmYyyy(row.workDate)}</span>
                  <Badge variant={row.missedPunch ? "destructive" : "muted"}>{row.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.locationLabel} · {formatPunchTime12h(row.actualIn) || "—"} – {formatPunchTime12h(row.actualOut) || "—"} ·{" "}
                  {formatHoursValue(computeHoursWorked(row.actualIn, row.actualOut))}h
                </p>
              </div>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section className="hr-panel-shell">
        <div className="hr-panel space-y-3 p-4">
        <h2 className="text-sm font-semibold tracking-tight">{t("hr.leave.requestTitle")}</h2>
        {(balances.data?.balances ?? []).length > 0 ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {balances.data!.balances.slice(0, 4).map((b) => (
              <div key={b.leaveType} className="rounded-xl border border-[var(--hr-border)] bg-white/70 px-2 py-1.5">
                <p className="font-medium">{t(`hr.leave.types.${b.leaveType}`)}</p>
                <p className="text-muted-foreground">
                  {t("hr.leave.remaining", { remaining: b.remainingDays, allotted: b.allottedDays, used: b.usedDays })}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{t("hr.leave.from")}</Label>
            <Input type="date" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
          </div>
          <div>
            <Label>{t("hr.leave.to")}</Label>
            <Input type="date" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
          </div>
        </div>
        <select
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value as (typeof HR_LEAVE_TYPES)[number])}
        >
          {HR_LEAVE_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`hr.leave.types.${value}`)}
            </option>
          ))}
        </select>
        <Input placeholder={t("hr.leave.reason")} value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
        {leaveConflicts.length > 0 ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            <p className="font-medium">{t("hr.leave.conflictWarn")}</p>
            <ul className="mt-1 list-disc pl-4">
              {leaveConflicts.slice(0, 5).map((c, i) => (
                <li key={`${c.kind}-${c.workDate}-${i}`}>
                  {c.workDate}: {c.detail}
                </li>
              ))}
            </ul>
            <Button className="mt-2" size="sm" disabled={askLeave.isPending} onClick={() => askLeave.mutate(true)}>
              {t("hr.leave.submitAnyway")}
            </Button>
          </div>
        ) : null}
        <Button disabled={!leaveFrom || askLeave.isPending} onClick={() => askLeave.mutate(false)}>
          {t("hr.leave.submit")}
        </Button>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("hr.leave.history")}</h3>
        {(leave.data ?? []).slice(0, 12).map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {row.dateFrom} → {row.dateTo} · {t(`hr.leave.types.${row.leaveType}`)} · {t(`hr.leave.status.${row.status}`)} · {row.days}d
            </span>
            {row.status === "pending" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={cancelLeave.isPending}
                onClick={() => cancelLeave.mutate(row.id)}
              >
                {t("hr.leave.cancel")}
              </Button>
            ) : null}
          </div>
        ))}
        </div>
      </section>

      {(announcements.data ?? []).length > 0 ? (
        <section className="hr-panel-shell">
          <div className="hr-panel p-4">
          <h2 className="text-sm font-semibold tracking-tight">{t("hr.me.announcements")}</h2>
          <ul className="mt-2 space-y-2">
            {(announcements.data ?? []).slice(0, 5).map((a) => (
              <li key={a.id} className="hr-list-row !items-start flex-col text-sm">
                <p className="font-medium">{a.title}</p>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{a.body}</p>
              </li>
            ))}
          </ul>
          </div>
        </section>
      ) : null}

      <section className="hr-panel-shell">
        <div className="hr-panel p-4">
        <h2 className="text-sm font-semibold tracking-tight">{t("hr.me.myDocuments")}</h2>
        <div className="mt-3 space-y-2 rounded-xl border border-dashed border-[var(--hr-border)] p-3">
          <p className="text-xs text-muted-foreground">{t("hr.me.uploadHint")}</p>
          <select
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
            value={docType}
            onChange={(e) => setDocType(e.target.value as (typeof HR_DOC_TYPES)[number])}
          >
            {HR_DOC_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`hr.docs.types.${value}`)}
              </option>
            ))}
          </select>
          <Input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
          <Input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
          />
          <Button size="sm" disabled={!docFile || uploadDoc.isPending} onClick={() => uploadDoc.mutate()}>
            {t("hr.me.uploadDoc")}
          </Button>
        </div>
        {(myDocs.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("hr.me.noDocuments")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(myDocs.data ?? []).map((doc) => (
              <li key={doc.id} className="hr-list-row text-sm">
                <span>
                  {t(`hr.docs.types.${doc.docType}`)}
                  {doc.expiryDate ? ` · ${doc.expiryDate}` : ""}
                </span>
                <Button size="sm" variant="ghost" onClick={() => openDoc.mutate({ id: doc.id })}>
                  {t("hr.docs.view")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>

      <section className="hr-panel-shell">
        <div className="hr-panel p-4">
        <h2 className="text-sm font-semibold tracking-tight">{t("hr.me.notifications")}</h2>
        {(notes.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("hr.me.noNotifications")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(notes.data ?? []).map((n) => (
              <li key={n.id} className="hr-list-row !items-start flex-col text-sm">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>

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
    </div>
    </HrShell>
  );
}
