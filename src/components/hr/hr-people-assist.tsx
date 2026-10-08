"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from "react";

import { HrAssistantWidget } from "@/components/hr/hr-assistant-widget";
import { HrReviewEmbed } from "@/components/hr/hr-review-panel";
import { AttendanceReviewPanel } from "@/components/hr/attendance-review-panel";
import { LeaveAssistPanel } from "@/components/hr/leave-assist-panel";
import {
  CommandInsightsPanel,
  DocumentNotesPanel,
  EngagementSummaryPanel,
  HrActionCenter,
  OnboardingNotesPanel,
  PayrollReviewPanel,
  PerformanceNotesPanel,
  RecruitmentMatchPanel,
  PayrollQueuePanel,
  ReportExplainPanel,
  TrainingGapPanel,
  WarningNotesPanel,
  WorkforceNotesPanel,
} from "@/components/hr/hr-module-panels";
import { RosterAssistPanel } from "@/components/hr/roster-assist-panel";
import type { CommandCounts } from "@/lib/hr-assist/command-insights";
import { useUserRoles } from "@/hooks/use-auth";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";
import { useAppStore } from "@/stores/app-store";

export type HrAssistTopic =
  | "command"
  | "leave"
  | "payroll"
  | "roster"
  | "attendance"
  | "recruitment"
  | "documents"
  | "onboarding"
  | "warnings"
  | "engagement"
  | "training"
  | "workforce"
  | "performance"
  | "reports"
  | "actions";

export type HrAssistPatch = {
  locationId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  staffId?: string | null;
  periodId?: string | null;
  vacancyId?: string | null;
  reportId?: string | null;
  command?: CommandCounts | null;
  commandState?: "loading" | "error" | "ready";
};

const HrAssistSetContext = createContext<(patch: HrAssistPatch | null) => void>(() => {});
const HrAssistPatchContext = createContext<HrAssistPatch | null>(null);

export function useRegisterHrAssist(patch: HrAssistPatch) {
  const setPatch = useContext(HrAssistSetContext);
  const key = JSON.stringify(patch);
  useEffect(() => {
    setPatch(JSON.parse(key) as HrAssistPatch);
    return () => setPatch(null);
  }, [setPatch, key]);
}

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function topicFor(path: string, tab: string | null): HrAssistTopic | null {
  if (path.startsWith("/people/staff/")) return null;
  if (path === "/people/hr") return "command";
  if (path.startsWith("/people/leave")) return "leave";
  if (path.startsWith("/people/payroll") || path.startsWith("/people/hr/expenses")) return "payroll";
  if (path.startsWith("/people/roster")) return "roster";
  if (path.startsWith("/people/attendance") || path === "/people/field") return "attendance";
  if (path.startsWith("/people/recruitment")) return "recruitment";
  if (
    path.startsWith("/people/hr/documents") ||
    path.startsWith("/people/hr/letters") ||
    path.startsWith("/people/hr/contracts") ||
    path.startsWith("/people/hr/retention")
  ) {
    return "documents";
  }
  if (path.startsWith("/people/hr/onboarding") || path.startsWith("/people/hr/probation")) return "onboarding";
  if (path.startsWith("/people/hr/warnings")) return "warnings";
  if (path.startsWith("/people/hr/engagement")) return "engagement";
  if (path.startsWith("/people/performance") || path.startsWith("/people/kra") || path.startsWith("/leaderboard")) {
    return "performance";
  }
  if (path.startsWith("/people/hr/reports")) return "reports";
  if (path === "/people" && tab === "training") return "training";
  if (path.startsWith("/training")) return "training";
  if (
    path === "/people" ||
    path.startsWith("/people/import") ||
    path.startsWith("/people/hr/quota") ||
    path.startsWith("/people/hr/workforce") ||
    path.startsWith("/people/hr/team") ||
    path.startsWith("/people/hr/hierarchy") ||
    path.startsWith("/people/hr/service-history")
  ) {
    return "workforce";
  }
  if (path.startsWith("/sop")) return "actions";
  if (path.startsWith("/people/")) return "actions";
  return null;
}

function allowed(roles: AppRole[], topic: HrAssistTopic): boolean {
  const can = (cap: Capability) => canUserDo(roles, cap);
  switch (topic) {
    case "payroll":
      return can("payroll.view");
    case "attendance":
      return can("attendance.view");
    case "leave":
      return can("hr.leave.manage") || can("hr.leave.approve_manager");
    case "recruitment":
      return can("recruitment.request");
    case "documents":
      return can("hr.docs.manage");
    case "warnings":
      return can("hr.warnings.manage");
    case "onboarding":
      return can("hr.manage");
    case "performance":
      return can("performance.view");
    case "reports":
      return can("hr.manage");
    case "roster":
      return can("people.view_roster") || can("people.import_roster");
    default:
      return can("people.view_roster");
  }
}

function TopicPanel({
  topic,
  roles,
  locationId,
  dateFrom,
  dateTo,
  staffId,
  periodId,
  vacancyId,
  reportId,
  command,
  commandState,
}: {
  topic: HrAssistTopic;
  roles: AppRole[];
  locationId: string | null;
  dateFrom: string;
  dateTo: string;
  staffId?: string | null;
  periodId?: string | null;
  vacancyId?: string | null;
  reportId?: string | null;
  command?: CommandCounts | null;
  commandState?: "loading" | "error" | "ready";
}) {
  const can = (cap: Capability) => canUserDo(roles, cap);
  if (!allowed(roles, topic)) return null;
  if (topic === "leave") return <LeaveAssistPanel staffId={staffId} />;
  if (topic === "attendance") {
    return <AttendanceReviewPanel locationId={locationId} dateFrom={dateFrom} dateTo={dateTo} />;
  }
  if (topic === "roster") return <RosterAssistPanel locationId={locationId} dateFrom={dateFrom} dateTo={dateTo} />;
  if (topic === "payroll") {
    if (!can("payroll.view")) return null;
    if (periodId) return <PayrollReviewPanel periodId={periodId} />;
    return <PayrollQueuePanel />;
  }
  if (topic === "recruitment") return <RecruitmentMatchPanel vacancyId={vacancyId} />;
  if (topic === "documents") return <DocumentNotesPanel locationId={locationId} />;
  if (topic === "onboarding") return <OnboardingNotesPanel />;
  if (topic === "warnings") return <WarningNotesPanel dateFrom={dateFrom} dateTo={dateTo} />;
  if (topic === "engagement") return <EngagementSummaryPanel locationId={locationId} dateFrom={dateFrom} dateTo={dateTo} />;
  if (topic === "training") return <TrainingGapPanel locationId={locationId} />;
  if (topic === "workforce") {
    return <WorkforceNotesPanel locationId={locationId} dateFrom={dateFrom} dateTo={dateTo} />;
  }
  if (topic === "performance") return <PerformanceNotesPanel />;
  if (topic === "reports") return <ReportExplainPanel reportId={reportId || "employee_master"} />;
  if (topic === "command") {
    return <CommandInsightsPanel queryState={commandState ?? "loading"} counts={command ?? null} />;
  }
  if (topic === "actions") {
    return <HrActionCenter locationId={locationId} dateFrom={dateFrom} dateTo={dateTo} />;
  }
  return null;
}

function useAssistFrame() {
  const pathname = usePathname() || "";
  const search = useSearchParams();
  const tab = search.get("tab");
  const patch = useContext(HrAssistPatchContext);
  const roles = useUserRoles();
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const period = defaultPayrollPeriod(qatarToday());
  const dateFrom = patch?.dateFrom || period.dateFrom;
  const dateTo = patch?.dateTo || period.dateTo;
  const locationId = patch && "locationId" in patch ? (patch.locationId ?? null) : (storeLocationId ?? null);
  const topic = topicFor(pathname, tab);
  const payrollPeriod = pathname.match(/^\/people\/payroll\/([^/]+)$/)?.[1] ?? patch?.periodId ?? null;
  return { roles, locationId, dateFrom, dateTo, topic, tab, pathname, patch, payrollPeriod };
}

function HrPeopleAssistWidget() {
  const frame = useAssistFrame();
  if (!canUserDo(frame.roles, "people.view_roster")) return null;
  const notes = frame.topic ? (
    <HrReviewEmbed>
      <TopicPanel
        topic={frame.topic}
        roles={frame.roles}
        locationId={frame.locationId}
        dateFrom={frame.dateFrom}
        dateTo={frame.dateTo}
        staffId={frame.patch?.staffId}
        periodId={frame.payrollPeriod}
        vacancyId={frame.patch?.vacancyId}
        reportId={frame.patch?.reportId}
        command={frame.patch?.command}
        commandState={frame.patch?.commandState}
      />
    </HrReviewEmbed>
  ) : null;
  return (
    <HrAssistantWidget
      locationId={frame.locationId}
      dateFrom={frame.dateFrom}
      dateTo={frame.dateTo}
      notes={notes}
    />
  );
}

export function HrAssistProvider({ children }: { children: ReactNode }) {
  const [patch, setPatch] = useState<HrAssistPatch | null>(null);
  return (
    <HrAssistSetContext.Provider value={setPatch}>
      <HrAssistPatchContext.Provider value={patch}>
        {children}
        <Suspense fallback={null}>
          <HrPeopleAssistWidget />
        </Suspense>
      </HrAssistPatchContext.Provider>
    </HrAssistSetContext.Provider>
  );
}
