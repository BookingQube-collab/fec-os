"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listAttendanceCorrections, reviewAttendanceCorrection, submitMissedPunchRequest } from "@/lib/attendance-hr.functions";
import { missedPunchRequestSide } from "@/lib/attendance-hr/missed-punch-approval";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function useStepLabel() {
  const { t } = useTranslation();
  return (step: string | null | undefined) => {
    if (step === "manager" || step === "ops" || step === "hr") return t(`hr.me.step.${step}`);
    return t("hr.me.step.manager");
  };
}

export function MissedPunchApprovalQueue({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const { t } = useTranslation();
  const stepLabel = useStepLabel();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "missed-punch-waiting" }),
    queryFn: () => listAttendanceCorrections({ queue: "waiting", status: "pending" }),
    staleTime: STALE.people,
  });
  const reviewMut = useMutation({
    mutationFn: reviewAttendanceCorrection,
    onSuccess: () => {
      toast.success(t("hr.leave.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = q.data ?? [];
  if (hideWhenEmpty && rows.length === 0) return null;

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">No missed punch requests are waiting on you.</p>
          <p className="text-muted-foreground">
            A new request goes to the site supervisor first. Head of Operations sees it after that
            approval. HR sees it only after Head of Operations approves. A rejection stops the chain.
          </p>
        </div>
      ) : null}
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-border/70 bg-card px-3 py-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium">
              {row.staffName ?? "Staff"}
              {row.employeeCode ? ` · ${row.employeeCode}` : ""} · {row.workDate ?? ""}
              {row.punchType ? ` · ${row.punchType === "in" ? t("hr.me.punchIn") : t("hr.me.punchOut")}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{row.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("hr.me.waitingFor", { who: stepLabel(row.currentStepRole) })}
            </p>
            {row.steps
              .filter((step) => step.status === "approved" || step.status === "rejected")
              .map((step) => (
                <p key={step.stepRole} className="text-xs text-muted-foreground">
                  {stepLabel(step.stepRole)} {step.status}
                  {step.actedByName ? ` · ${step.actedByName}` : ""}
                </p>
              ))}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="warning">{stepLabel(row.currentStepRole)}</Badge>
            {row.status === "pending" && row.canAct ? (
              <>
                <Button
                  size="sm"
                  className="min-h-11"
                  disabled={reviewMut.isPending}
                  onClick={() => reviewMut.mutate({ id: row.id, decision: "approved" })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-11"
                  disabled={reviewMut.isPending}
                  onClick={() => reviewMut.mutate({ id: row.id, decision: "rejected" })}
                >
                  Reject
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MyMissedPunchRequests() {
  const { t } = useTranslation();
  const stepLabel = useStepLabel();
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "missed-punch-mine" }),
    queryFn: () => listAttendanceCorrections({ queue: "mine" }),
    staleTime: STALE.people,
  });
  const rows = (q.data ?? []).filter(
    (row) => row.status === "pending" || row.status === "rejected" || row.status === "approved",
  );
  if (!rows.length) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("hr.me.yourPunchRequests")}</p>
      {rows.slice(0, 8).map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs">
          <span className="min-w-0">
            {row.workDate ?? "—"}
            {row.punchType ? ` · ${row.punchType === "in" ? t("hr.me.punchIn") : t("hr.me.punchOut")}` : ""}
          </span>
          <Badge variant={row.status === "rejected" ? "destructive" : row.status === "approved" ? "success" : "warning"}>
            {row.status === "pending"
              ? t("hr.me.waitingFor", { who: stepLabel(row.currentStepRole) })
              : row.status === "rejected"
                ? t("hr.me.punchRejected")
                : t("hr.me.punchApproved")}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function MissedPunchRequestButton({
  summaryId,
  missedPunch,
  status,
  actualIn,
  actualOut,
}: {
  summaryId: string;
  missedPunch: boolean;
  status: string;
  actualIn: string | null;
  actualOut: string | null;
}) {
  const { t } = useTranslation();
  const stepLabel = useStepLabel();
  const side = missedPunchRequestSide({
    missedPunch,
    status,
    hasIn: Boolean(actualIn),
    hasOut: Boolean(actualOut),
  });
  const mine = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "missed-punch-mine" }),
    queryFn: () => listAttendanceCorrections({ queue: "mine" }),
    staleTime: STALE.people,
    enabled: side !== null,
  });
  const pendingRows = (mine.data ?? []).filter((row) => row.summaryId === summaryId && row.status === "pending");
  const pendingFor = (choice: "in" | "out") =>
    pendingRows.some((row) => row.punchType === choice || row.punchType == null);
  const rejected = (mine.data ?? []).find((row) => row.summaryId === summaryId && row.status === "rejected");
  const [openSide, setOpenSide] = useState<"in" | "out" | null>(null);
  const [punchTime, setPunchTime] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: submitMissedPunchRequest,
    onSuccess: (result) => {
      if (result.approverCount === 0) toast.message(t("hr.me.savedNoSupervisor"));
      else toast.success(t("hr.me.sentToSupervisor"));
      setOpenSide(null);
      setPunchTime("");
      setReason("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!side) return null;

  const choices: Array<"in" | "out"> = (["in", "out"] as const).filter((choice) => !pendingFor(choice));

  return (
    <div className="mt-2 space-y-2">
      {pendingRows.map((pending) => (
        <Badge key={pending.id} variant="warning">
          {pending.punchType === "out" ? t("hr.me.punchOut") : t("hr.me.punchIn")}
          {" · "}
          {t("hr.me.waitingFor", { who: stepLabel(pending.currentStepRole) })}
        </Badge>
      ))}
      {rejected && !openSide ? (
        <Badge variant="destructive">
          {t("hr.me.punchRejected")}
          {rejected.reviewNote ? ` · ${rejected.reviewNote}` : ""}
        </Badge>
      ) : null}
      {openSide ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-background/80 p-3">
          <p className="text-xs font-semibold">
            {openSide === "in" ? t("hr.me.requestPunchIn") : t("hr.me.requestPunchOut")}
          </p>
          <div>
            <Label className="text-xs">{t("hr.me.punchTime")}</Label>
            <Input className="mt-1 min-h-11" type="time" value={punchTime} onChange={(e) => setPunchTime(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("hr.me.punchReason")}</Label>
            <Input className="mt-1 min-h-11" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={!punchTime || submit.isPending}
              onClick={() =>
                submit.mutate({
                  summaryId,
                  punchType: openSide,
                  punchTime,
                  reason: reason.trim() || undefined,
                })
              }
            >
              {t("hr.me.sendToSupervisor")}
            </Button>
            <Button className="min-h-11" variant="secondary" onClick={() => setOpenSide(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {choices.some((choice) => choice !== openSide) ? (
        <div className="flex flex-wrap gap-2">
          {choices
            .filter((choice) => choice !== openSide)
            .map((choice) => (
              <Button
                key={choice}
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  if (openSide !== choice) {
                    setPunchTime("");
                    setReason("");
                  }
                  setOpenSide(choice);
                }}
              >
                {choice === "in" ? t("hr.me.requestPunchIn") : t("hr.me.requestPunchOut")}
              </Button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
