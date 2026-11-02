"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MissedPunchApprovedHistoryCharts } from "@/components/attendance-hr/missed-punch-approved-history-charts";
import { MissedPunchApprovedHistoryFilters } from "@/components/attendance-hr/missed-punch-approved-history-filters";
import { MissedPunchApprovalQueue } from "@/components/attendance-hr/missed-punch-approval-queue";
import {
  LeaveDocumentLightbox,
  type LeaveDocumentPreviewTarget,
} from "@/components/hr/leave-document-preview";
import {
  LeaveRequestPrintDialog,
  type LeaveRequestPrintPayload,
} from "@/components/hr/leave-request-print-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSites } from "@/hooks/queries/useSites";
import { useUserRoles } from "@/hooks/use-auth";
import { useMyDirectReports } from "@/hooks/use-my-direct-reports";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import {
  EMPTY_APPROVED_HISTORY_FILTERS,
  filterApprovedHistoryRows,
  uniqueApprovedHistoryDepartments,
  uniqueApprovedHistoryLocationIds,
  type ApprovedHistoryFilters,
  type ApprovedHistoryRowLike,
} from "@/lib/attendance-hr/missed-punch-approved-history";
import { actOnLeaveApproval, listLeaveRequests } from "@/lib/hr-leave.functions";
import { canApproveLeaveOnMyDay, mayReviewStaffCorrectionsOnMyDay, mayReviewStaffLeaveOnMyDay } from "@/lib/hr/my-day-approvals";
import { formatLocationLabel, rosterSheetLabel } from "@/lib/locations/normalize";
import { invalidateLeaveLists, isLeaveListQuery } from "@/lib/people-query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function MyDayCorrectionApprovals({
  jobTitle,
  staffRole,
  showTitle = true,
}: {
  jobTitle?: string | null;
  staffRole?: string | null;
  /** When false, omit the queue heading (parent already labels the job). */
  showTitle?: boolean;
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const reports = useMyDirectReports();
  const show = mayReviewStaffCorrectionsOnMyDay({
    roles,
    hasDirectReports: (reports.data?.directReportStaffIds.length ?? 0) > 0,
    jobTitle,
    staffRole,
  });
  if (reports.isPending || !show) return null;
  return (
    <div id="me-punch-approvals" className="hd-stack">
      <MissedPunchApprovalQueue
        actionableOnly
        title={showTitle ? t("hr.me.approvalsTitle") : undefined}
      />
    </div>
  );
}

type LeaveListRow = Awaited<ReturnType<typeof listLeaveRequests>>[number];

function leaveHistoryRowLike(row: LeaveListRow): ApprovedHistoryRowLike {
  return {
    workDate: row.dateFrom,
    dateTo: row.dateTo,
    locationId: row.locationId ?? "",
    department: row.department,
    staffName: row.staffName,
    employeeCode: row.employeeCode,
    status: row.status,
    steps: row.steps ?? [],
  };
}

function leavePriorApprovalLabel(input: {
  stepRole: string;
  status: string;
  actedByName?: string | null;
  opsLane?: string | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
}): string {
  const seat =
    input.stepRole === "ops" && input.opsLane === "fnb_manager"
      ? input.t("hr.leave.steps.opsFnb", { defaultValue: "F&B Manager" })
      : input.t(`hr.leave.steps.${input.stepRole}`, { defaultValue: input.stepRole });
  const name = input.actedByName?.trim();
  if (input.status === "skipped") {
    return name ? `${seat} · skipped · ${name}` : `${seat} · skipped`;
  }
  return name ? `${seat} · ${name}` : seat;
}

export function MyDayLeaveApprovals({
  myStaffId,
  jobTitle,
  department,
  showTitle = true,
  mode = "waiting",
}: {
  myStaffId: string;
  jobTitle?: string | null;
  department?: string | null;
  showTitle?: boolean;
  /** Waiting = Approve tab; approved = history of steps this login already took. */
  mode?: "waiting" | "approved";
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const reports = useMyDirectReports();
  const hasDirectReports = (reports.data?.directReportStaffIds.length ?? 0) > 0;
  const show = mayReviewStaffLeaveOnMyDay({ roles, hasDirectReports, jobTitle, department });
  const qc = useQueryClient();
  const historyOnly = mode === "approved";
  const { data: sites } = useSites({ enabled: historyOnly });
  const [historyFilters, setHistoryFilters] = useState<ApprovedHistoryFilters>(
    EMPTY_APPROVED_HISTORY_FILTERS,
  );
  const listQueryKey = queryKeys.people.attendanceHr({
    view: historyOnly ? "my-day-leave-approved" : "my-day-leave-approvals",
  });
  const list = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      historyOnly
        ? listLeaveRequests({ approvalsHistory: true })
        : listLeaveRequests({ approvals: true }),
    enabled: show && !reports.isPending,
    staleTime: STALE.people,
  });
  const act = useMutation({
    mutationFn: async (input: { leaveId: string; action: "approved" | "rejected" }) => {
      const result = await actOnLeaveApproval(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (input) => {
      if (historyOnly) return { previous: undefined as LeaveListRow[] | undefined };
      // My Day only shows rows this actor can step; drop immediately after click.
      await qc.cancelQueries({ predicate: (query) => isLeaveListQuery(query.queryKey) });
      const previous = qc.getQueryData<LeaveListRow[]>(listQueryKey);
      qc.setQueryData<LeaveListRow[]>(listQueryKey, (old) =>
        (old ?? []).filter((row) => row.id !== input.leaveId),
      );
      return { previous };
    },
    onSuccess: (res) => {
      if (res.final && (res.syncedDays ?? 0) > 0) {
        toast.success(
          t("hr.leave.syncedRoster", {
            days: res.syncedDays,
            defaultValue: `Leave approved — roster updated for {{days}} day(s)`,
          }),
        );
      } else if (res.final) toast.success(t("hr.leave.updated"));
      else toast.success(t("hr.leave.stepAdvanced", { step: res.nextStep ?? "" }));
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listQueryKey, ctx.previous);
      toast.error(error.message);
    },
    onSettled: () => invalidateLeaveLists(qc),
  });
  const [previewDoc, setPreviewDoc] = useState<LeaveDocumentPreviewTarget | null>(null);
  const [printPayload, setPrintPayload] = useState<LeaveRequestPrintPayload | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const directIds = useMemo(
    () => new Set(reports.data?.directReportStaffIds ?? []),
    [reports.data?.directReportStaffIds],
  );
  const rawRows = useMemo(() => {
    if (!show || reports.isPending) return [] as LeaveListRow[];
    return (list.data ?? [])
      .map((row) => {
        const canAct = canApproveLeaveOnMyDay({
          roles,
          stepRole: row.currentStepRole,
          isOwnRequest: row.staffId === myStaffId,
          isLineManager: directIds.has(row.staffId),
          jobTitle,
          department,
          opsLane: row.opsLane,
        });
        return { row, canAct };
      })
      .filter(({ canAct }) => historyOnly || canAct)
      .map(({ row }) => row);
  }, [
    department,
    directIds,
    historyOnly,
    jobTitle,
    list.data,
    myStaffId,
    reports.isPending,
    roles,
    show,
  ]);

  const displayRows = useMemo(() => {
    if (!historyOnly) return rawRows;
    return rawRows.filter(
      (row) => filterApprovedHistoryRows([leaveHistoryRowLike(row)], historyFilters).length === 1,
    );
  }, [historyFilters, historyOnly, rawRows]);

  const siteById = useMemo(() => new Map((sites ?? []).map((site) => [site.id, site])), [sites]);
  const locationLabel = useMemo(() => {
    return (locationId: string) => {
      const site = siteById.get(locationId);
      if (!site) return locationId.slice(0, 8) || t("hr.me.leaveApprovedHistory.unassignedDept");
      return formatLocationLabel(site.code, rosterSheetLabel(site.code, site.name));
    };
  }, [siteById, t]);
  const historyDepartments = useMemo(
    () => (historyOnly ? uniqueApprovedHistoryDepartments(rawRows.map(leaveHistoryRowLike)) : []),
    [historyOnly, rawRows],
  );
  const historyLocations = useMemo(() => {
    if (!historyOnly) return [];
    return uniqueApprovedHistoryLocationIds(rawRows.map(leaveHistoryRowLike)).map((id) => ({
      id,
      label: locationLabel(id),
    }));
  }, [historyOnly, locationLabel, rawRows]);
  const chartRows = useMemo(
    () => (historyOnly ? displayRows.map(leaveHistoryRowLike) : []),
    [displayRows, historyOnly],
  );

  if (reports.isPending || !show) return null;

  function leaveStepLabel(stepRole: string | null | undefined, opsLane: string | null | undefined): string {
    if (stepRole === "ops" && opsLane === "fnb_manager") {
      return t("hr.leave.steps.opsFnb", { defaultValue: "F&B Manager" });
    }
    return t(`hr.leave.steps.${stepRole ?? "manager"}`);
  }

  function toPrintPayload(row: LeaveListRow): LeaveRequestPrintPayload {
    return {
      requestNumber: row.requestNumber,
      requestDate: row.createdAt.slice(0, 10),
      staffName: row.staffName ?? "—",
      employeeCode: row.employeeCode,
      department: row.department,
      jobTitle: row.jobTitle,
      phone: row.phone,
      leaveTypeLabel: t(`hr.leave.types.${row.leaveType}`),
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      days: row.days,
      reason: row.reason,
      status: row.status,
    };
  }

  return (
    <div id={historyOnly ? "me-leave-approved" : "me-leave-approvals"} className="space-y-3">
      {showTitle ? (
        <h3 className="text-sm font-semibold">
          {historyOnly
            ? t("hr.me.leaveApprovedTitle", { defaultValue: "Leave you already handled" })
            : t("hr.me.leaveApprovalsTitle")}
        </h3>
      ) : null}
      {historyOnly ? (
        <MissedPunchApprovedHistoryFilters
          filters={historyFilters}
          onChange={setHistoryFilters}
          departments={historyDepartments}
          locations={historyLocations}
          resultCount={displayRows.length}
          variant="leave"
          idPrefix="leave-approved-history"
        />
      ) : null}
      {historyOnly && chartRows.length > 0 ? (
        <MissedPunchApprovedHistoryCharts
          rows={chartRows}
          locationLabel={locationLabel}
          variant="leave"
        />
      ) : null}
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p>
      ) : null}
      {list.isError ? <p className="text-sm text-destructive">{list.error.message}</p> : null}
      {!list.isPending && !list.isError && displayRows.length === 0 ? (
        <div className="space-y-2 text-sm">
          {historyOnly ? (
            <p className="font-medium">
              {rawRows.length === 0
                ? t("hr.me.leaveApprovedEmpty", { defaultValue: "No leave approvals from you yet." })
                : t("hr.me.leaveApprovedHistory.noFilterMatches", {
                    defaultValue: t("hr.me.approvedHistory.noFilterMatches"),
                  })}
            </p>
          ) : (
            <p className="text-muted-foreground">{t("hr.me.leaveApprovalsEmpty")}</p>
          )}
        </div>
      ) : null}
      {displayRows.length > 0 ? (
        <ul className="hd-approval-list">
          {displayRows.map((row) => {
            const busy = act.isPending && act.variables?.leaveId === row.id;
            const name = row.staffName ?? "Staff";
            const canAct = canApproveLeaveOnMyDay({
              roles,
              stepRole: row.currentStepRole,
              isOwnRequest: row.staffId === myStaffId,
              isLineManager: directIds.has(row.staffId),
              jobTitle,
              department,
              opsLane: row.opsLane,
            });
            // Mirror corrections: actions only when this login can act on the current seat.
            const showActions = !historyOnly && row.status === "pending" && canAct;
            const priorSteps = (row.steps ?? []).filter(
              (step) => step.status === "approved" || step.status === "skipped",
            );
            const showApproved =
              historyOnly ||
              row.status === "approved" ||
              (row.status === "pending" &&
                !canAct &&
                (row.steps ?? []).some((step) => step.status === "approved"));
            return (
              <li key={row.id}>
                <article
                  className="hd-approval"
                  aria-busy={busy || undefined}
                  aria-labelledby={`leave-approval-${row.id}-name`}
                >
                  <header className="hd-approval__top">
                    <div className="min-w-0">
                      <h4 id={`leave-approval-${row.id}-name`} className="hd-approval__name">
                        {name}
                        {row.requestNumber ? (
                          <span className="ms-2 font-mono text-xs font-normal text-muted-foreground">
                            {row.requestNumber}
                          </span>
                        ) : null}
                      </h4>
                      {row.employeeCode ? <p className="hd-approval__code">{row.employeeCode}</p> : null}
                    </div>
                    <span className="hd-approval__kind">{t(`hr.leave.types.${row.leaveType}`)}</span>
                  </header>
                  <dl className="hd-approval__facts">
                    <div className="hd-approval__fact">
                      <dt>{t("hr.leave.from")}</dt>
                      <dd>{formatWorkDateDdMmYyyy(row.dateFrom)}</dd>
                    </div>
                    <div className="hd-approval__fact">
                      <dt>{t("hr.leave.to")}</dt>
                      <dd>{formatWorkDateDdMmYyyy(row.dateTo)}</dd>
                    </div>
                    <div className="hd-approval__fact">
                      <dt>{t("hr.leave.days")}</dt>
                      <dd>{row.days}</dd>
                    </div>
                  </dl>
                  {row.reason ? (
                    <div className="hd-approval__block">
                      <p className="hd-approval__label">{t("hr.me.approvalReason")}</p>
                      <p className="hd-approval__reason">{row.reason}</p>
                    </div>
                  ) : null}
                  {row.documentId ? (
                    <div className="hd-approval__block">
                      <p className="hd-approval__label">{t("hr.leave.sickDocument")}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-1 min-h-11 max-w-full gap-2"
                        onClick={() =>
                          setPreviewDoc({
                            leaveId: row.id,
                            fileName: row.documentFileName,
                            title: `${name} · ${t("hr.leave.sickDocument")}`,
                          })
                        }
                      >
                        <FileText className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">
                          {row.documentFileName ?? t("hr.leave.viewDocument")}
                        </span>
                      </Button>
                    </div>
                  ) : null}
                  {priorSteps.length > 0 ? (
                    <div className="hd-approval__block">
                      <p className="hd-approval__label">{t("hr.me.priorApprovals")}</p>
                      <ul className="hd-approval__trail">
                        {priorSteps.map((step) => (
                          <li key={`${step.stepRole}-${step.status}-${step.actedAt ?? ""}`}>
                            {leavePriorApprovalLabel({
                              stepRole: step.stepRole,
                              status: step.status,
                              actedByName: step.actedByName,
                              opsLane: row.opsLane,
                              t,
                            })}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {showActions || showApproved || (historyOnly && row.status === "pending") ? (
                    <div className="hd-approval__step">
                      {showActions || (historyOnly && row.status === "pending" && row.currentStepRole) ? (
                        <p className="hd-approval__waiting">
                          {t("hr.leave.waitingStep", {
                            step: leaveStepLabel(row.currentStepRole, row.opsLane),
                          })}
                        </p>
                      ) : null}
                      {showActions || (historyOnly && row.status === "pending" && row.currentStepRole) ? (
                        <Badge variant="warning">{leaveStepLabel(row.currentStepRole, row.opsLane)}</Badge>
                      ) : null}
                      {showApproved && !(historyOnly && row.status === "pending") ? (
                        <p className="hd-approval__status hd-approval__status--ok">
                          {t("hr.leave.status.approved")}
                        </p>
                      ) : null}
                      {historyOnly && row.status === "pending" ? (
                        <p className="hd-approval__status hd-approval__status--ok">
                          {t("hr.leave.status.approved")}
                        </p>
                      ) : null}
                      {historyOnly && row.status === "rejected" ? (
                        <p className="hd-approval__status hd-approval__status--no">
                          {t("hr.leave.status.rejected")}
                        </p>
                      ) : null}
                    </div>
                  ) : row.currentStepRole ? (
                    <div className="hd-approval__step">
                      <p className="hd-approval__waiting">
                        {t("hr.leave.waitingStep", {
                          step: leaveStepLabel(row.currentStepRole, row.opsLane),
                        })}
                      </p>
                      <Badge variant="warning">{leaveStepLabel(row.currentStepRole, row.opsLane)}</Badge>
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
                        setPrintPayload(toPrintPayload(row));
                        setPrintOpen(true);
                      }}
                    >
                      {t("hr.leave.print.preview")}
                    </Button>
                    {showActions ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => act.mutate({ leaveId: row.id, action: "approved" })}
                        >
                          {t("hr.leave.approveStep")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => act.mutate({ leaveId: row.id, action: "rejected" })}
                        >
                          {t("hr.leave.reject")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
      <LeaveDocumentLightbox
        doc={previewDoc}
        open={Boolean(previewDoc)}
        onOpenChange={(next) => {
          if (!next) setPreviewDoc(null);
        }}
      />
      <LeaveRequestPrintDialog open={printOpen} onOpenChange={setPrintOpen} payload={printPayload} />
    </div>
  );
}
