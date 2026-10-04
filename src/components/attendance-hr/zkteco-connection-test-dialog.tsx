"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Circle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecLoader } from "@/components/fec";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdmsContactClass, AdmsDiagnosisCode, AdmsTestStageState } from "@/lib/attendance-hr/adms-connection-test";
import {
  getAttendanceDeviceConnectionTest,
  startAttendanceDeviceConnectionTest,
} from "@/lib/attendance-hr.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type DeviceTarget = {
  id: string;
  device_name: string;
  device_code: string;
  serial_number?: string | null;
};

type TestView = Awaited<ReturnType<typeof getAttendanceDeviceConnectionTest>>;

const STAGE_LABEL: Record<string, string> = {
  device_registered: "attendanceHr.settings.testStageRegistered",
  adms_server_healthy: "attendanceHr.settings.testStageServer",
  device_contacted_server: "attendanceHr.settings.testStageContacted",
  device_polled_getrequest: "attendanceHr.settings.testStagePolled",
  command_delivered: "attendanceHr.settings.testStageDelivered",
  command_acknowledged: "attendanceHr.settings.testStageAck",
};

function stageLabelKey(id: string, state: AdmsTestStageState): string {
  if (state === "warn" && id === "command_delivered") return "attendanceHr.settings.testStageDeliveredWaiting";
  if (state === "warn" && id === "command_acknowledged") return "attendanceHr.settings.testStageAckWaiting";
  return STAGE_LABEL[id] ?? id;
}

const DIAGNOSIS_LABEL: Record<AdmsDiagnosisCode, string> = {
  CONNECTED: "attendanceHr.settings.diagnosisConnected",
  NO_RECENT_CONTACT: "attendanceHr.settings.diagnosisNoRecentContact",
  NEVER_CONNECTED: "attendanceHr.settings.diagnosisNeverConnected",
  COMMAND_NOT_COLLECTED: "attendanceHr.settings.diagnosisCommandNotCollected",
  COMMAND_NOT_ACKNOWLEDGED: "attendanceHr.settings.diagnosisCommandNotAcknowledged",
  SERIAL_MISMATCH: "attendanceHr.settings.diagnosisSerialMismatch",
  SERVER_ERROR: "attendanceHr.settings.diagnosisServerError",
  DEVICE_STALE: "attendanceHr.settings.diagnosisDeviceStale",
  REGISTRATION_FAILED: "attendanceHr.settings.diagnosisRegistration",
};

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "medium" });
}

function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function stageMark(state: AdmsTestStageState) {
  if (state === "pass") return <Check className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (state === "fail") return <X className="h-4 w-4 text-destructive" aria-hidden />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
}

function contactVariant(contact: AdmsContactClass): "success" | "warning" | "muted" {
  if (contact === "online") return "success";
  if (contact === "stale") return "warning";
  return "muted";
}

function diagnosisTone(code: AdmsDiagnosisCode | undefined, provisional: boolean): string {
  if (!code || provisional) return "border-amber-400/70 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
  if (code === "CONNECTED") return "border-emerald-500/50 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100";
  if (code === "SERVER_ERROR" || code === "SERIAL_MISMATCH" || code === "REGISTRATION_FAILED") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  return "border-amber-400/70 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
}

export function ZktecoConnectionTestDialog({
  device,
  open,
  onOpenChange,
  onBusyChange,
}: {
  device: DeviceTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [testId, setTestId] = useState<string | null>(null);
  const [seed, setSeed] = useState<TestView | null>(null);

  const start = useMutation({
    mutationFn: (deviceId: string) => startAttendanceDeviceConnectionTest({ deviceId }),
    onSuccess: (data) => {
      setSeed(data);
      setTestId(data.testId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open || !device) return;
    setSeed(null);
    setTestId(null);
    start.mutate(device.id);
    // Restart only when the dialog opens for a device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, device?.id]);

  const statusQuery = useQuery({
    queryKey: ["adms-connection-test", testId],
    queryFn: () => getAttendanceDeviceConnectionTest({ testId: testId as string }),
    enabled: open && Boolean(testId),
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "queued" || status === "running") return 2_000;
      return false;
    },
  });

  const view = statusQuery.data ?? (seed?.testId === testId ? seed : null);
  const testing = start.isPending || (view != null && (view.status === "queued" || view.status === "running"));

  useEffect(() => {
    onBusyChange?.(open && testing);
  }, [open, testing, onBusyChange]);

  useEffect(() => {
    if (!view || view.status === "queued" || view.status === "running") return;
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
  }, [view, qc]);

  const diagnosisCode = view?.diagnosis?.code;
  const diagnosisMessage = (() => {
    if (!view?.diagnosis) return null;
    if (diagnosisCode === "REGISTRATION_FAILED") {
      const issues = view.registrationIssues.length ? view.registrationIssues : ["missing_device"];
      const detail = issues
        .map((issue) => {
          if (issue === "missing_serial") return t("attendanceHr.settings.registrationMissingSerial");
          if (issue === "missing_site") return t("attendanceHr.settings.registrationMissingSite");
          if (issue === "disabled") return t("attendanceHr.settings.registrationDisabled");
          return t("attendanceHr.settings.registrationMissingDevice");
        })
        .join(" ");
      return detail;
    }
    if (!diagnosisCode) return view.diagnosis.message;
    return t(DIAGNOSIS_LABEL[diagnosisCode]);
  })();

  const contactLabel =
    view?.contactClass === "online"
      ? t("attendanceHr.settings.deviceOnline")
      : view?.contactClass === "stale"
        ? t("attendanceHr.settings.deviceStale")
        : t("attendanceHr.settings.deviceNeverConnected");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("attendanceHr.settings.testConnectionTitle")}</DialogTitle>
          <DialogDescription>
            {device ? `${device.device_name} · ${device.device_code}` : t("attendanceHr.settings.devices")}
          </DialogDescription>
        </DialogHeader>

        {testing ? (
          <FecLoader density="chip" label={t("attendanceHr.settings.testingDevice")} />
        ) : null}

        {view ? (
          <div className="space-y-4">
            <ul className="space-y-1.5">
              {view.stages.map((stage) => (
                <li key={stage.id} className="flex items-center gap-2 text-sm">
                  {stageMark(stage.state)}
                  <span className={cn(stage.state === "fail" && "text-destructive", stage.state === "warn" && "text-amber-800 dark:text-amber-200")}>
                    {t(stageLabelKey(stage.id, stage.state))}
                  </span>
                </li>
              ))}
            </ul>

            {diagnosisMessage ? (
              <p className={cn("rounded-2xl border px-3 py-2 text-sm", diagnosisTone(diagnosisCode, Boolean(view.diagnosis?.provisional)))}>
                {diagnosisMessage}
              </p>
            ) : null}

            {diagnosisCode === "COMMAND_NOT_COLLECTED" || testing ? (
              <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.testPollHint")}</p>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t("attendanceHr.settings.testConnectionStatus")}</dt>
              <dd>
                <Badge variant={contactVariant(view.contactClass)}>{contactLabel}</Badge>
              </dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.testDiagnosis")}</dt>
              <dd>{diagnosisCode ? t(DIAGNOSIS_LABEL[diagnosisCode]) : "—"}</dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.serialNumber")}</dt>
              <dd className="font-mono">{view.serialNumber || device?.serial_number || "—"}</dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.lastAdmsContact")}</dt>
              <dd>{formatWhen(view.lastContactAt)}</dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.testLastEndpoint")}</dt>
              <dd className="font-mono">{view.lastEndpoint || "—"}</dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.testCommandQueued")}</dt>
              <dd>{formatWhen(view.queuedAt)}</dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.testCommandDelivered")}</dt>
              <dd>{formatWhen(view.deliveredAt)}</dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.testAcknowledged")}</dt>
              <dd>{formatWhen(view.acknowledgedAt)}</dd>
              <dt className="text-muted-foreground">{t("attendanceHr.settings.testRoundTrip")}</dt>
              <dd>
                {formatLatency(view.roundTripMs)}
                {view.resultCode != null ? ` · Return=${view.resultCode}` : ""}
              </dd>
            </dl>

            <div className="space-y-1">
              <p className="text-xs font-medium">{t("attendanceHr.settings.testEvents")}</p>
              {view.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("attendanceHr.settings.testEventsEmpty")}</p>
              ) : (
                <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {view.events.map((event) => (
                    <li key={event.id}>
                      <span className="font-medium text-foreground">{event.eventType}</span>
                      {event.endpoint ? ` · ${event.endpoint}` : ""}
                      {event.commandId != null ? ` · C:${event.commandId}` : ""}
                      {event.result ? ` · ${event.result}` : ""}
                      {" · "}
                      {formatWhen(event.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="secondary" disabled={!device || start.isPending || testing} onClick={() => device && start.mutate(device.id)}>
            {t("attendanceHr.settings.testRunAgain")}
          </Button>
          <Button type="button" variant="secondary" asChild>
            <Link href="/people/attendance/device-logs">{t("attendanceHr.settings.testViewLogs")}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
