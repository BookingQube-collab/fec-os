"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  MissedPunchApprovalQueue,
  MyMissedPunchRequests,
} from "@/components/attendance-hr/missed-punch-approval-queue";
import { PunchCorrectionRequest } from "@/components/attendance-hr/punch-correction-request";
import { MyDayCorrectionApprovals } from "@/components/hr/my-day-approvals";
import { RosterPunchFill } from "@/components/hr/roster-punch-fill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/use-auth";
import { useHasDirectReports, useMyDirectReports } from "@/hooks/use-my-direct-reports";
import { listAttendanceCorrections } from "@/lib/attendance-hr.functions";
import { canRequestAttendanceCorrection } from "@/lib/attendance-hr/missed-punch-approval";
import { mayFillRosterDevicePunches } from "@/lib/attendance-hr/roster-punch-fill";
import { mayReviewStaffCorrectionsOnMyDay } from "@/lib/hr/my-day-approvals";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type CorrectionJob = "approve" | "approved" | "fill" | "request";

/** Toast / inbox deep link that must open Approve (not just the Correction tab). */
function hashIsApproveDeepLink(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hash.replace(/^#/, "") === "me-punch-approvals";
}

/** Requester outcome notifies (#me-correction) should open Request, not Approve. */
function hashPrefersRequest(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hash.replace(/^#/, "") === "me-correction";
}

export function MeCorrectionPanel({
  jobTitle = null,
  department = null,
  staffRole = null,
  selfStaff = null,
}: {
  jobTitle?: string | null;
  department?: string | null;
  staffRole?: string | null;
  selfStaff?: { staffId: string; fullName: string; employeeCode: string | null } | null;
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const reports = useMyDirectReports();
  const { hasDirectReports, isPending: reportsPending } = useHasDirectReports();
  const hasReports = (reports.data?.directReportStaffIds.length ?? 0) > 0;

  const showApprove = mayReviewStaffCorrectionsOnMyDay({
    roles,
    hasDirectReports: hasReports,
    jobTitle,
    staffRole,
  });
  const showFill = mayFillRosterDevicePunches({ roles, jobTitle });
  const showRequest = canRequestAttendanceCorrection({ roles, hasDirectReports, jobTitle });

  const jobs = useMemo(() => {
    const next: CorrectionJob[] = [];
    if (showApprove && !reports.isPending) {
      next.push("approve");
      next.push("approved");
    }
    if (showFill) next.push("fill");
    if (showRequest && !reportsPending) next.push("request");
    return next;
  }, [showApprove, showFill, showRequest, reports.isPending, reportsPending]);

  const pendingQ = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "missed-punch-actionable" }),
    queryFn: () => listAttendanceCorrections({ queue: "waiting", actionableOnly: true }),
    enabled: showApprove && !reports.isPending,
    staleTime: STALE.people,
  });
  const approvedQ = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "missed-punch-approved" }),
    queryFn: () => listAttendanceCorrections({ queue: "approved" }),
    enabled: showApprove && !reports.isPending,
    staleTime: STALE.people,
  });
  const mineQ = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "missed-punch-mine" }),
    queryFn: () => listAttendanceCorrections({ queue: "mine" }),
    enabled: showRequest && !reportsPending,
    staleTime: STALE.people,
  });
  const pendingCount = pendingQ.isPending ? null : (pendingQ.data?.length ?? 0);
  const approvedCount = approvedQ.isPending ? null : (approvedQ.data?.length ?? 0);
  const requestCount = mineQ.isPending ? null : (mineQ.data?.length ?? 0);
  const changeRequiredCount = mineQ.isPending
    ? 0
    : (mineQ.data ?? []).filter((row) => row.status === "change_required").length;
  const tabCount: Partial<Record<CorrectionJob, number | null>> = {
    approve: pendingCount,
    approved: approvedCount,
    request: requestCount,
  };

  const [job, setJob] = useState<CorrectionJob | null>(null);
  const pickedDefault = useRef(false);

  useEffect(() => {
    if (jobs.length === 0) return;
    if (showApprove && !reports.isPending && pendingQ.isPending) return;
    if (showRequest && reportsPending) return;
    if (showRequest && !reportsPending && mineQ.isPending) return;

    // Review / inbox `#me-punch-approvals` must open Approve even when the actor
    // also has change-required items (otherwise Review lands on Request).
    // Change-required / `#me-correction` beat the waiting-approvals default on the
    // *first* pick only — do not re-force Request while the URL stays #me-correction.
    const deepLinkApprove = hashIsApproveDeepLink() && jobs.includes("approve");
    const preferRequest =
      !deepLinkApprove &&
      (hashPrefersRequest() || changeRequiredCount > 0) &&
      jobs.includes("request");
    const preferApprove = deepLinkApprove || (!preferRequest && (pendingCount ?? 0) > 0);
    if (pickedDefault.current) {
      if (deepLinkApprove && job !== "approve") {
        setJob("approve");
      }
      return;
    }

    const fallback: CorrectionJob =
      preferApprove
        ? "approve"
        : preferRequest
          ? "request"
          : jobs.includes("request")
            ? "request"
            : jobs[0]!;
    setJob(fallback);
    pickedDefault.current = true;
  }, [
    changeRequiredCount,
    job,
    jobs,
    mineQ.isPending,
    pendingCount,
    pendingQ.isPending,
    reports.isPending,
    reportsPending,
    showApprove,
    showRequest,
  ]);

  useEffect(() => {
    const onHash = () => {
      if (hashIsApproveDeepLink() && jobs.includes("approve")) {
        setJob("approve");
        return;
      }
      // Fresh navigation to #me-correction (e.g. inbox click) opens Request once.
      if (hashPrefersRequest() && jobs.includes("request")) {
        setJob("request");
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [jobs]);

  const permissionsReady = !reports.isPending && !reportsPending;
  if (permissionsReady && jobs.length === 0) return null;
  if (!job || !jobs.includes(job)) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </p>
    );
  }
  const active = job;

  const jobMeta: Record<CorrectionJob, { label: string; hint: string; panel: ReactNode }> = {
    approve: {
      label: t("hr.me.correctionTabApprove"),
      hint: t("hr.me.correctionTabApproveHint"),
      panel: <MyDayCorrectionApprovals jobTitle={jobTitle} staffRole={staffRole} showTitle={false} />,
    },
    approved: {
      label: t("hr.me.correctionTabApproved"),
      hint: t("hr.me.correctionTabApprovedHint"),
      panel: <MissedPunchApprovalQueue queue="approved" />,
    },
    fill: {
      label: t("hr.me.correctionTabFill"),
      hint: t("hr.me.correctionTabFillHint"),
      panel: <RosterPunchFill jobTitle={jobTitle} embedded />,
    },
    request: {
      label: t("hr.me.correctionTabRequest"),
      hint: t("hr.me.correctionTabRequestHint"),
      panel: (
        <div className="space-y-4">
          <PunchCorrectionRequest
            jobTitle={jobTitle}
            department={department}
            selfStaff={selfStaff}
            embedded
          />
          <MyMissedPunchRequests />
        </div>
      ),
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
    <Tabs
      value={active}
      onValueChange={(value) => {
        const next = value as CorrectionJob;
        if (!jobs.includes(next)) return;
        setJob(next);
      }}
      className="space-y-1"
    >
      <TabsList className="ess-tabs w-full justify-start" aria-label={t("hr.me.correction")}>
        {jobs.map((id) => {
          const count = tabCount[id];
          return (
            <TabsTrigger key={id} value={id} className="shrink-0">
              {jobMeta[id].label}
              {count != null ? (
                <span className="ms-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[0.65rem] font-semibold tabular-nums text-primary">
                  {count}
                </span>
              ) : null}
            </TabsTrigger>
          );
        })}
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
