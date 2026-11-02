"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { MyDayLeaveApprovals } from "@/components/hr/my-day-approvals";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/use-auth";
import { useHasDirectReports, useMyDirectReports } from "@/hooks/use-my-direct-reports";
import { listLeaveRequests } from "@/lib/hr-leave.functions";
import { mayReviewStaffLeaveOnMyDay } from "@/lib/hr/my-day-approvals";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type LeaveJob = "approve" | "approved" | "request";

function hashIsLeaveApproveDeepLink(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hash.replace(/^#/, "") === "me-leave-approvals";
}

function hashPrefersLeaveApprove(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  return hash === "me-leave-approvals" || hash === "me-leave";
}

export function MeLeavePanel({
  myStaffId,
  jobTitle = null,
  department = null,
  requestPanel,
}: {
  myStaffId: string;
  jobTitle?: string | null;
  department?: string | null;
  /** Leave request form + my history (parent owns the form state). */
  requestPanel: ReactNode;
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const reports = useMyDirectReports();
  const { hasDirectReports, isPending: reportsPending } = useHasDirectReports();
  const hasReports = (reports.data?.directReportStaffIds.length ?? 0) > 0;

  const showApprove = mayReviewStaffLeaveOnMyDay({
    roles,
    hasDirectReports: hasReports,
    jobTitle,
    department,
  });

  const jobs = useMemo(() => {
    const next: LeaveJob[] = [];
    if (showApprove && !reports.isPending) {
      next.push("approve");
      next.push("approved");
    }
    next.push("request");
    return next;
  }, [showApprove, reports.isPending]);

  const pendingQ = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "my-day-leave-approvals" }),
    queryFn: () => listLeaveRequests({ approvals: true }),
    enabled: showApprove && !reports.isPending,
    staleTime: STALE.people,
  });
  const pendingCount = pendingQ.data?.length ?? 0;

  const [job, setJob] = useState<LeaveJob | null>(null);
  const pickedDefault = useRef(false);

  useEffect(() => {
    if (jobs.length === 0) return;
    if (showApprove && !reports.isPending && pendingQ.isPending) return;
    if (reportsPending) return;

    const preferApprove = hashPrefersLeaveApprove() || pendingCount > 0;
    if (pickedDefault.current) {
      if (hashIsLeaveApproveDeepLink() && jobs.includes("approve") && job !== "approve") {
        setJob("approve");
      }
      return;
    }

    const fallback: LeaveJob =
      preferApprove && jobs.includes("approve")
        ? "approve"
        : jobs.includes("request")
          ? "request"
          : jobs[0]!;
    setJob(fallback);
    pickedDefault.current = true;
  }, [
    job,
    jobs,
    pendingCount,
    pendingQ.isPending,
    reports.isPending,
    reportsPending,
    showApprove,
  ]);

  useEffect(() => {
    const onHash = () => {
      if (!hashIsLeaveApproveDeepLink() || !jobs.includes("approve")) return;
      setJob("approve");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [jobs]);

  if (!job || !jobs.includes(job)) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </p>
    );
  }
  const active = job;

  const jobMeta: Record<LeaveJob, { label: string; hint: string; panel: ReactNode }> = {
    approve: {
      label: t("hr.me.leaveTabApprove", { defaultValue: t("hr.me.correctionTabApprove") }),
      hint: t("hr.me.leaveTabApproveHint", {
        defaultValue: "Review leave requests waiting on you (annual, sick, and other types).",
      }),
      panel: (
        <MyDayLeaveApprovals
          myStaffId={myStaffId}
          jobTitle={jobTitle}
          department={department}
          showTitle={false}
          mode="waiting"
        />
      ),
    },
    approved: {
      label: t("hr.me.leaveTabApproved", { defaultValue: t("hr.me.correctionTabApproved") }),
      hint: t("hr.me.leaveTabApprovedHint", {
        defaultValue: "Leave requests you already approved or advanced.",
      }),
      panel: (
        <MyDayLeaveApprovals
          myStaffId={myStaffId}
          jobTitle={jobTitle}
          department={department}
          showTitle={false}
          mode="approved"
        />
      ),
    },
    request: {
      label: t("hr.me.leaveTabRequest", { defaultValue: "Request" }),
      hint: t("hr.me.leaveTabRequestHint", {
        defaultValue: "Apply leave for yourself or your team (same people as punch correction).",
      }),
      panel: requestPanel,
    },
  };

  if (jobs.length === 1) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{jobMeta[active].hint}</p>
        {jobMeta[active].panel}
      </div>
    );
  }

  return (
    <Tabs value={active} onValueChange={(value) => setJob(value as LeaveJob)} className="space-y-1">
      <TabsList className="ess-tabs w-full justify-start" aria-label={t("hr.leave.requestTitle")}>
        {jobs.map((id) => (
          <TabsTrigger key={id} value={id} className="shrink-0">
            {jobMeta[id].label}
            {id === "approve" && pendingCount > 0 ? (
              <span className="ms-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[0.65rem] font-semibold tabular-nums text-primary">
                {pendingCount}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {jobs.map((id) => (
        <TabsContent key={id} value={id} className="space-y-3">
          <p className="text-xs text-muted-foreground">{jobMeta[id].hint}</p>
          {jobMeta[id].panel}
        </TabsContent>
      ))}
    </Tabs>
  );
}
