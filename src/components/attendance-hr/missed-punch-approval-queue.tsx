"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MissedPunchApprovedHistoryCharts } from "@/components/attendance-hr/missed-punch-approved-history-charts";
import { MissedPunchApprovedHistoryFilters } from "@/components/attendance-hr/missed-punch-approved-history-filters";
import {
  MissedPunchPrintDialog,
  type MissedPunchPrintPayload,
} from "@/components/hr/missed-punch-print-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSites } from "@/hooks/queries/useSites";
import { formatPunchTime12h, formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import {
  listAttendanceCorrections,
  resubmitMissedPunchRequest,
  reviewAttendanceCorrection,
  submitMissedPunchRequest,
} from "@/lib/attendance-hr.functions";
import {
  EMPTY_APPROVED_HISTORY_FILTERS,
  filterApprovedHistoryRows,
  uniqueApprovedHistoryDepartments,
  uniqueApprovedHistoryLocationIds,
  type ApprovedHistoryFilters,
} from "@/lib/attendance-hr/missed-punch-approved-history";
import {
  correctionCardClocks,
  groupOpenLegacyPunchPairs,
  isEditableMissedPunchStatus,
  isMissedPunchSupervisorSubmitOnlyNote,
  isMissedPunchTeamSubmittedNote,
  missedPunchPrintSignatureActors,
  missedPunchRequestSide,
  missedPunchTeamSubmitterName,
  punchTimeInputValue,
} from "@/lib/attendance-hr/missed-punch-approval";
import { formatLocationLabel, rosterSheetLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { userFacingActionError } from "@/lib/user-facing-action-error";

type CorrectionListRow = Awaited<ReturnType<typeof listAttendanceCorrections>>[number];

/** Matches resubmitMissedPunchRequest / updateMissedPunchRequest server args. */
type ResubmitMissedPunchInput = {
  correctionId: string;
  reason?: string;
  punchInTime?: string | null;
  punchOutTime?: string | null;
  punchTime?: string;
};

function rowClocks(row: CorrectionListRow) {
  return correctionCardClocks(row.punchType, row.punchAt, {
    punchInAt: row.punchInAt,
    punchOutAt: row.punchOutAt,
    previousPunchIn: row.previousPunchIn,
    previousPunchOut: row.previousPunchOut,
  });
}

function punchTypeLabel(row: CorrectionListRow, t: (key: string) => string): string {
  if (row.punchType === "both") return t("hr.me.punchCorrection");
  if (row.punchType === "in") return t("hr.me.punchIn");
  if (row.punchType === "out") return t("hr.me.punchOut");
  return t("hr.me.punchCorrection");
}

function punchTypeKindClass(punchType: CorrectionListRow["punchType"]): string {
  if (punchType === "in") return "hd-approval__kind hd-approval__kind--in";
  if (punchType === "out") return "hd-approval__kind hd-approval__kind--out";
  if (punchType === "both") return "hd-approval__kind hd-approval__kind--both";
  return "hd-approval__kind";
}

function toMissedPunchPrintPayload(
  row: CorrectionListRow,
  t: (key: string) => string,
): MissedPunchPrintPayload {
  const clocks = rowClocks(row);
  const inLabel = clockText(clocks.punchIn);
  const outLabel = clockText(clocks.punchOut);
  const teamNote = row.reviewNote || row.reason;
  const teamSubmitted = isMissedPunchTeamSubmittedNote(teamNote);
  const supervisorSubmitOnly = isMissedPunchSupervisorSubmitOnlyNote(teamNote);
  const submitterName = missedPunchTeamSubmitterName(teamNote);
  const seats = missedPunchPrintSignatureActors({
    steps: row.steps,
    supervisorSubmitOnly,
    submitterName,
    submitterUserId: supervisorSubmitOnly ? row.requestedBy : null,
    submitterSignatureUrl: row.requesterSignatureUrl,
    requestedAt: row.requestedAt,
  });
  return {
    requestNumber: row.requestNumber,
    requestDate: row.requestedAt.slice(0, 10),
    staffName: row.staffName ?? "—",
    employeeCode: row.employeeCode,
    department: row.department,
    jobTitle: row.jobTitle,
    workDate: row.workDate,
    punchTypeLabel: punchTypeLabel(row, t),
    punchAtLabel:
      clocks.punchIn && clocks.punchOut
        ? `${inLabel} / ${outLabel}`
        : clocks.punchIn
          ? inLabel
          : outLabel,
    reason: row.reason,
    status: row.status,
    teamSubmitted,
    supervisorSubmitOnly,
    steps: row.steps.map((step) => ({
      stepRole: step.stepRole,
      status: step.status,
      actedByName: step.actedByName,
      actedAt: step.actedAt,
    })),
    supervisorSignature: {
      name: seats.supervisor.name,
      at: seats.supervisor.at,
      imageUrl: seats.supervisor.imageUrl,
    },
    siteSignature: {
      name: seats.site.name,
      at: seats.site.at,
      imageUrl: seats.site.imageUrl,
    },
    hooSignature: {
      name: seats.hoo.name,
      at: seats.hoo.at,
      imageUrl: seats.hoo.imageUrl,
    },
  };
}

function clockText(iso: string | null): string {
  return formatPunchTime12h(iso) || "—";
}

function useStepLabel() {
  const { t } = useTranslation();
  return (step: string | null | undefined) => {
    if (step === "manager" || step === "ops" || step === "hr" || step === "gm") {
      return t(`hr.me.step.${step}`);
    }
    return t("hr.me.step.manager");
  };
}

export function MissedPunchApprovalQueue({
  hideWhenEmpty = false,
  actionableOnly = false,
  /** Waiting queue (default) or this approver's Approved history. */
  queue = "waiting",
  title,
}: {
  hideWhenEmpty?: boolean;
  /** Employee home: do not list other people's decided corrections. */
  actionableOnly?: boolean;
  queue?: "waiting" | "approved";
  title?: string;
}) {
  const { t } = useTranslation();
  const stepLabel = useStepLabel();
  const qc = useQueryClient();
  const historyOnly = queue === "approved";
  const { data: sites } = useSites({ enabled: historyOnly });
  const [historyFilters, setHistoryFilters] = useState<ApprovedHistoryFilters>(
    EMPTY_APPROVED_HISTORY_FILTERS,
  );
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: historyOnly
        ? "missed-punch-approved"
        : actionableOnly
          ? "missed-punch-actionable"
          : "missed-punch-waiting",
    }),
    queryFn: () =>
      listAttendanceCorrections({
        queue: historyOnly ? "approved" : "waiting",
        actionableOnly: historyOnly ? false : actionableOnly,
      }),
    staleTime: STALE.people,
  });
  const [printPayload, setPrintPayload] = useState<MissedPunchPrintPayload | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const reviewMut = useMutation({
    mutationFn: (input: {
      id: string;
      decision: "approved" | "rejected" | "change_required";
      /** Display-only; server expands open legacy same-day siblings from this id. */
      reviewIds?: string[];
    }) => reviewAttendanceCorrection({ id: input.id, decision: input.decision }),
    onSuccess: () => {
      toast.success(t("hr.leave.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) =>
      toast.error(userFacingActionError(e, "Could not update the punch correction. Try again.")),
  });
  const rows = q.data ?? [];
  const filteredRows = useMemo(
    () => (historyOnly ? filterApprovedHistoryRows(rows, historyFilters) : rows),
    [historyOnly, rows, historyFilters],
  );
  const cards = groupOpenLegacyPunchPairs(filteredRows);
  const siteById = useMemo(() => new Map((sites ?? []).map((site) => [site.id, site])), [sites]);
  const locationLabel = useMemo(() => {
    return (locationId: string) => {
      const site = siteById.get(locationId);
      if (!site) return locationId.slice(0, 8);
      return formatLocationLabel(site.code, rosterSheetLabel(site.code, site.name));
    };
  }, [siteById]);
  const historyDepartments = useMemo(
    () => (historyOnly ? uniqueApprovedHistoryDepartments(rows) : []),
    [historyOnly, rows],
  );
  const historyLocations = useMemo(() => {
    if (!historyOnly) return [];
    return uniqueApprovedHistoryLocationIds(rows).map((id) => ({
      id,
      label: locationLabel(id),
    }));
  }, [historyOnly, rows, locationLabel]);
  if (hideWhenEmpty && cards.length === 0 && !historyOnly) return null;

  return (
    <div className="space-y-3">
      {title && cards.length > 0 ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {historyOnly ? (
        <MissedPunchApprovedHistoryFilters
          filters={historyFilters}
          onChange={setHistoryFilters}
          departments={historyDepartments}
          locations={historyLocations}
          resultCount={cards.length}
        />
      ) : null}
      {historyOnly && filteredRows.length > 0 ? (
        <MissedPunchApprovedHistoryCharts rows={filteredRows} locationLabel={locationLabel} />
      ) : null}
      {cards.length === 0 ? (
        <div className="space-y-2 text-sm">
          {historyOnly ? (
            <p className="font-medium">
              {rows.length === 0
                ? t("hr.me.correctionApprovedEmpty")
                : t("hr.me.approvedHistory.noFilterMatches")}
            </p>
          ) : (
            <>
              <p className="font-medium">No missed punch requests are waiting on you.</p>
              <p className="text-muted-foreground">
                A correction for yourself goes to your site supervisor (Sr. Site Supervisor), then Head
                of Operations (or F&B Manager for F&B staff). Once that ops seat approves, attendance
                updates immediately — HR and General Manager only keep history. When your reporting
                manager is already that ops seat, the request waits there first. A regular supervisor
                team correction waits on the Sr. Site Supervisor first; only a Venue / Site / Sr. Site
                supervisor title may approve that seat on submit, then ops.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="hd-approval-list">
          {cards.map((card) => {
            const row = card.primary;
            const clocks = correctionCardClocks(card.punchType, row.punchAt, {
              punchInAt: card.punchInAt,
              punchOutAt: card.punchOutAt,
              previousPunchIn: row.previousPunchIn,
              previousPunchOut: row.previousPunchOut,
            });
            const busy =
              reviewMut.isPending &&
              Boolean(
                reviewMut.variables?.id === row.id ||
                  (reviewMut.variables?.reviewIds ?? []).some((id) => card.reviewIds.includes(id)),
              );
            const showActions = !historyOnly && row.status === "pending" && row.canAct;
            const showApproved =
              historyOnly ||
              row.status === "approved" ||
              (row.status === "pending" && !row.canAct && row.steps.some((step) => step.status === "approved"));
            const showReject = !historyOnly && row.status === "rejected";
            const showChange = !historyOnly && row.status === "change_required";
            const displayType = card.punchType ?? row.punchType;
            const punchLabel = displayType
              ? punchTypeLabel({ ...row, punchType: displayType }, t)
              : null;
            const teamNote = row.reviewNote || row.reason;
            const supervisorSubmitOnly = isMissedPunchSupervisorSubmitOnlyNote(teamNote);
            const submitterName = missedPunchTeamSubmitterName(teamNote);
            const managerStep = row.steps.find((step) => step.stepRole === "manager");
            const managerSeatOpen =
              !managerStep || managerStep.status === "pending";
            const priorSteps = row.steps.filter(
              (step) => step.status === "approved" || step.status === "skipped",
            );
            const showSupervisorSubmitted =
              supervisorSubmitOnly && managerSeatOpen && Boolean(submitterName);
            const name = row.staffName ?? "Staff";
            const numberLabel = card.requestNumbers.length
              ? card.requestNumbers.join(" · ")
              : row.requestNumber;
            return (
              <li key={card.reviewIds.join("-")}>
                <article className="hd-approval" aria-busy={busy || undefined} aria-labelledby={`punch-approval-${row.id}-name`}>
                  <header className="hd-approval__top">
                    <div className="min-w-0">
                      <h4 id={`punch-approval-${row.id}-name`} className="hd-approval__name">
                        {name}
                        {numberLabel ? (
                          <span className="ms-2 font-mono text-xs font-normal text-muted-foreground">
                            {numberLabel}
                          </span>
                        ) : null}
                      </h4>
                      {row.employeeCode ? <p className="hd-approval__code">{row.employeeCode}</p> : null}
                    </div>
                    {punchLabel ? (
                      <span className={punchTypeKindClass(displayType)}>{punchLabel}</span>
                    ) : null}
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
                  {showSupervisorSubmitted || priorSteps.length > 0 ? (
                    <div className="hd-approval__block">
                      <p className="hd-approval__label">{t("hr.me.priorApprovals")}</p>
                      <ul className="hd-approval__trail">
                        {showSupervisorSubmitted ? (
                          <li key="supervisor-submitted">
                            {t("hr.me.supervisorSubmitted")}
                            {submitterName ? ` · ${submitterName}` : ""}
                          </li>
                        ) : null}
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
                      {showActions || (historyOnly && row.status === "pending" && row.currentStepRole) ? (
                        <p className="hd-approval__waiting">
                          {t("hr.me.waitingFor", { who: stepLabel(row.currentStepRole) })}
                        </p>
                      ) : null}
                      {showActions || (historyOnly && row.status === "pending" && row.currentStepRole) ? (
                        <Badge variant="warning">{stepLabel(row.currentStepRole)}</Badge>
                      ) : null}
                      {showApproved && !(historyOnly && row.status === "pending") ? (
                        <p className="hd-approval__status hd-approval__status--ok">{t("hr.me.punchApproved")}</p>
                      ) : null}
                      {historyOnly && row.status === "pending" ? (
                        <p className="hd-approval__status hd-approval__status--ok">{t("hr.me.punchApproved")}</p>
                      ) : null}
                      {showReject ? <p className="hd-approval__status hd-approval__status--no">Reject</p> : null}
                      {showChange ? <p className="hd-approval__status hd-approval__status--change">Change required</p> : null}
                    </div>
                  ) : null}
                  <div className="hd-approval__actions" role="group" aria-label={t("common.actions")}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPrintPayload(
                          toMissedPunchPrintPayload(
                            {
                              ...row,
                              punchType: displayType,
                              punchInAt: card.punchInAt,
                              punchOutAt: card.punchOutAt,
                              requestNumber: numberLabel,
                            },
                            t,
                          ),
                        );
                        setPrintOpen(true);
                      }}
                    >
                      {t("hr.missedPunch.print.preview")}
                    </Button>
                  {showActions ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11"
                        disabled={busy}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          reviewMut.mutate({
                            id: row.id,
                            decision: "approved",
                            reviewIds: card.reviewIds,
                          });
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
                          reviewMut.mutate({
                            id: row.id,
                            decision: "change_required",
                            reviewIds: card.reviewIds,
                          });
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
                          reviewMut.mutate({
                            id: row.id,
                            decision: "rejected",
                            reviewIds: card.reviewIds,
                          });
                        }}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      <MissedPunchPrintDialog open={printOpen} onOpenChange={setPrintOpen} payload={printPayload} />
    </div>
  );
}

export function MyMissedPunchRequests() {
  const { t } = useTranslation();
  const stepLabel = useStepLabel();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [punchInTime, setPunchInTime] = useState("");
  const [punchOutTime, setPunchOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [printPayload, setPrintPayload] = useState<MissedPunchPrintPayload | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "missed-punch-mine" }),
    queryFn: () => listAttendanceCorrections({ queue: "mine" }),
    staleTime: STALE.people,
  });
  const saveEdit = useMutation({
    mutationFn: async (input: ResubmitMissedPunchInput) => {
      const result = await resubmitMissedPunchRequest(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("hr.me.punchEditSaved"));
      setEditingId(null);
      setPunchInTime("");
      setPunchOutTime("");
      setReason("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) =>
      toast.error(userFacingActionError(e, "Could not update the punch correction. Try again.")),
  });
  const rows = (q.data ?? []).filter(
    (row) =>
      row.status === "pending" ||
      row.status === "rejected" ||
      row.status === "approved" ||
      row.status === "change_required",
  );
  const cards = groupOpenLegacyPunchPairs(rows).slice(0, 8);
  if (!cards.length) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("hr.me.yourPunchRequests")}</p>
      {cards.map((card) => {
        const row = card.primary;
        const clocks = correctionCardClocks(card.punchType, row.punchAt, {
          punchInAt: card.punchInAt,
          punchOutAt: card.punchOutAt,
          previousPunchIn: row.previousPunchIn,
          previousPunchOut: row.previousPunchOut,
        });
        const editable = isEditableMissedPunchStatus(row.status) && !card.paired;
        const editing = editingId === row.id;
        const displayType = card.punchType ?? row.punchType;
        const typeLabel = displayType ? punchTypeLabel({ ...row, punchType: displayType }, t) : null;
        const numberLabel = card.requestNumbers.length
          ? card.requestNumbers.join(" · ")
          : row.requestNumber;
        return (
          <div key={card.reviewIds.join("-")} className="space-y-2 rounded-xl border border-border/60 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                {row.workDate ?? "—"}
                {typeLabel ? ` · ${typeLabel}` : ""}
                {numberLabel ? (
                  <span className="ms-1 font-mono text-[11px] text-muted-foreground">{numberLabel}</span>
                ) : null}
                <span className="mt-0.5 block text-muted-foreground">
                  {t("hr.me.punchIn")} {clockText(clocks.punchIn)} · {t("hr.me.punchOut")} {clockText(clocks.punchOut)}
                </span>
              </span>
              <div className="flex shrink-0 flex-col items-end gap-1">
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-9"
                  onClick={() => {
                    setPrintPayload(
                      toMissedPunchPrintPayload(
                        {
                          ...row,
                          punchType: displayType,
                          punchInAt: card.punchInAt,
                          punchOutAt: card.punchOutAt,
                          requestNumber: numberLabel,
                        },
                        t,
                      ),
                    );
                    setPrintOpen(true);
                  }}
                >
                  {t("hr.missedPunch.print.preview")}
                </Button>
                {editable && !editing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                    onClick={() => {
                      setEditingId(row.id);
                      setPunchInTime(punchTimeInputValue(card.punchInAt ?? (row.punchType === "in" ? row.punchAt : null)));
                      setPunchOutTime(
                        punchTimeInputValue(card.punchOutAt ?? (row.punchType === "out" ? row.punchAt : null)),
                      );
                      setReason(row.reason ?? "");
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                ) : null}
              </div>
            </div>
            {editing ? (
              <div className="space-y-2 border-t border-border/50 pt-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">{t("hr.me.punchIn")}</Label>
                    <Input
                      className="mt-1 min-h-11"
                      type="time"
                      value={punchInTime}
                      onChange={(e) => setPunchInTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("hr.me.punchOut")}</Label>
                    <Input
                      className="mt-1 min-h-11"
                      type="time"
                      value={punchOutTime}
                      onChange={(e) => setPunchOutTime(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t("hr.me.punchReason")}</Label>
                  <Input
                    className="mt-1 min-h-11"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={(!punchInTime && !punchOutTime) || saveEdit.isPending}
                    onClick={() =>
                      saveEdit.mutate({
                        correctionId: row.id,
                        punchInTime: punchInTime || null,
                        punchOutTime: punchOutTime || null,
                        reason: reason.trim() || undefined,
                      })
                    }
                  >
                    {row.status === "change_required" ? t("hr.me.sendToSupervisor") : t("hr.me.savePunchEdit")}
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(null);
                      setPunchInTime("");
                      setPunchOutTime("");
                      setReason("");
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      <MissedPunchPrintDialog open={printOpen} onOpenChange={setPrintOpen} payload={printPayload} />
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
  });
  const pendingRows = (mine.data ?? []).filter((row) => row.summaryId === summaryId && row.status === "pending");
  const changeRows = (mine.data ?? []).filter((row) => row.summaryId === summaryId && row.status === "change_required");
  const hasOpenRequest = pendingRows.length > 0 || changeRows.length > 0;
  const rejected = (mine.data ?? []).find((row) => row.summaryId === summaryId && row.status === "rejected");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [punchInTime, setPunchInTime] = useState("");
  const [punchOutTime, setPunchOutTime] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setPunchInTime("");
    setPunchOutTime("");
    setReason("");
  };
  const submit = useMutation({
    mutationFn: async (input: {
      summaryId: string;
      punchInTime?: string | null;
      punchOutTime?: string | null;
      reason?: string;
    }) => {
      const result = await submitMissedPunchRequest(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (result) => {
      if (result.approverCount === 0) toast.message(t("hr.me.savedNoSupervisor"));
      else toast.success(t("hr.me.sentToSupervisor"));
      resetForm();
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) =>
      toast.error(userFacingActionError(e, "Could not submit the punch correction. Try again.")),
  });
  const resubmit = useMutation({
    mutationFn: async (input: ResubmitMissedPunchInput) => {
      const result = await resubmitMissedPunchRequest(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_result, variables) => {
      const edited = (mine.data ?? []).find((row) => row.id === variables.correctionId);
      if (edited?.status === "pending") toast.success(t("hr.me.punchEditSaved"));
      else if (_result.approverCount === 0) toast.message(t("hr.me.savedNoSupervisor"));
      else toast.success(t("hr.me.sentToSupervisor"));
      resetForm();
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) =>
      toast.error(userFacingActionError(e, "Could not update the punch correction. Try again.")),
  });

  const editableRows = [...pendingRows, ...changeRows];
  if (!side && editableRows.length === 0) return null;

  const renderEditableCard = (row: (typeof editableRows)[number]) => {
    const clocks = rowClocks(row);
    const editing = editingId === row.id;
    const changeRequired = row.status === "change_required";
    const typeLabel =
      row.punchType === "both"
        ? punchTypeLabel(row, t)
        : row.punchType === "out"
          ? t("hr.me.punchOut")
          : t("hr.me.punchIn");
    return (
      <div
        key={row.id}
        className={`space-y-2 rounded-xl border bg-background/80 p-3 ${
          changeRequired ? "border-amber-300/80" : "border-border/70"
        }`}
      >
        {changeRequired ? (
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Change required</p>
        ) : (
          <Badge variant="warning">
            {typeLabel}
            {" · "}
            {t("hr.me.waitingFor", { who: stepLabel(row.currentStepRole) })}
          </Badge>
        )}
        <p className="text-xs text-muted-foreground">
          {t("hr.me.punchIn")} {clockText(clocks.punchIn)}
          <span className="mx-1.5">·</span>
          {t("hr.me.punchOut")} {clockText(clocks.punchOut)}
        </p>
        {row.reason ? <p className="text-xs text-muted-foreground">{row.reason}</p> : null}
        {editing ? (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("hr.me.punchIn")}</Label>
                <Input
                  className="mt-1 min-h-11"
                  type="time"
                  value={punchInTime}
                  onChange={(e) => setPunchInTime(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">{t("hr.me.punchOut")}</Label>
                <Input
                  className="mt-1 min-h-11"
                  type="time"
                  value={punchOutTime}
                  onChange={(e) => setPunchOutTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("hr.me.punchReason")}</Label>
              <Input className="mt-1 min-h-11" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-h-11"
                disabled={(!punchInTime && !punchOutTime) || resubmit.isPending}
                onClick={() =>
                  resubmit.mutate({
                    correctionId: row.id,
                    punchInTime: punchInTime || null,
                    punchOutTime: punchOutTime || null,
                    reason: reason.trim() || undefined,
                  })
                }
              >
                {changeRequired ? t("hr.me.sendToSupervisor") : t("hr.me.savePunchEdit")}
              </Button>
              <Button type="button" className="min-h-11" variant="secondary" onClick={() => resetForm()}>
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
              setFormOpen(false);
              setPunchInTime(punchTimeInputValue(row.punchInAt ?? (row.punchType === "in" ? row.punchAt : null)));
              setPunchOutTime(punchTimeInputValue(row.punchOutAt ?? (row.punchType === "out" ? row.punchAt : null)));
              setReason(row.reason ?? "");
            }}
          >
            {changeRequired ? "Update and send again" : t("common.edit")}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-2 space-y-2">
      {editableRows.map(renderEditableCard)}
      {rejected && !formOpen ? (
        <span className="text-sm font-semibold text-destructive">Reject</span>
      ) : null}
      {formOpen && !editingId ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-background/80 p-3">
          <p className="text-xs font-semibold">{t("hr.me.requestPunchCorrection")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("hr.me.punchIn")}</Label>
              <Input
                className="mt-1 min-h-11"
                type="time"
                value={punchInTime}
                onChange={(e) => setPunchInTime(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t("hr.me.punchOut")}</Label>
              <Input
                className="mt-1 min-h-11"
                type="time"
                value={punchOutTime}
                onChange={(e) => setPunchOutTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("hr.me.punchReason")}</Label>
            <Input className="mt-1 min-h-11" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={(!punchInTime && !punchOutTime) || submit.isPending}
              onClick={() =>
                submit.mutate({
                  summaryId,
                  punchInTime: punchInTime || null,
                  punchOutTime: punchOutTime || null,
                  reason: reason.trim() || undefined,
                })
              }
            >
              {t("hr.me.sendToSupervisor")}
            </Button>
            <Button className="min-h-11" variant="secondary" onClick={() => resetForm()}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {side && !hasOpenRequest && !formOpen ? (
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setPunchInTime("");
            setPunchOutTime("");
            setReason("");
            setFormOpen(true);
          }}
        >
          {t("hr.me.requestPunchCorrection")}
        </Button>
      ) : null}
    </div>
  );
}
