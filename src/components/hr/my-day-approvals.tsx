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
import { actOnLeaveApproval, listLeaveRequests } from "@/lib/hr-leave.functions";
import { canApproveLeaveOnMyDay, mayReviewStaffCorrectionsOnMyDay, mayReviewStaffLeaveOnMyDay } from "@/lib/hr/my-day-approvals";
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
}: {
  myStaffId: string;
  jobTitle?: string | null;
  department?: string | null;
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const reports = useMyDirectReports();
  const hasDirectReports = (reports.data?.directReportStaffIds.length ?? 0) > 0;
  const show = mayReviewStaffLeaveOnMyDay({ roles, hasDirectReports, jobTitle, department });
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "my-day-leave-approvals" }),
    queryFn: () => listLeaveRequests({ approvals: true }),
    enabled: show && !reports.isPending,
    staleTime: STALE.people,
  });
  const act = useMutation({
    mutationFn: (input: { leaveId: string; action: "approved" | "rejected" }) => actOnLeaveApproval(input),
    onSuccess: (res) => {
      if (res.final && (res.syncedDays ?? 0) > 0) toast.success(t("hr.leave.synced", { days: res.syncedDays }));
      else if (res.final) toast.success(t("hr.leave.updated"));
      else toast.success(t("hr.leave.stepAdvanced", { step: res.nextStep ?? "" }));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (reports.isPending || !show) return null;

  const directIds = new Set(reports.data?.directReportStaffIds ?? []);
  const rows = (list.data ?? []).filter((row) =>
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
    <div id="me-leave-approvals" className="space-y-3">
      <h3 className="text-sm font-semibold">{t("hr.me.leaveApprovalsTitle")}</h3>
      {list.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p> : null}
      {list.isError ? <p className="text-sm text-destructive">{list.error.message}</p> : null}
      {!list.isPending && !list.isError && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hr.me.leaveApprovalsEmpty")}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="hd-approval-list">
          {rows.map((row) => {
            const busy = act.isPending && act.variables?.leaveId === row.id;
            const name = row.staffName ?? "Staff";
            return (
              <li key={row.id}>
                <article className="hd-approval" aria-busy={busy || undefined} aria-labelledby={`leave-approval-${row.id}-name`}>
                  <header className="hd-approval__top">
                    <div className="min-w-0">
                      <h4 id={`leave-approval-${row.id}-name`} className="hd-approval__name">
                        {name}
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
                  <div className="hd-approval__step">
                    {row.currentStepRole ? (
                      <p className="hd-approval__waiting">
                        {t("hr.leave.waitingStep", {
                          step: leaveStepLabel(row.currentStepRole, row.opsLane),
                        })}
                      </p>
                    ) : (
                      <span />
                    )}
                    <Badge variant="warning">{leaveStepLabel(row.currentStepRole, row.opsLane)}</Badge>
                  </div>
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
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
