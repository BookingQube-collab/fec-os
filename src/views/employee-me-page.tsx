"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecLoader } from "@/components/fec";
import {
  MissedPunchApprovalQueue,
  MyMissedPunchRequests,
} from "@/components/attendance-hr/missed-punch-approval-queue";
import {
  LeaveDocumentLightbox,
  type LeaveDocumentPreviewTarget,
} from "@/components/hr/leave-document-preview";
import { LeavePlannerGateBanner } from "@/components/hr/leave-planner-gate";
import { MeLeavePanel } from "@/components/hr/me-leave-panel";
import { MeLeaveApplyCalendar } from "@/components/hr/me-leave-apply-calendar";
import { MeLeaveEntitlementCard } from "@/components/hr/me-leave-entitlement-card";
import { MeLeavePolicyPreview } from "@/components/hr/me-leave-policy-preview";
import { IncompletePunchRosterSelf } from "@/components/hr/incomplete-punch-roster-self";
import { MeCorrectionPanel } from "@/components/hr/me-correction-panel";
import { MeAttendanceLeaveCalendar } from "@/components/hr/me-attendance-leave-calendar";
import { EmployeeAttendanceCalendar } from "@/components/hr/employee-attendance-calendar";
import { EmployeeIssuesList, EmployeeRosterList } from "@/components/hr/employee-self-dashboard";
import { MySuggestionsPanel } from "@/components/hr/my-suggestions-panel";
import { SelfCheckCard } from "@/components/hr/self-check-card";
import { HrShell } from "@/components/hr/hr-shell";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { canSeeAttendanceLeaveCalendar } from "@/lib/attendance-listing-access";
import {
  LeaveRequestPrintDialog,
  type LeaveRequestPrintPayload,
} from "@/components/hr/leave-request-print-form";
import {
  PayslipPrintDialog,
  type PayslipPrintPayload,
} from "@/components/hr/payslip-print-form";
import {
  useMyAttendance,
  useMyEmployeeProfile,
  useMyIssues,
  useMyLeaveBalances,
  useMyLeaveRequests,
  useMyRoster,
} from "@/hooks/queries/use-employee-self";
import { defaultPayrollPeriod, monthBounds } from "@/lib/attendance-hr/roster-period";
import { monthDateRange } from "@/lib/daily-ops/roster-calendar-utils";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { showsSupervisorTeamToday } from "@/lib/hr/team-today";
import { isEmployeeHomeAudience, type AppRole } from "@/lib/rbac";
import { TeamTodayPanel } from "@/components/hr/team-today-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { extractStaffIdentityDocument, getEmployeeDocumentUrl, listEmployeeDocuments, uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import { fileToBase64, IDENTITY_FILE_ACCEPT, IDENTITY_FILE_MAX_BYTES, identityFileContentType } from "@/lib/hr/identity-file";
import { applyDocumentEditorExtraction, isIdentityDocType } from "@/lib/hr/identity-document-parse";
import { listLeaveSubjects, reviewLeaveRequest, submitLeaveRequest } from "@/lib/hr-leave.functions";
import { userFacingActionError } from "@/lib/user-facing-action-error";
import { opsStepApproverLabel } from "@/lib/approval-ops-routing";
import { listAnnouncements } from "@/lib/hr-announcements.functions";
import { listAirTicketEntitlements } from "@/lib/hr-air-ticket.functions";
import { getPayslipPrintPayload, listMyPayslips } from "@/lib/hr-payroll.functions";
import { MyKraScorecards } from "@/components/people/my-kra-scorecard";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { invalidateLeaveLists } from "@/lib/people-query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { HR_EMERGENCY_TREATMENTS, HR_LEAVE_TYPES } from "@/lib/hr-leave";
import { type LeaveConflict } from "@/lib/hr-advanced";

const INSTALL_DISMISS_KEY = "fec-employee-install-dismissed";
const EMPLOYEE_DOC_TYPES = ["qid", "passport", "visa", "cv", "educational_certificate", "medical_certificate", "leave_document", "other"] as const;

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

type MeTab =
  | "home"
  | "profile"
  | "correction"
  | "attendance"
  | "roster"
  | "leave"
  | "issues"
  | "suggestions"
  | "documents"
  | "announcements"
  | "tickets"
  | "payslips"
  | "kra";

const TAB_HASH: Record<MeTab, string> = {
  home: "",
  profile: "#me-profile",
  correction: "#me-correction",
  attendance: "#me-attendance",
  roster: "#me-roster",
  leave: "#me-leave",
  issues: "#me-issues",
  suggestions: "#me-suggestions",
  documents: "#me-documents",
  announcements: "#me-announcements",
  tickets: "#me-tickets",
  payslips: "#me-payslips",
  kra: "#me-kra",
};

function tabFromHash(hash: string): MeTab | null {
  const id = hash.replace(/^#/, "");
  if (!id) return "home";
  // Management Home hosts the attendance calendar; keep old #me-calendar bookmarks working.
  if (id === "me-calendar" || id === "me-home") return "home";
  if (id === "me-punch-approvals" || id === "me-leave-approvals") {
    return id === "me-leave-approvals" ? "leave" : "correction";
  }
  const match = (Object.entries(TAB_HASH) as Array<[MeTab, string]>).find(([, value]) => value === `#${id}`);
  return match?.[0] ?? null;
}

function EssPanel({
  id,
  title,
  hint,
  children,
}: {
  id?: string;
  title: string;
  hint?: string | null;
  children: ReactNode;
}) {
  return (
    <section id={id} className="hd-card hd-stack">
      <div className="hd-card__head">
        <h2 className="hd-card__title">{title}</h2>
      </div>
      <div className="hd-section">
        {hint ? <p className="hd-hint">{hint}</p> : null}
        {children}
      </div>
    </section>
  );
}

function EssEmpty({ children }: { children: ReactNode }) {
  return <p className="hd-empty">{children}</p>;
}

function ProfileFacts({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  const filled = rows.filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (filled.length === 0) return null;
  return (
    <dl>
      {filled.map(([label, value]) => (
        <div key={label} className="hd-person">
          <dt>{label}</dt>
          <dd>
            <strong>{value}</strong>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function EmployeeMePage() {
  const { t } = useTranslation();
  const { roles, profile: sessionProfile } = useAuth();
  const roleList = roles.map((role) => role.role as AppRole);
  const showTeamToday =
    isEmployeeHomeAudience(roleList) &&
    showsSupervisorTeamToday(roleList, sessionProfile?.job_title, sessionProfile?.staff_role);
  const qc = useQueryClient();
  const canIssues = usePermission("issues.view");
  const { hasDirectReports } = useHasDirectReports();
  const showAttendanceLeaveCalendar = canSeeAttendanceLeaveCalendar(
    roleList,
    hasDirectReports,
    sessionProfile?.job_title,
    sessionProfile?.department,
    sessionProfile?.staff_role,
  );
  const [leaveType, setLeaveType] = useState<(typeof HR_LEAVE_TYPES)[number]>("annual");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [leaveCalMonth, setLeaveCalMonth] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }).slice(0, 7),
  );
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveStaffId, setLeaveStaffId] = useState("");
  const [leaveDocFile, setLeaveDocFile] = useState<File | null>(null);
  const [leaveDocInputKey, setLeaveDocInputKey] = useState(0);
  const [compassionateScope, setCompassionateScope] = useState<"inside_qatar" | "outside_qatar">("inside_qatar");
  const [emergencyTreatment, setEmergencyTreatment] =
    useState<(typeof HR_EMERGENCY_TREATMENTS)[number]>("unpaid");
  const [leaveConflicts, setLeaveConflicts] = useState<LeaveConflict[]>([]);
  const [plannerReasons, setPlannerReasons] = useState<string[]>([]);
  const [leaveBalanceBlocked, setLeaveBalanceBlocked] = useState(false);
  const [leavePreviewDoc, setLeavePreviewDoc] = useState<LeaveDocumentPreviewTarget | null>(null);
  const [leavePrintPayload, setLeavePrintPayload] = useState<
    LeaveRequestPrintPayload | LeaveRequestPrintPayload[] | null
  >(null);
  const [leavePrintOpen, setLeavePrintOpen] = useState(false);
  const [payslipPrintPayload, setPayslipPrintPayload] = useState<PayslipPrintPayload | null>(null);
  const [payslipPrintOpen, setPayslipPrintOpen] = useState(false);
  const [payslipLoadingId, setPayslipLoadingId] = useState<string | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [docType, setDocType] = useState<(typeof EMPLOYEE_DOC_TYPES)[number]>("qid");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docNumber, setDocNumber] = useState("");
  const [docExpiry, setDocExpiry] = useState("");
  const [docNumberSuggestion, setDocNumberSuggestion] = useState("");
  const [docExpirySuggestion, setDocExpirySuggestion] = useState("");
  const [docExtractNote, setDocExtractNote] = useState("");
  const [docReading, setDocReading] = useState(false);
  const [docInputKey, setDocInputKey] = useState(0);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
      setInstallDismissed(dismissed || isStandalonePwa());
    } catch {
      setInstallDismissed(isStandalonePwa());
    }
  }, []);

  const profile = useMyEmployeeProfile();
  const linked = Boolean(profile.data?.id);
  const selfReady = linked || profile.isError;
  const [tab, setTab] = useState<MeTab>("home");
  const todayQatarYmd = useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }),
    [],
  );
  const [attendanceMonth, setAttendanceMonth] = useState(
    () => defaultPayrollPeriod(todayQatarYmd).month,
  );
  const [attendanceSelectedDate, setAttendanceSelectedDate] = useState<string | null>(null);
  const attendanceMonthRange = useMemo(() => {
    const bounds = monthBounds(attendanceMonth);
    return { dateFrom: bounds.dateFrom, dateTo: bounds.dateTo };
  }, [attendanceMonth]);
  const showRoster = tab === "home" || tab === "roster" || tab === "attendance";
  const showLeave = tab === "home" || tab === "leave";
  const homeAttendance = useMyAttendance(tab === "home");
  const attendance = useMyAttendance(tab === "attendance", attendanceMonthRange);
  const roster = useMyRoster(showRoster, tab === "attendance" ? attendanceMonthRange : null);
  const leave = useMyLeaveRequests(tab === "leave");
  const leaveCalRange = useMemo(() => monthDateRange(leaveCalMonth), [leaveCalMonth]);
  const leaveRoster = useMyRoster(tab === "leave" && linked, leaveCalRange);
  const leaveSubjects = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "leave-subjects" }),
    queryFn: () => listLeaveSubjects(),
    staleTime: STALE.people,
    enabled: showLeave && linked,
  });
  const announcements = useQuery({
    queryKey: queryKeys.people.hrAnnouncements({ mine: true }),
    queryFn: () => listAnnouncements({}),
    staleTime: STALE.people,
    enabled: tab === "announcements",
  });
  const documents = useQuery({
    queryKey: queryKeys.people.hrDocs({ mine: true }),
    queryFn: () => listEmployeeDocuments({ mineOnly: true }),
    staleTime: STALE.people,
    enabled: tab === "documents",
  });
  const airTickets = useQuery({
    queryKey: queryKeys.people.hrAirTickets({ mine: true }),
    queryFn: () => listAirTicketEntitlements({ mineOnly: true }),
    staleTime: STALE.people,
    enabled: tab === "tickets",
  });
  const payslips = useQuery({
    queryKey: queryKeys.people.hrMyPayslips(),
    queryFn: () => listMyPayslips({}),
    staleTime: STALE.people,
    enabled: tab === "payslips",
  });

  const ios = useMemo(() => isIos(), []);
  const person = profile.data;
  const issues = useMyIssues(Boolean(canIssues && (tab === "home" || tab === "issues")));

  useEffect(() => {
    const apply = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setTab(next);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const leavePeople = useMemo(() => {
    const fromApi = leaveSubjects.data ?? [];
    if (fromApi.length > 0) return fromApi;
    if (!person) return [];
    return [
      {
        staffId: person.id,
        fullName: person.fullName,
        employeeCode: person.employeeCode,
        jobTitle: person.jobTitle,
        department: person.department,
        opsLane: "head_of_operations" as const,
        self: true,
      },
    ];
  }, [leaveSubjects.data, person]);
  const leavePersonOptions = useMemo(
    () =>
      leavePeople.map((row) => {
        const code = row.employeeCode?.trim() || "";
        return {
          value: row.staffId,
          label: code ? `${row.fullName} · ${code}` : row.fullName,
          keywords: `${row.fullName} ${code}`.trim(),
        };
      }),
    [leavePeople],
  );
  const selectedLeaveStaffId =
    leaveStaffId || leavePeople.find((row) => row.self)?.staffId || leavePeople[0]?.staffId || "";
  const selectedLeavePerson = leavePeople.find((row) => row.staffId === selectedLeaveStaffId);
  const leaveForTeam = Boolean(selectedLeavePerson && !selectedLeavePerson.self);
  const leaveOpsLabel = opsStepApproverLabel(selectedLeavePerson?.opsLane ?? "head_of_operations");
  const balances = useMyLeaveBalances(
    showLeave,
    leaveForTeam ? selectedLeaveStaffId : undefined,
  );
  const leaveWeekOffDates = useMemo(
    () =>
      new Set(
        (leaveRoster.data?.rows ?? [])
          .filter((row) => row.isWeekOff)
          .map((row) => row.workDate),
      ),
    [leaveRoster.data?.rows],
  );
  const leaveMarkedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const row of leave.data ?? []) {
      if (row.status === "rejected" || row.status === "cancelled") continue;
      const from = row.dateFrom.slice(0, 10);
      const to = (row.dateTo || row.dateFrom).slice(0, 10);
      const start = Date.parse(`${from}T00:00:00.000Z`);
      const end = Date.parse(`${to}T00:00:00.000Z`);
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) continue;
      for (let t = start; t <= end; t += 86_400_000) {
        dates.add(new Date(t).toISOString().slice(0, 10));
      }
    }
    return dates;
  }, [leave.data]);
  const leaveBalancesForApply = balances.data?.balances ?? [];
  const annualBalance = leaveBalancesForApply.find((row) => row.leaveType === "annual") ?? null;
  const accrual = balances.data?.accrual ?? null;

  const askLeave = useMutation({
    mutationFn: async (acknowledgeConflicts?: boolean) => {
      let document:
        | { filename: string; data_base64: string; content_type: string }
        | null = null;
      if (leaveType === "sick" && leaveDocFile) {
        if (leaveDocFile.size > IDENTITY_FILE_MAX_BYTES) {
          throw new Error(t("hr.leave.documentTooLarge"));
        }
        const contentType = identityFileContentType(leaveDocFile);
        if (!contentType) throw new Error(t("hr.leave.documentTypeInvalid"));
        document = {
          filename: leaveDocFile.name,
          data_base64: await fileToBase64(leaveDocFile),
          content_type: contentType,
        };
      }
      const result = await submitLeaveRequest({
        leaveType,
        dateFrom: leaveFrom,
        dateTo: leaveTo || leaveFrom,
        reason: leaveReason || null,
        acknowledgeConflicts: acknowledgeConflicts ?? false,
        compassionateScope: leaveType === "compassionate" ? compassionateScope : null,
        emergencyTreatment: leaveType === "emergency" ? emergencyTreatment : null,
        staffId: selectedLeaveStaffId || null,
        document,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (res) => {
      if ("plannerBlocked" in res && res.plannerBlocked) {
        setPlannerReasons(res.plannerReasons ?? []);
        setLeaveConflicts([]);
        setLeaveBalanceBlocked(false);
        toast.error(
          t("hr.leave.planner.blockedToast", {
            defaultValue: "Leave planner blocked this request. Use Emergency leave if needed.",
          }),
        );
        return;
      }
      if ("sandwichBlocked" in res && res.sandwichBlocked) {
        setLeaveConflicts([]);
        setPlannerReasons([]);
        setLeaveBalanceBlocked(false);
        toast.error(
          t("hr.leave.sandwichBlocked", {
            defaultValue:
              "Weekly OFF both before and after annual leave is not allowed (sandwich). Adjust dates so OFF is only before or only after leave.",
          }),
        );
        return;
      }
      if ("insufficientBalance" in res && res.insufficientBalance) {
        setLeaveConflicts([]);
        setPlannerReasons([]);
        setLeaveBalanceBlocked(true);
        toast.error(
          t("hr.leave.balanceExceeded", {
            remaining: res.remainingAnnualDays ?? 0,
            requested: res.days,
            defaultValue:
              "Request needs {{requested}} annual day(s) but only {{remaining}} remaining from your joining-date accrual.",
          }),
        );
        return;
      }
      if ("blocked" in res && res.blocked) {
        setLeaveConflicts(res.conflicts);
        setPlannerReasons([]);
        setLeaveBalanceBlocked(false);
        toast.error(t("hr.leave.overlapBlocked"));
        return;
      }
      if ("sickAnnualSplit" in res && res.sickAnnualSplit) {
        toast.message(
          t("hr.leave.sickAnnualSplitHint", {
            defaultValue:
              "Sick quota used — remaining days submitted as annual leave (HR → GM) with your medical document.",
          }),
        );
      }
      if (res.requiresAck) {
        setLeaveConflicts(res.conflicts);
        toast.message(t("hr.leave.conflictWarn"));
        return;
      }
      const number =
        "requestNumber" in res && typeof res.requestNumber === "string" ? res.requestNumber : null;
      if ("finalized" in res && res.finalized) {
        toast.success(
          "syncedDays" in res && (res.syncedDays ?? 0) > 0
            ? t("hr.leave.synced", { days: res.syncedDays })
            : t("hr.leave.updated"),
        );
      } else if (leaveForTeam) {
        toast.success(
          t("hr.leave.submittedForTeam", {
            step: leaveOpsLabel,
            defaultValue: `Leave submitted for team · waiting on ${leaveOpsLabel}`,
          }),
        );
      } else {
        toast.success(
          number
            ? t("hr.leave.submittedWithNumber", { number, defaultValue: `Leave request submitted · ${number}` })
            : t("hr.leave.submitted"),
        );
      }
      if (number && selectedLeavePerson) {
        setLeavePrintPayload({
          requestNumber: number,
          requestDate: leaveFrom,
          staffName: selectedLeavePerson.fullName,
          employeeCode: selectedLeavePerson.employeeCode,
          department: selectedLeavePerson.department,
          jobTitle: selectedLeavePerson.jobTitle,
          phone: leaveForTeam ? null : (person?.phone ?? null),
          leaveTypeLabel: t(`hr.leave.types.${leaveType}`),
          dateFrom: leaveFrom,
          dateTo: leaveTo || leaveFrom,
          days: res.days,
          reason: leaveReason || null,
          status: "finalized" in res && res.finalized ? "approved" : "pending",
          steps: [],
        });
        setLeavePrintOpen(true);
      }
      setLeaveReason("");
      setLeaveDocFile(null);
      setLeaveDocInputKey((key) => key + 1);
      setLeaveConflicts([]);
      setLeaveBalanceBlocked(false);
      setPlannerReasons([]);
      invalidateLeaveLists(qc);
    },
    onError: (e: Error) =>
      toast.error(
        userFacingActionError(
          e,
          t("hr.leave.submitFailed", { defaultValue: "Could not submit leave. Try again." }),
        ),
      ),
  });

  const cancelLeave = useMutation({
    mutationFn: (id: string) => reviewLeaveRequest({ id, status: "cancelled" }),
    onSuccess: () => {
      toast.success(t("hr.leave.updated"));
      invalidateLeaveLists(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error(t("hr.me.needFile"));
      if (docFile.size > IDENTITY_FILE_MAX_BYTES) throw new Error(t("hr.me.fileTooLarge"));
      const contentType = identityFileContentType(docFile) || docFile.type || "application/pdf";
      const data_base64 = await fileToBase64(docFile);
      return uploadEmployeeDocument({
        docType,
        filename: docFile.name,
        data_base64,
        content_type: contentType,
        title: docFile.name,
        documentNumber: docNumber.trim() || null,
        expiryDate: docExpiry || null,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.docs.uploaded"));
      setDocFile(null);
      setDocNumber("");
      setDocExpiry("");
      setDocNumberSuggestion("");
      setDocExpirySuggestion("");
      setDocExtractNote("");
      setDocInputKey((key) => key + 1);
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onPickMyDocument(next: File | null) {
    setDocFile(next);
    setDocNumberSuggestion("");
    setDocExpirySuggestion("");
    setDocExtractNote("");
    if (!next || !isIdentityDocType(docType)) return;
    if (next.size > IDENTITY_FILE_MAX_BYTES) {
      toast.error(t("people.staff.fileTooLarge"));
      setDocFile(null);
      return;
    }
    const contentType = identityFileContentType(next);
    if (!contentType) {
      toast.error(t("people.staff.fileType"));
      setDocFile(null);
      return;
    }
    setDocReading(true);
    try {
      const data_base64 = await fileToBase64(next);
      const result = await extractStaffIdentityDocument({
        docType,
        filename: next.name,
        data_base64,
        content_type: contentType,
      });
      const applied = applyDocumentEditorExtraction({
        docType,
        number: docNumber,
        expiry: docExpiry,
        parsed: result.parsed,
      });
      setDocNumber(applied.number);
      setDocExpiry(applied.expiry);
      setDocNumberSuggestion(applied.suggestions.number ?? "");
      setDocExpirySuggestion(applied.suggestions.expiry ?? "");
      setDocExtractNote(result.manual ? t("people.staff.extractManual") : "");
    } catch (error) {
      setDocExtractNote((error as Error).message || t("people.staff.extractManual"));
    } finally {
      setDocReading(false);
    }
  }

  const openDoc = useMutation({
    mutationFn: (id: string) => getEmployeeDocumentUrl({ id, purpose: "preview" }),
    onSuccess: (res) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function dismissInstall() {
    setInstallDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function labelOrRaw(key: string, raw: string) {
    const label = t(key);
    return label === key ? raw.replace(/_/g, " ") : label;
  }

  const profileReady = !profile.isLoading;
  const unlinked = profileReady && !profile.isError && !linked;
  const displayName = person?.fullName || t("hr.me.title");

  const homeAttendanceRows = homeAttendance.data?.rows ?? [];
  const attendanceRows = attendance.data?.rows ?? [];
  const leaveBalances = balances.data?.balances ?? [];
  const primaryLeave = leaveBalances.find((row) => row.leaveType === "annual") ?? leaveBalances[0] ?? null;
  const nextRoster = (roster.data?.rows ?? []).find((row) => row.workDate >= todayQatarYmd) ?? null;
  const openIssueCount = (issues.data?.items ?? []).filter(
    (row) => row.status === "open" || row.status === "assigned" || row.status === "in_progress" || row.status === "blocked",
  ).length;

  const tabs: { id: MeTab; label: string }[] = [
    { id: "home", label: t("hr.me.home") },
    ...(person
      ? [
          { id: "correction" as const, label: t("hr.me.correction") },
          { id: "leave" as const, label: t("hr.me.leaveApply") },
          { id: "profile" as const, label: t("hr.me.profile") },
        ]
      : []),
    { id: "attendance", label: t("hr.me.myAttendance") },
    { id: "roster", label: t("hr.me.myRoster") },
    ...(person
      ? [
          ...(canIssues ? [{ id: "issues" as const, label: t("hr.me.myIssues") }] : []),
          { id: "suggestions" as const, label: t("hr.me.suggestions") },
          { id: "documents" as const, label: t("hr.me.myDocuments") },
          { id: "announcements" as const, label: t("hr.me.announcements") },
          { id: "tickets" as const, label: t("hr.me.myAirTickets") },
          { id: "payslips" as const, label: t("hr.me.myPayslips") },
          { id: "kra" as const, label: t("hr.me.myKra") },
        ]
      : []),
  ];
  const active: MeTab = tabs.some((item) => item.id === tab) ? tab : "home";

  function selectTab(next: MeTab) {
    setTab(next);
    const hash = TAB_HASH[next];
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  }

  const attendanceHint = attendance.isLoading
    ? t("common.loading")
    : attendance.isError
      ? t("hr.me.attendanceUnavailable")
      : attendance.data
        ? `${formatWorkDateDdMmYyyy(attendance.data.dateFrom)} → ${formatWorkDateDdMmYyyy(attendance.data.dateTo)}`
        : null;
  const rosterHint = roster.isLoading
    ? t("common.loading")
    : roster.data
      ? `${formatWorkDateDdMmYyyy(roster.data.dateFrom)} → ${formatWorkDateDdMmYyyy(roster.data.dateTo)}`
      : null;

  return (
    <HrShell>
      <div className="hr-helpdesk hr-employee">
        {!installDismissed ? (
          <section className="hr-notice hr-enter mb-4 text-sm md:hidden">
            <div>
              <p className="font-semibold tracking-tight">{t("hr.me.installTitle")}</p>
              <p className="mt-1 text-muted-foreground">
                {ios ? t("hr.me.installIos") : t("hr.me.installAndroid")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={dismissInstall}>
                  {t("hr.me.installDismiss")}
                </Button>
                {ios ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Share className="h-3.5 w-3.5" />
                    {t("hr.me.shareHint")}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {profile.isLoading ? <FecLoader density="chip" label={t("common.loading")} /> : null}

        {unlinked ? (
          <section className="hd-card">
            <div className="hd-section">
              <h1 className="text-lg font-semibold">{t("hr.me.unlinked")}</h1>
              <p className="hd-hint">{t("hr.me.unlinkedHint")}</p>
            </div>
          </section>
        ) : null}

        {selfReady && (person || profile.isError) ? (
          <>
            <section className="hd-hero">
              <div className="min-w-0">
                <p className="hd-kicker">{t("hr.me.brand")}</p>
                <h1 className="hd-title">{person?.fullName || t("hr.me.title")}</h1>
                <p className="hd-sub">
                  {person
                    ? [person.jobTitle, person.locationLabel].filter(Boolean).join(" · ") || t("hr.me.profile")
                    : t("hr.me.profileUnavailable")}
                </p>
                {person ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {person.employeeCode ? <Badge variant="outline">{person.employeeCode}</Badge> : null}
                    {person.status ? (
                      <Badge variant={person.status === "active" ? "success" : "muted"}>
                        {labelOrRaw(`hr.me.staffStatus.${person.status}`, person.status)}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="hd-badge" aria-hidden>
                <span className="text-xl font-semibold">{initials(displayName)}</span>
              </div>
            </section>

            {active === "home" && person?.canSelfCheckIn ? <SelfCheckCard /> : null}

            <div className="ess-tabs" role="tablist" aria-label={t("hr.me.jumpTo")}>
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`me-tab-${item.id}`}
                  aria-selected={active === item.id}
                  aria-controls={`me-panel-${item.id}`}
                  className={active === item.id ? "fec-inner-tab is-active" : "fec-inner-tab"}
                  onClick={() => selectTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id={`me-panel-${active}`} aria-labelledby={`me-tab-${active}`}>
              {active === "home" ? (
                showAttendanceLeaveCalendar ? (
                  <>
                    <EssPanel id="me-calendar" title={t("hr.me.home")}>
                      <MeAttendanceLeaveCalendar />
                    </EssPanel>
                    <div className="hd-stack">
                      <MissedPunchApprovalQueue hideWhenEmpty actionableOnly title={t("hr.me.approvalsTitle")} />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="hd-sub mt-4">{t("hr.me.monthSummary")}</p>
                    <div className="hd-stats">
                      <button type="button" className="hd-stat" onClick={() => selectTab("attendance")}>
                        <span className="hd-stat__value">
                          {homeAttendance.isLoading || homeAttendance.isError
                            ? "—"
                            : String(homeAttendanceRows.length)}
                        </span>
                        <span className="hd-stat__label">{t("hr.me.daysThisMonth")}</span>
                      </button>
                      <button type="button" className="hd-stat" onClick={() => selectTab(person ? "leave" : "home")}>
                        <span className="hd-stat__value">
                          {balances.isLoading ? "—" : primaryLeave ? String(primaryLeave.remainingDays) : "—"}
                        </span>
                        <span className="hd-stat__label">
                          {primaryLeave ? t(`hr.leave.types.${primaryLeave.leaveType}`) : t("hr.me.leaveLeft")}
                        </span>
                      </button>
                      {canIssues ? (
                        <button type="button" className="hd-stat" onClick={() => selectTab("issues")}>
                          <span className="hd-stat__value">{issues.isLoading ? "—" : String(openIssueCount)}</span>
                          <span className="hd-stat__label">{t("hr.me.openIssues")}</span>
                        </button>
                      ) : null}
                      <button type="button" className="hd-stat" onClick={() => selectTab("roster")}>
                        <span className="hd-stat__value">
                          {roster.isLoading ? "—" : nextRoster ? formatWorkDateDdMmYyyy(nextRoster.workDate) : "—"}
                        </span>
                        <span className="hd-stat__label">{t("hr.me.myRoster")}</span>
                      </button>
                    </div>
                    {!person?.canSelfCheckIn ? <p className="hd-note">{t("hr.me.biometricNote")}</p> : null}
                    {showTeamToday ? <TeamTodayPanel embedded /> : null}
                    <div className="hd-stack">
                      <MissedPunchApprovalQueue hideWhenEmpty actionableOnly title={t("hr.me.approvalsTitle")} />
                    </div>
                  </>
                )
              ) : null}

              {active === "profile" && person ? (
                <EssPanel id="me-profile" title={t("hr.me.profile")}>
                  <ProfileFacts
                    rows={[
                      [t("hr.me.jobTitle"), person.jobTitle],
                      [t("hr.me.lineManager"), person.managerName],
                      [t("hr.me.reports"), person.reportNames.length ? person.reportNames.join(", ") : null],
                      [t("hr.me.furtherReports"), person.furtherReportCount > 0 ? String(person.furtherReportCount) : null],
                      [t("hr.me.department"), person.department],
                      [t("hr.me.location"), person.locationLabel],
                      [
                        t("hr.me.employmentType"),
                        person.employmentType
                          ? labelOrRaw(`people.staff.employmentTypes.${person.employmentType}`, person.employmentType)
                          : null,
                      ],
                      [
                        t("people.staff.status"),
                        person.status ? labelOrRaw(`hr.me.staffStatus.${person.status}`, person.status) : null,
                      ],
                      [t("hr.me.phone"), person.phone],
                      [t("hr.me.email"), person.email],
                      [t("hr.me.hireDate"), person.hireDate ? formatWorkDateDdMmYyyy(person.hireDate) : null],
                    ]}
                  />
                </EssPanel>
              ) : null}

              {active === "correction" && person ? (
                <EssPanel id="me-correction" title={t("hr.me.correction")} hint={t("hr.me.correctionHint")}>
                  <MeCorrectionPanel
                    jobTitle={person.jobTitle}
                    department={person.department}
                    selfStaff={{
                      staffId: person.id,
                      fullName: person.fullName,
                      employeeCode: person.employeeCode,
                    }}
                  />
                </EssPanel>
              ) : null}

              {active === "attendance" ? (
                <EssPanel id="me-attendance" title={t("hr.me.myAttendance")} hint={attendanceHint}>
                  {person?.canSelfCheckIn ? <SelfCheckCard /> : null}
                  <MissedPunchApprovalQueue hideWhenEmpty actionableOnly title={t("hr.me.approvalsTitle")} />
                  {attendance.isError ? <EssEmpty>{t("hr.me.attendanceUnavailable")}</EssEmpty> : null}
                  {!attendance.isError ? (
                    <EmployeeAttendanceCalendar
                      yearMonth={attendanceMonth}
                      onYearMonthChange={(ym) => {
                        setAttendanceMonth(ym);
                        setAttendanceSelectedDate(null);
                      }}
                      rows={attendanceRows}
                      rosterRows={roster.data?.rows}
                      isLoading={attendance.isLoading}
                      selectedDate={attendanceSelectedDate}
                      onSelectDate={setAttendanceSelectedDate}
                      todayYmd={todayQatarYmd}
                    />
                  ) : null}
                  {!attendance.isLoading && !attendance.isError && attendanceRows.length === 0 ? (
                    <EssEmpty>{t("hr.me.noStatus")}</EssEmpty>
                  ) : null}
                  <MyMissedPunchRequests />
                </EssPanel>
              ) : null}

              {active === "roster" ? (
                <EssPanel id="me-roster" title={t("hr.me.myRoster")} hint={rosterHint}>
                  <div className="space-y-4">
                    <IncompletePunchRosterSelf />
                    <EmployeeRosterList />
                  </div>
                </EssPanel>
              ) : null}

              {active === "leave" && person ? (
                <EssPanel id="me-leave" title={t("hr.leave.requestTitle")}>
                  <MeLeavePanel
                    myStaffId={person.id}
                    jobTitle={person.jobTitle}
                    department={person.department}
                    staffRole={sessionProfile?.staff_role ?? null}
                    requestPanel={
                      <>
                  <MeLeaveEntitlementCard
                    className="mb-3"
                    loading={balances.isLoading}
                    leaveTypeLabel={t("hr.leave.types.annual")}
                    allottedDays={annualBalance?.allottedDays ?? accrual?.accruedDays ?? null}
                    accruedDays={accrual?.accruedDays ?? annualBalance?.allottedDays ?? null}
                    usedDays={annualBalance?.usedDays ?? null}
                    remainingDays={annualBalance?.remainingDays ?? null}
                    monthsAccrued={accrual?.monthsAccrued ?? null}
                    monthlyAccrual={accrual?.monthlyAccrual ?? null}
                    fullYearDays={accrual?.fullYearDays ?? accrual?.tierAnnualDays ?? null}
                    hireDate={accrual?.hireDate ?? person.hireDate ?? null}
                    tierCode={accrual?.tierCode ?? null}
                    eligible={accrual?.eligible ?? null}
                  />
                  {leaveBalances.length > 0 ? (
                    <div className="hd-chips mb-2">
                      {leaveBalances.slice(0, 4).map((b) => (
                        <span key={b.leaveType} className="hd-chip">
                          {t(`hr.leave.types.${b.leaveType}`)} ·{" "}
                          {t("hr.leave.remaining", {
                            remaining: b.remainingDays,
                            allotted: b.allottedDays,
                            used: b.usedDays,
                          })}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {leavePersonOptions.length > 1 ? (
                    <div className="mb-2 space-y-1">
                      <Label>{t("hr.leave.person")}</Label>
                      <SearchableSelect
                        value={selectedLeaveStaffId}
                        onValueChange={setLeaveStaffId}
                        aria-label={t("hr.leave.person")}
                        placeholder={
                          leaveSubjects.isPending
                            ? t("common.loading", { defaultValue: "Loading…" })
                            : t("hr.leave.personSearch")
                        }
                        options={leavePersonOptions}
                      />
                      <p className="text-xs text-muted-foreground">
                        {leaveForTeam
                          ? t("hr.leave.teamHint", { step: leaveOpsLabel })
                          : t("hr.leave.selfHint")}
                      </p>
                    </div>
                  ) : null}
                  <MeLeaveApplyCalendar
                    className="mb-3"
                    dateFrom={leaveFrom}
                    dateTo={leaveTo || leaveFrom}
                    onChange={({ dateFrom, dateTo }) => {
                      setLeaveFrom(dateFrom);
                      setLeaveTo(dateTo);
                      setLeaveBalanceBlocked(false);
                      setPlannerReasons([]);
                    }}
                    visibleMonth={leaveCalMonth}
                    onVisibleMonthChange={setLeaveCalMonth}
                    weekOffDates={leaveWeekOffDates}
                    leaveDates={leaveMarkedDates}
                    hireDate={accrual?.hireDate ?? person.hireDate ?? null}
                  />
                  <div className="hd-fields hd-fields--split">
                    <div>
                      <Label>{t("hr.leave.from")}</Label>
                      <Input
                        type="date"
                        value={leaveFrom}
                        onChange={(e) => {
                          setLeaveFrom(e.target.value);
                          setLeaveBalanceBlocked(false);
                        }}
                      />
                    </div>
                    <div>
                      <Label>{t("hr.leave.to")}</Label>
                      <Input
                        type="date"
                        value={leaveTo}
                        onChange={(e) => {
                          setLeaveTo(e.target.value);
                          setLeaveBalanceBlocked(false);
                        }}
                      />
                    </div>
                  </div>
                  <SearchableSelect
                    className="mt-2"
                    value={leaveType}
                    onValueChange={(value) => {
                      const next = value as (typeof HR_LEAVE_TYPES)[number];
                      setLeaveType(next);
                      setLeaveBalanceBlocked(false);
                      if (next !== "sick") {
                        setLeaveDocFile(null);
                        setLeaveDocInputKey((key) => key + 1);
                      }
                    }}
                    aria-label={t("hr.leave.type")}
                    options={HR_LEAVE_TYPES.map((value) => ({
                      value,
                      label: t(`hr.leave.types.${value}`),
                    }))}
                  />
                  {leaveType === "compassionate" ? (
                    <SearchableSelect
                      className="mt-2"
                      value={compassionateScope}
                      onValueChange={(value) => setCompassionateScope(value as "inside_qatar" | "outside_qatar")}
                      aria-label={t("hr.leave.types.compassionate")}
                      options={[
                        { value: "inside_qatar", label: t("hr.leave.compassionateInside") },
                        { value: "outside_qatar", label: t("hr.leave.compassionateOutside") },
                      ]}
                    />
                  ) : null}
                  {leaveType === "emergency" ? (
                    <SearchableSelect
                      className="mt-2"
                      value={emergencyTreatment}
                      onValueChange={(value) =>
                        setEmergencyTreatment(value as (typeof HR_EMERGENCY_TREATMENTS)[number])
                      }
                      aria-label={t("hr.leave.emergencyTreatment", { defaultValue: "Emergency treatment" })}
                      options={HR_EMERGENCY_TREATMENTS.map((value) => ({
                        value,
                        label: t(`hr.leave.emergencyTreatments.${value}`, {
                          defaultValue:
                            value === "deduct_annual"
                              ? "Deduct from annual"
                              : value === "partial"
                                ? "Partial"
                                : "Unpaid",
                        }),
                      }))}
                    />
                  ) : null}
                  <MeLeavePolicyPreview
                    leaveType={leaveType}
                    dateFrom={leaveFrom}
                    dateTo={leaveTo || leaveFrom}
                    staffId={selectedLeaveStaffId || null}
                  />
                  <LeavePlannerGateBanner
                    dateFrom={leaveFrom}
                    dateTo={leaveTo || leaveFrom}
                    leaveType={leaveType}
                    staffId={selectedLeaveStaffId || null}
                    onSwitchToEmergency={() => setLeaveType("emergency")}
                  />
                  {leaveBalanceBlocked ? (
                    <div className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                      <p className="font-medium">
                        {t("hr.leave.balanceExceededHint", {
                          defaultValue:
                            "Shorten the range or wait for more months to accrue from your joining date.",
                        })}
                      </p>
                    </div>
                  ) : null}
                  {plannerReasons.length > 0 ? (
                    <div className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                      <p className="font-medium">
                        {t("hr.leave.planner.blocked", {
                          defaultValue:
                            "Leave planner: DECLINE — annual leave cannot be submitted for these dates.",
                        })}
                      </p>
                      <ul className="mt-1 list-disc ps-4">
                        {plannerReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-2"
                        variant="secondary"
                        onClick={() => {
                          setLeaveType("emergency");
                          setPlannerReasons([]);
                        }}
                      >
                        {t("hr.leave.planner.switchEmergency", {
                          defaultValue: "Switch to Emergency leave",
                        })}
                      </Button>
                    </div>
                  ) : null}
                  {leaveType === "sick" ? (
                    <div className="mt-2 space-y-1">
                      <Label htmlFor="leave-sick-doc">{t("hr.leave.sickDocument")}</Label>
                      <Input
                        id="leave-sick-doc"
                        key={leaveDocInputKey}
                        type="file"
                        accept={IDENTITY_FILE_ACCEPT}
                        onChange={(e) => setLeaveDocFile(e.target.files?.[0] ?? null)}
                      />
                      <p className="text-xs text-muted-foreground">{t("hr.leave.sickDocumentHint")}</p>
                      {leaveDocFile ? (
                        <p className="text-xs text-muted-foreground">{leaveDocFile.name}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <Input
                    className="mt-2"
                    placeholder={t("hr.leave.reason")}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                  />
                  {leaveConflicts.length > 0 ? (
                    <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                      <p className="font-medium">
                        {leaveConflicts.some((c) => c.kind === "leave_overlap")
                          ? t("hr.leave.overlapBlocked")
                          : t("hr.leave.conflictWarn")}
                      </p>
                      <ul className="mt-1 list-disc ps-4">
                        {leaveConflicts.slice(0, 5).map((c, i) => (
                          <li key={`${c.kind}-${c.workDate}-${i}`}>
                            {c.workDate}: {c.detail}
                          </li>
                        ))}
                      </ul>
                      {!leaveConflicts.some((c) => c.kind === "leave_overlap") ? (
                        <Button className="mt-2" size="sm" disabled={askLeave.isPending} onClick={() => askLeave.mutate(true)}>
                          {t("hr.leave.submitAnyway")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <Button className="mt-3 min-h-11" disabled={!leaveFrom || askLeave.isPending} onClick={() => askLeave.mutate(false)}>
                    {leaveForTeam ? t("hr.leave.submitForTeam") : t("hr.leave.submit")}
                  </Button>
                  <div className="mb-2 mt-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t("hr.leave.history")}</h3>
                    {(leave.data ?? []).length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-9"
                        onClick={() => {
                          if (!person) return;
                          const rows = (leave.data ?? []).slice(0, 12);
                          setLeavePrintPayload(
                            rows.map((row) => ({
                              requestNumber: row.requestNumber,
                              requestDate: row.createdAt.slice(0, 10),
                              staffName: person.fullName,
                              employeeCode: person.employeeCode,
                              department: person.department,
                              jobTitle: person.jobTitle,
                              phone: person.phone ?? null,
                              leaveTypeLabel: t(`hr.leave.types.${row.leaveType}`),
                              dateFrom: row.dateFrom,
                              dateTo: row.dateTo,
                              days: row.days,
                              reason: row.reason,
                              status: row.status,
                              steps: (row.steps ?? []).map((step) => ({
                                stepRole: step.stepRole,
                                status: step.status,
                                actedByName: step.actedByName,
                                actedAt: step.actedAt,
                                actedBySignatureUrl: step.actedBySignatureUrl ?? null,
                              })),
                            })),
                          );
                          setLeavePrintOpen(true);
                        }}
                      >
                        {t("hr.leave.print.printAll", { defaultValue: "Print all" })}
                      </Button>
                    ) : null}
                  </div>
                  {(leave.data ?? []).length === 0 && !leave.isLoading ? <EssEmpty>{t("hr.me.leaveEmpty")}</EssEmpty> : null}
                  {(leave.data ?? []).length > 0 ? (
                    <ul>
                      {(leave.data ?? []).slice(0, 12).map((row) => (
                        <li key={row.id}>
                          <div className="hd-row">
                            <div className="min-w-0">
                              <p className="hd-row__title">
                                {t(`hr.leave.types.${row.leaveType}`)}
                                {row.requestNumber ? (
                                  <span className="ms-2 font-mono text-xs text-muted-foreground">
                                    {row.requestNumber}
                                  </span>
                                ) : null}
                              </p>
                              <p className="hd-row__meta">
                                {row.dateFrom} → {row.dateTo} · {row.days}d
                                {row.documentId
                                  ? ` · ${row.documentFileName ?? t("hr.leave.documentAttached")}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}>
                                {t(`hr.leave.status.${row.status}`)}
                              </Badge>
                              {row.documentId ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setLeavePreviewDoc({
                                      leaveId: row.id,
                                      fileName: row.documentFileName,
                                      title: t("hr.leave.sickDocument"),
                                    })
                                  }
                                >
                                  {t("hr.leave.viewDocument")}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (!person) return;
                                  setLeavePrintPayload({
                                    requestNumber: row.requestNumber,
                                    requestDate: row.createdAt.slice(0, 10),
                                    staffName: person.fullName,
                                    employeeCode: person.employeeCode,
                                    department: person.department,
                                    jobTitle: person.jobTitle,
                                    phone: person.phone ?? null,
                                    leaveTypeLabel: t(`hr.leave.types.${row.leaveType}`),
                                    dateFrom: row.dateFrom,
                                    dateTo: row.dateTo,
                                    days: row.days,
                                    reason: row.reason,
                                    status: row.status,
                                    steps: (row.steps ?? []).map((step) => ({
                                      stepRole: step.stepRole,
                                      status: step.status,
                                      actedByName: step.actedByName,
                                      actedAt: step.actedAt,
                                      actedBySignatureUrl: step.actedBySignatureUrl ?? null,
                                    })),
                                  });
                                  setLeavePrintOpen(true);
                                }}
                              >
                                {t("hr.leave.print.preview")}
                              </Button>
                              {row.status === "pending" ? (
                                <Button size="sm" variant="ghost" disabled={cancelLeave.isPending} onClick={() => cancelLeave.mutate(row.id)}>
                                  {t("hr.leave.cancel")}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                      </>
                    }
                  />
                </EssPanel>
              ) : null}

              {active === "issues" && person && canIssues ? (
                <EssPanel id="me-issues" title={t("hr.me.myIssues")} hint={t("hr.me.issuesHint")}>
                  <EmployeeIssuesList compact />
                </EssPanel>
              ) : null}

              {active === "suggestions" && person ? (
                <EssPanel id="me-suggestions" title={t("hr.me.suggestions")} hint={t("hr.me.suggestionsHint")}>
                  <MySuggestionsPanel />
                </EssPanel>
              ) : null}

              {active === "documents" && person ? (
                <EssPanel id="me-documents" title={t("hr.me.myDocuments")} hint={t("hr.me.uploadHint")}>
                  <div className="hd-fields hd-fields--split">
                    <div>
                      <Label>{t("hr.me.docType")}</Label>
                      <SearchableSelect
                        value={docType}
                        onValueChange={(value) => {
                          setDocType(value as (typeof EMPLOYEE_DOC_TYPES)[number]);
                          setDocNumber("");
                          setDocExpiry("");
                          setDocNumberSuggestion("");
                          setDocExpirySuggestion("");
                          setDocExtractNote("");
                          setDocFile(null);
                        }}
                        aria-label={t("hr.me.docType")}
                        options={EMPLOYEE_DOC_TYPES.map((value) => ({
                          value,
                          label: t(`hr.docs.types.${value}`),
                        }))}
                      />
                    </div>
                    {isIdentityDocType(docType) ? (
                      <>
                        <div>
                          <Label>{t("hr.docs.documentNumber")}</Label>
                          <Input
                            value={docNumber}
                            className="font-mono"
                            onChange={(e) => {
                              setDocNumber(e.target.value);
                              setDocNumberSuggestion("");
                            }}
                          />
                          {docNumberSuggestion ? (
                            <button
                              type="button"
                              className="mt-1 text-start text-xs text-primary underline"
                              onClick={() => {
                                setDocNumber(docNumberSuggestion);
                                setDocNumberSuggestion("");
                              }}
                            >
                              {t("people.staff.useExtracted", { value: docNumberSuggestion })}
                            </button>
                          ) : null}
                        </div>
                        <div>
                          <Label>{t("hr.docs.expiry")}</Label>
                          <Input
                            type="date"
                            value={docExpiry}
                            onChange={(e) => {
                              setDocExpiry(e.target.value);
                              setDocExpirySuggestion("");
                            }}
                          />
                          {docExpirySuggestion ? (
                            <button
                              type="button"
                              className="mt-1 text-start text-xs text-primary underline"
                              onClick={() => {
                                setDocExpiry(docExpirySuggestion);
                                setDocExpirySuggestion("");
                              }}
                            >
                              {t("people.staff.useExtracted", { value: docExpirySuggestion })}
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                    <div>
                      <Label>{t("hr.me.chooseFile")}</Label>
                      <Input
                        key={docInputKey}
                        type="file"
                        accept={IDENTITY_FILE_ACCEPT}
                        onChange={(e) => void onPickMyDocument(e.target.files?.[0] ?? null)}
                      />
                      {docReading ? <p className="mt-1 text-xs text-muted-foreground">{t("people.staff.readingDocument")}</p> : null}
                      {docExtractNote ? <p className="mt-1 text-xs text-muted-foreground">{docExtractNote}</p> : null}
                    </div>
                  </div>
                  <Button className="mt-3 min-h-11" disabled={!docFile || uploadDoc.isPending} onClick={() => uploadDoc.mutate()}>
                    {t("hr.me.uploadDoc")}
                  </Button>
                  {(documents.data ?? []).length === 0 && !documents.isLoading && !documents.isError ? (
                    <EssEmpty>{t("hr.me.noDocuments")}</EssEmpty>
                  ) : null}
                  {(documents.data ?? []).length > 0 ? (
                    <ul className="mt-2">
                      {(documents.data ?? []).slice(0, 12).map((doc) => (
                        <li key={doc.id}>
                          <div className="hd-row">
                            <div className="min-w-0">
                              <p className="hd-row__title">{doc.title || t(`hr.docs.types.${doc.docType}`)}</p>
                              <p className="hd-row__meta">
                                {t(`hr.docs.types.${doc.docType}`)}
                                {doc.expiryDate ? ` · ${t("hr.docs.expires", { date: formatWorkDateDdMmYyyy(doc.expiryDate) })}` : ""}
                                {` · ${labelOrRaw(`hr.docs.status.${doc.status}`, doc.status)}`}
                              </p>
                            </div>
                            {doc.filePath ? (
                              <Button size="sm" variant="ghost" disabled={openDoc.isPending} onClick={() => openDoc.mutate(doc.id)}>
                                {t("hr.me.viewDoc")}
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </EssPanel>
              ) : null}

              {active === "announcements" && person ? (
                <EssPanel id="me-announcements" title={t("hr.me.announcements")}>
                  {(announcements.data ?? []).length === 0 && !announcements.isLoading && !announcements.isError ? (
                    <EssEmpty>{t("hr.me.announcementsEmpty")}</EssEmpty>
                  ) : null}
                  {(announcements.data ?? []).length > 0 ? (
                    <ul>
                      {(announcements.data ?? []).slice(0, 8).map((item) => (
                        <li key={item.id}>
                          <div className="hd-row">
                            <div className="min-w-0">
                              <p className="hd-row__title">{item.title}</p>
                              <p className="hd-row__meta whitespace-pre-wrap">{item.body}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </EssPanel>
              ) : null}

              {active === "tickets" && person ? (
                <EssPanel id="me-tickets" title={t("hr.me.myAirTickets")}>
                  {(airTickets.data ?? []).length === 0 && !airTickets.isLoading && !airTickets.isError ? (
                    <EssEmpty>{t("hr.me.noAirTickets")}</EssEmpty>
                  ) : null}
                  {(airTickets.data ?? []).length > 0 ? (
                    <ul>
                      {(airTickets.data ?? []).slice(0, 8).map((row) => (
                        <li key={row.id}>
                          <div className="hd-row">
                            <div className="min-w-0">
                              <p className="hd-row__title">{row.destination || t("hr.airTickets.destination")}</p>
                              <p className="hd-row__meta">{t("hr.me.eligibleOn", { date: formatWorkDateDdMmYyyy(row.eligibilityOn) })}</p>
                            </div>
                            <Badge variant="muted">{labelOrRaw(`hr.airTickets.status.${row.status}`, row.status)}</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </EssPanel>
              ) : null}

              {active === "payslips" && person ? (
                <EssPanel id="me-payslips" title={t("hr.me.myPayslips")}>
                  {(payslips.data ?? []).length === 0 && !payslips.isLoading && !payslips.isError ? (
                    <EssEmpty>{t("hr.me.noPayslips")}</EssEmpty>
                  ) : null}
                  {(payslips.data ?? []).length > 0 ? (
                    <ul>
                      {(payslips.data ?? []).slice(0, 8).map((row) => (
                        <li key={row.lineId}>
                          <div className="hd-row">
                            <div className="min-w-0">
                              <p className="hd-row__title">
                                {row.month || `${formatWorkDateDdMmYyyy(row.dateFrom)} → ${formatWorkDateDdMmYyyy(row.dateTo)}`}
                              </p>
                              {row.dateFrom && row.dateTo ? (
                                <p className="hd-row__meta">
                                  {formatWorkDateDdMmYyyy(row.dateFrom)} → {formatWorkDateDdMmYyyy(row.dateTo)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <p className="text-sm font-semibold">
                                {t("hr.me.netQar", { amount: row.netQar.toLocaleString() })}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={payslipLoadingId === row.lineId}
                                onClick={() => {
                                  setPayslipLoadingId(row.lineId);
                                  void getPayslipPrintPayload({ lineId: row.lineId })
                                    .then((payload) => {
                                      setPayslipPrintPayload(payload);
                                      setPayslipPrintOpen(true);
                                    })
                                    .catch((e: Error) =>
                                      toast.error(e.message || t("hr.me.payslipLoadFailed")),
                                    )
                                    .finally(() => setPayslipLoadingId(null));
                                }}
                              >
                                {t("hr.me.downloadPayslip")}
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </EssPanel>
              ) : null}

              {active === "kra" && person ? (
                <EssPanel id="me-kra" title={t("hr.me.myKra")}>
                  <MyKraScorecards />
                </EssPanel>
              ) : null}

            </div>
          </>
        ) : null}
      </div>
      <LeaveRequestPrintDialog
        open={leavePrintOpen}
        onOpenChange={setLeavePrintOpen}
        payload={leavePrintPayload}
      />
      <LeaveDocumentLightbox
        doc={leavePreviewDoc}
        open={Boolean(leavePreviewDoc)}
        onOpenChange={(next) => {
          if (!next) setLeavePreviewDoc(null);
        }}
      />
      <PayslipPrintDialog
        open={payslipPrintOpen}
        onOpenChange={setPayslipPrintOpen}
        payload={payslipPrintPayload}
      />
    </HrShell>
  );
}
