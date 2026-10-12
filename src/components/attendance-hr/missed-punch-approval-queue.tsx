"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPunchTime12h, formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import {
  listAttendanceCorrections,
  resubmitMissedPunchRequest,
  reviewAttendanceCorrection,
  submitMissedPunchRequest,
} from "@/lib/attendance-hr.functions";
import { correctionCardClocks, missedPunchRequestSide, punchTimeInputValue } from "@/lib/attendance-hr/missed-punch-approval";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function clockText(iso: string | null): string {
  return formatPunchTime12h(iso) || "—";
}

function useStepLabel() {
  const { t } = useTranslation();
  return (step: string | null | undefined) => {
    if (step === "manager" || step === "ops" || step === "hr") return t(`hr.me.step.${step}`);
    return t("hr.me.step.manager");
  };
}

export function MissedPunchApprovalQueue({
  hideWhenEmpty = false,
  actionableOnly = false,
  title,
}: {
  hideWhenEmpty?: boolean;
  /** Employee home: do not list other people's decided corrections. */
  actionableOnly?: boolean;
  title?: string;
}) {
  const { t } = useTranslation();
  const stepLabel = useStepLabel();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: actionableOnly ? "missed-punch-actionable" : "missed-punch-waiting",
    }),
    queryFn: () => listAttendanceCorrections({ queue: "waiting", actionableOnly }),
    staleTime: STALE.people,
  });
  const reviewMut = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "rejected" | "change_required" }) =>
      reviewAttendanceCorrection(input),
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
      {title && rows.length > 0 ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {rows.length === 0 ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">No missed punch requests are waiting on you.</p>
          <p className="text-muted-foreground">
            A correction for yourself goes to your line manager, then Head of Operations, then HR. A
            correction a manager files for someone on their team is approved and sent straight to HR.
          </p>
        </div>
      ) : (
        <ul className="hd-approval-list">
          {rows.map((row) => {
            const clocks = correctionCardClocks(row.punchType, row.punchAt);
            const busy = reviewMut.isPending && reviewMut.variables?.id === row.id;
            const showActions = row.status === "pending" && row.canAct;
            const showApproved =
              row.status === "approved" ||
              (row.status === "pending" && !row.canAct && row.steps.some((step) => step.status === "approved"));
            const showReject = row.status === "rejected";
            const showChange = row.status === "change_required";
            const punchLabel =
              row.punchType === "in" ? t("hr.me.punchIn") : row.punchType === "out" ? t("hr.me.punchOut") : null;
            const priorSteps = row.steps.filter((step) => step.status === "approved" || step.status === "skipped");
            const name = row.staffName ?? "Staff";
            return (
              <li key={row.id}>
                <article className="hd-approval" aria-busy={busy || undefined} aria-labelledby={`punch-approval-${row.id}-name`}>
                  <header className="hd-approval__top">
                    <div className="min-w-0">
                      <h4 id={`punch-approval-${row.id}-name`} className="hd-approval__name">
                        {name}
                      </h4>
                      {row.employeeCode ? <p className="hd-approval__code">{row.employeeCode}</p> : null}
                    </div>
                    {punchLabel ? <span className="hd-approval__kind">{punchLabel}</span> : null}
                  </header>
                  <dl className="hd-approval__facts">
                    <div className="hd-approval__fact">
                      <dt>{t("common.date")}</dt>
                      <dd>{row.workDate ? formatWorkDateDdMmYyyy(row.workDate) : "—"}</dd>
                    </div>
                    <div className="hd-approval__fact">
                      <dt>{t("hr.me.punchIn")}</dt>
                      <dd>{clockText(clocks.punchIn)}</dd>
                    </div>
                    <div className="hd-approval__fact">
                      <dt>{t("hr.me.punchOut")}</dt>
                      <dd>{clockText(clocks.punchOut)}</dd>
                    </div>
                  </dl>
                  {row.reason ? (
                    <div className="hd-approval__block">
                      <p className="hd-approval__label">{t("hr.me.approvalReason")}</p>
                      <p className="hd-approval__reason">{row.reason}</p>
                    </div>
                  ) : null}
                  {row.reviewNote && !row.reason?.includes(row.reviewNote) ? (
                    <p className="hd-approval__note">{row.reviewNote}</p>
                  ) : null}
                  {priorSteps.length > 0 ? (
                    <div className="hd-approval__block">
                      <p className="hd-approval__label">{t("hr.me.priorApprovals")}</p>
                      <ul className="hd-approval__trail">
                        {priorSteps.map((step) => (
                          <li key={step.stepRole}>
                            {step.status === "skipped"
                              ? `${stepLabel(step.stepRole)} skipped`
                              : `${stepLabel(step.stepRole)} approved`}
                            {step.actedByName ? ` · ${step.actedByName}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {showActions || showApproved || showReject || showChange ? (
                    <div className="hd-approval__step">
                      {showActions ? (
                        <p className="hd-approval__waiting">
                          {t("hr.me.waitingFor", { who: stepLabel(row.currentStepRole) })}
                        </p>
                      ) : null}
                      {showActions ? <Badge variant="warning">{stepLabel(row.currentStepRole)}</Badge> : null}
                      {showApproved ? <p className="hd-approval__status hd-approval__status--ok">{t("hr.me.punchApproved")}</p> : null}
                      {showReject ? <p className="hd-approval__status hd-approval__status--no">Reject</p> : null}
                      {showChange ? <p className="hd-approval__status hd-approval__status--change">Change required</p> : null}
                    </div>
                  ) : null}
                  {showActions ? (
                    <div className="hd-approval__actions" role="group" aria-label={t("common.actions")}>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11"
                        disabled={busy}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          reviewMut.mutate({ id: row.id, decision: "approved" });
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="min-h-11"
                        disabled={busy}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          reviewMut.mutate({ id: row.id, decision: "change_required" });
                        }}
                      >
                        Change required
                      </Button>
                      <button
                        type="button"
                        className="hd-approval__reject"
                        disabled={busy}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          reviewMut.mutate({ id: row.id, decision: "rejected" });
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
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
    (row) =>
      row.status === "pending" ||
      row.status === "rejected" ||
      row.status === "approved" ||
      row.status === "change_required",
  );
  if (!rows.length) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("hr.me.yourPunchRequests")}</p>
      {rows.slice(0, 8).map((row) => {
        const clocks = correctionCardClocks(row.punchType, row.punchAt);
        return (
        <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs">
          <span className="min-w-0">
            {row.workDate ?? "—"}
            {row.punchType ? ` · ${row.punchType === "in" ? t("hr.me.punchIn") : t("hr.me.punchOut")}` : ""}
            <span className="mt-0.5 block text-muted-foreground">
              {t("hr.me.punchIn")} {clockText(clocks.punchIn)} · {t("hr.me.punchOut")} {clockText(clocks.punchOut)}
            </span>
          </span>
          {row.status === "rejected" ? (
            <span className="font-semibold text-destructive">Reject</span>
          ) : row.status === "change_required" ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">Change required</span>
          ) : (
            <Badge variant={row.status === "approved" ? "success" : "warning"}>
              {row.status === "pending"
                ? t("hr.me.waitingFor", { who: stepLabel(row.currentStepRole) })
                : t("hr.me.punchApproved")}
            </Badge>
          )}
        </div>
        );
      })}
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
  const changeRows = (mine.data ?? []).filter((row) => row.summaryId === summaryId && row.status === "change_required");
  const pendingFor = (choice: "in" | "out") =>
    pendingRows.some((row) => row.punchType === choice || row.punchType == null) ||
    changeRows.some((row) => row.punchType === choice || row.punchType == null);
  const rejected = (mine.data ?? []).find((row) => row.summaryId === summaryId && row.status === "rejected");
  const [openSide, setOpenSide] = useState<"in" | "out" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [punchTime, setPunchTime] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: submitMissedPunchRequest,
    onSuccess: (result) => {
      if (result.approverCount === 0) toast.message(t("hr.me.savedNoSupervisor"));
      else toast.success(t("hr.me.sentToSupervisor"));
      setOpenSide(null);
      setEditingId(null);
      setPunchTime("");
      setReason("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resubmit = useMutation({
    mutationFn: resubmitMissedPunchRequest,
    onSuccess: (result) => {
      if (result.approverCount === 0) toast.message(t("hr.me.savedNoSupervisor"));
      else toast.success(t("hr.me.sentToSupervisor"));
      setOpenSide(null);
      setEditingId(null);
      setPunchTime("");
      setReason("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!side && changeRows.length === 0) return null;

  const choices: Array<"in" | "out"> = side ? (["in", "out"] as const).filter((choice) => !pendingFor(choice)) : [];

  return (
    <div className="mt-2 space-y-2">
      {pendingRows.map((pending) => (
        <Badge key={pending.id} variant="warning">
          {pending.punchType === "out" ? t("hr.me.punchOut") : t("hr.me.punchIn")}
          {" · "}
          {t("hr.me.waitingFor", { who: stepLabel(pending.currentStepRole) })}
        </Badge>
      ))}
      {changeRows.map((row) => {
        const clocks = correctionCardClocks(row.punchType, row.punchAt);
        const editing = editingId === row.id;
        return (
          <div key={row.id} className="space-y-2 rounded-xl border border-amber-300/80 bg-background/80 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Change required</p>
            <p className="text-xs text-muted-foreground">
              {t("hr.me.punchIn")} {clockText(clocks.punchIn)}
              <span className="mx-1.5">·</span>
              {t("hr.me.punchOut")} {clockText(clocks.punchOut)}
            </p>
            {row.reason ? <p className="text-xs text-muted-foreground">{row.reason}</p> : null}
            {editing ? (
              <div className="space-y-2">
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
                    type="button"
                    className="min-h-11"
                    disabled={!punchTime || resubmit.isPending}
                    onClick={() =>
                      resubmit.mutate({
                        correctionId: row.id,
                        punchTime,
                        reason: reason.trim() || undefined,
                      })
                    }
                  >
                    {t("hr.me.sendToSupervisor")}
                  </Button>
                  <Button type="button" className="min-h-11" variant="secondary" onClick={() => setEditingId(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setEditingId(row.id);
                  setOpenSide(null);
                  setPunchTime(punchTimeInputValue(row.punchAt));
                  setReason(row.reason ?? "");
                }}
              >
                Update and send again
              </Button>
            )}
          </div>
        );
      })}
      {rejected && !openSide ? (
        <span className="text-sm font-semibold text-destructive">Reject</span>
      ) : null}
      {openSide && !editingId ? (
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
