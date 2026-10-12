"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MissedPunchApprovalQueue } from "@/components/attendance-hr/missed-punch-approval-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserRoles } from "@/hooks/use-auth";
import { useMyDirectReports } from "@/hooks/use-my-direct-reports";
import { actOnLeaveApproval, listLeaveRequests } from "@/lib/hr-leave.functions";
import { canApproveLeaveOnMyDay, mayReviewStaffCorrectionsOnMyDay, mayReviewStaffLeaveOnMyDay } from "@/lib/hr/my-day-approvals";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function MyDayCorrectionApprovals({ jobTitle }: { jobTitle?: string | null }) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const reports = useMyDirectReports();
  const show = mayReviewStaffCorrectionsOnMyDay({
    roles,
    hasDirectReports: (reports.data?.directReportStaffIds.length ?? 0) > 0,
    jobTitle,
  });
  if (reports.isPending || !show) return null;
  return (
    <div id="me-punch-approvals" className="hd-stack">
      <MissedPunchApprovalQueue actionableOnly title={t("hr.me.approvalsTitle")} />
    </div>
  );
}

export function MyDayLeaveApprovals({
  myStaffId,
  jobTitle,
}: {
  myStaffId: string;
  jobTitle?: string | null;
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const reports = useMyDirectReports();
  const hasDirectReports = (reports.data?.directReportStaffIds.length ?? 0) > 0;
  const show = mayReviewStaffLeaveOnMyDay({ roles, hasDirectReports, jobTitle });
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
    }),
  );

  return (
    <div id="me-leave-approvals" className="space-y-3">
      <h3 className="text-sm font-semibold">{t("hr.me.leaveApprovalsTitle")}</h3>
      {list.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p> : null}
      {list.isError ? <p className="text-sm text-destructive">{list.error.message}</p> : null}
      {!list.isPending && !list.isError && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hr.me.leaveApprovalsEmpty")}</p>
      ) : null}
      {rows.map((row) => {
        const busy = act.isPending && act.variables?.leaveId === row.id;
        return (
          <div key={row.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-border/70 bg-card px-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {row.staffName ?? "Staff"}
                {row.employeeCode ? ` · ${row.employeeCode}` : ""} · {t(`hr.leave.types.${row.leaveType}`)}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.dateFrom} → {row.dateTo} · {row.days}d
                {row.reason ? ` · ${row.reason}` : ""}
              </p>
              {row.currentStepRole ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("hr.leave.waitingStep", { step: t(`hr.leave.steps.${row.currentStepRole}`) })}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="warning">{t(`hr.leave.steps.${row.currentStepRole ?? "manager"}`)}</Badge>
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
          </div>
        );
      })}
    </div>
  );
}
