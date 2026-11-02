"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MissedPunchApprovalQueue } from "@/components/attendance-hr/missed-punch-approval-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserRoles } from "@/hooks/use-auth";
import { useMyDirectReports } from "@/hooks/use-my-direct-reports";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { actOnLeaveApproval, getLeaveDocumentUrl, listLeaveRequests } from "@/lib/hr-leave.functions";
import { canApproveLeaveOnMyDay, mayReviewStaffCorrectionsOnMyDay, mayReviewStaffLeaveOnMyDay } from "@/lib/hr/my-day-approvals";
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
  type LeaveListRow = Awaited<ReturnType<typeof listLeaveRequests>>[number];
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
    mutationFn: (input: { leaveId: string; action: "approved" | "rejected" }) => actOnLeaveApproval(input),
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
  const openLeaveDoc = useMutation({
    mutationFn: (leaveId: string) => getLeaveDocumentUrl({ leaveId, purpose: "preview" }),
    onSuccess: (res) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (reports.isPending || !show) return null;

  const directIds = new Set(reports.data?.directReportStaffIds ?? []);
  const rows = historyOnly
    ? (list.data ?? [])
    : (list.data ?? []).filter((row) =>
        canApproveLeaveOnMyDay({
          roles,
          stepRole: row.currentStepRole,
          isOwnRequest: row.staffId === myStaffId,
          isLineManager: directIds.has(row.staffId),
          jobTitle,
          department,
          opsLane: row.opsLane,
        }),
      );

  function leaveStepLabel(stepRole: string | null | undefined, opsLane: string | null | undefined): string {
    if (stepRole === "ops" && opsLane === "fnb_manager") {
      return t("hr.leave.steps.opsFnb", { defaultValue: "F&B Manager" });
    }
    return t(`hr.leave.steps.${stepRole ?? "manager"}`);
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
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p>
      ) : null}
      {list.isError ? <p className="text-sm text-destructive">{list.error.message}</p> : null}
      {!list.isPending && !list.isError && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {historyOnly
            ? t("hr.me.leaveApprovedEmpty", { defaultValue: "No leave approvals from you yet." })
            : t("hr.me.leaveApprovalsEmpty")}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="hd-approval-list">
          {rows.map((row) => {
            const busy = act.isPending && act.variables?.leaveId === row.id;
            const name = row.staffName ?? "Staff";
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
                        className="mt-1 min-h-11"
                        disabled={openLeaveDoc.isPending}
                        onClick={() => openLeaveDoc.mutate(row.id)}
                      >
                        {row.documentFileName ?? t("hr.leave.viewDocument")}
                      </Button>
                    </div>
                  ) : null}
                  <div className="hd-approval__step">
                    {historyOnly ? (
                      <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}>
                        {t(`hr.leave.status.${row.status}`)}
                      </Badge>
                    ) : row.currentStepRole ? (
                      <>
                        <p className="hd-approval__waiting">
                          {t("hr.leave.waitingStep", {
                            step: leaveStepLabel(row.currentStepRole, row.opsLane),
                          })}
                        </p>
                        <Badge variant="warning">{leaveStepLabel(row.currentStepRole, row.opsLane)}</Badge>
                      </>
                    ) : (
                      <span />
                    )}
                  </div>
                  {!historyOnly ? (
                    <div className="hd-approval__actions" role="group" aria-label={t("common.actions")}>
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
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
