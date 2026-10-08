"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecLoader } from "@/components/fec";
import {
  MissedPunchApprovalQueue,
  MissedPunchRequestButton,
  MyMissedPunchRequests,
} from "@/components/attendance-hr/missed-punch-approval-queue";
import { PunchCorrectionRequest } from "@/components/attendance-hr/punch-correction-request";
import { EmployeeIssuesList, EmployeeRosterList } from "@/components/hr/employee-self-dashboard";
import { HrShell } from "@/components/hr/hr-shell";
import {
  useMyAttendance,
  useMyEmployeeProfile,
  useMyIssues,
  useMyLeaveBalances,
  useMyLeaveRequests,
  useMyRoster,
} from "@/hooks/queries/use-employee-self";
import { usePermission } from "@/hooks/use-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { extractStaffIdentityDocument, getEmployeeDocumentUrl, listEmployeeDocuments, uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import { fileToBase64, IDENTITY_FILE_ACCEPT, IDENTITY_FILE_MAX_BYTES, identityFileContentType } from "@/lib/hr/identity-file";
import { applyDocumentEditorExtraction, isIdentityDocType } from "@/lib/hr/identity-document-parse";
import { reviewLeaveRequest, submitLeaveRequest } from "@/lib/hr-leave.functions";
import { listAnnouncements } from "@/lib/hr-announcements.functions";
import { listAirTicketEntitlements } from "@/lib/hr-air-ticket.functions";
import { listMyPayslips } from "@/lib/hr-payroll.functions";
import { MyKraScorecards } from "@/components/people/my-kra-scorecard";
import { formatWorkDateDdMmYyyy, formatPunchTime12h, formatHoursValue, computeHoursWorked } from "@/lib/attendance-display";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { HR_LEAVE_TYPES } from "@/lib/hr-leave";
import { type LeaveConflict } from "@/lib/hr-advanced";
import { cn } from "@/lib/utils";

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
  documents: "#me-documents",
  announcements: "#me-announcements",
  tickets: "#me-tickets",
  payslips: "#me-payslips",
  kra: "#me-kra",
};

function tabFromHash(hash: string): MeTab | null {
  const id = hash.replace(/^#/, "");
  if (!id) return "home";
  if (id === "me-punch-approvals") return "attendance";
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

function attendanceTone(status: string, missedPunch: boolean): "destructive" | "warning" | "success" | "muted" {
  if (missedPunch || status === "absent" || status === "missed_punch") return "destructive";
  if (status === "late" || status === "early_leave" || status === "early_departure") return "warning";
  if (status === "present" || status === "overtime") return "success";
  return "muted";
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
  const qc = useQueryClient();
  const canIssues = usePermission("issues.view");
  const [leaveType, setLeaveType] = useState<(typeof HR_LEAVE_TYPES)[number]>("annual");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [compassionateScope, setCompassionateScope] = useState<"inside_qatar" | "outside_qatar">("inside_qatar");
  const [leaveConflicts, setLeaveConflicts] = useState<LeaveConflict[]>([]);
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
  const attendance = useMyAttendance(selfReady);
  const roster = useMyRoster(selfReady);
  const leave = useMyLeaveRequests(linked);
  const balances = useMyLeaveBalances(linked);
  const announcements = useQuery({
    queryKey: queryKeys.people.hrAnnouncements({ mine: true }),
    queryFn: () => listAnnouncements({}),
    staleTime: STALE.people,
    enabled: linked,
  });
  const documents = useQuery({
    queryKey: queryKeys.people.hrDocs({ mine: true }),
    queryFn: () => listEmployeeDocuments({ mineOnly: true }),
    staleTime: STALE.people,
    enabled: linked,
  });
  const airTickets = useQuery({
    queryKey: queryKeys.people.hrAirTickets({ mine: true }),
    queryFn: () => listAirTicketEntitlements({ mineOnly: true }),
    staleTime: STALE.people,
    enabled: linked,
  });
  const payslips = useQuery({
    queryKey: queryKeys.people.hrMyPayslips(),
    queryFn: () => listMyPayslips({}),
    staleTime: STALE.people,
    enabled: linked,
  });

  const ios = useMemo(() => isIos(), []);
  const person = profile.data;
  const issues = useMyIssues(Boolean(canIssues && linked));
  const [tab, setTab] = useState<MeTab>("home");

  useEffect(() => {
    const apply = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setTab(next);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const askLeave = useMutation({
    mutationFn: (acknowledgeConflicts?: boolean) =>
      submitLeaveRequest({
        leaveType,
        dateFrom: leaveFrom,
        dateTo: leaveTo || leaveFrom,
        reason: leaveReason || null,
        acknowledgeConflicts: acknowledgeConflicts ?? false,
        compassionateScope: leaveType === "compassionate" ? compassionateScope : null,
      }),
    onSuccess: (res) => {
      if ("blocked" in res && res.blocked) {
        setLeaveConflicts(res.conflicts);
        toast.error(t("hr.leave.overlapBlocked"));
        return;
      }
      if (res.requiresAck) {
        setLeaveConflicts(res.conflicts);
        toast.message(t("hr.leave.conflictWarn"));
        return;
      }
      toast.success(t("hr.leave.submitted"));
      setLeaveReason("");
      setLeaveConflicts([]);
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrLeaveBalances() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelLeave = useMutation({
    mutationFn: (id: string) => reviewLeaveRequest({ id, status: "cancelled" }),
    onSuccess: () => {
      toast.success(t("hr.leave.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
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

  const todayQatar = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
  const attendanceRows = attendance.data?.rows ?? [];
  const leaveBalances = balances.data?.balances ?? [];
  const primaryLeave = leaveBalances.find((row) => row.leaveType === "annual") ?? leaveBalances[0] ?? null;
  const nextRoster = (roster.data?.rows ?? []).find((row) => row.workDate >= todayQatar) ?? null;
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
                <>
                  <p className="hd-sub mt-4">{t("hr.me.monthSummary")}</p>
                  <div className="hd-stats">
                    <button type="button" className="hd-stat" onClick={() => selectTab("attendance")}>
                      <span className="hd-stat__value">
                        {attendance.isLoading || attendance.isError ? "—" : String(attendanceRows.length)}
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
                  <p className="hd-note">{t("hr.me.biometricNote")}</p>
                  <div id="me-punch-approvals" className="hd-stack">
                    <MissedPunchApprovalQueue hideWhenEmpty actionableOnly title={t("hr.me.approvalsTitle")} />
                  </div>
                </>
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
                  <PunchCorrectionRequest />
                  <MyMissedPunchRequests />
                </EssPanel>
              ) : null}

              {active === "attendance" ? (
                <EssPanel id="me-attendance" title={t("hr.me.myAttendance")} hint={attendanceHint}>
                  <div id="me-punch-approvals">
                    <MissedPunchApprovalQueue hideWhenEmpty actionableOnly title={t("hr.me.approvalsTitle")} />
                  </div>
                  {attendance.isError ? <EssEmpty>{t("hr.me.attendanceUnavailable")}</EssEmpty> : null}
                  {!attendance.isLoading && !attendance.isError && attendanceRows.length === 0 ? (
                    <EssEmpty>{t("hr.me.noStatus")}</EssEmpty>
                  ) : null}
                  {attendanceRows.length > 0 ? (
                    <ul>
                      {attendanceRows.map((row) => {
                        const needsPunch =
                          row.missedPunch ||
                          row.status === "missed_punch" ||
                          Boolean(row.actualIn) !== Boolean(row.actualOut);
                        return (
                          <li key={row.id}>
                            <div className={cn("hd-row", needsPunch && "bg-amber-500/10")}>
                              <div className="min-w-0">
                                <p className="hd-row__title">{formatWorkDateDdMmYyyy(row.workDate)}</p>
                                <p className="hd-row__meta">
                                  {row.locationLabel} · {formatPunchTime12h(row.actualIn) || "—"} –{" "}
                                  {formatPunchTime12h(row.actualOut) || "—"} ·{" "}
                                  {formatHoursValue(computeHoursWorked(row.actualIn, row.actualOut))}h
                                </p>
                                <MissedPunchRequestButton
                                  summaryId={row.id}
                                  missedPunch={row.missedPunch}
                                  status={row.status}
                                  actualIn={row.actualIn}
                                  actualOut={row.actualOut}
                                />
                              </div>
                              <Badge variant={attendanceTone(row.status, row.missedPunch)}>
                                {labelOrRaw(`attendanceHr.reports.statuses.${row.status}`, row.status)}
                              </Badge>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <MyMissedPunchRequests />
                </EssPanel>
              ) : null}

              {active === "roster" ? (
                <EssPanel id="me-roster" title={t("hr.me.myRoster")} hint={rosterHint}>
                  <EmployeeRosterList />
                </EssPanel>
              ) : null}

              {active === "leave" && person ? (
                <EssPanel id="me-leave" title={t("hr.leave.requestTitle")}>
                  {leaveBalances.length > 0 ? (
                    <div className="hd-chips">
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
                  <div className="hd-fields hd-fields--split">
                    <div>
                      <Label>{t("hr.leave.from")}</Label>
                      <Input type="date" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
                    </div>
                    <div>
                      <Label>{t("hr.leave.to")}</Label>
                      <Input type="date" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
                    </div>
                  </div>
                  <SearchableSelect
                    className="mt-2"
                    value={leaveType}
                    onValueChange={(value) => setLeaveType(value as (typeof HR_LEAVE_TYPES)[number])}
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
                    {t("hr.leave.submit")}
                  </Button>
                  <h3 className="mb-2 mt-4 text-sm font-semibold">{t("hr.leave.history")}</h3>
                  {(leave.data ?? []).length === 0 && !leave.isLoading ? <EssEmpty>{t("hr.me.leaveEmpty")}</EssEmpty> : null}
                  {(leave.data ?? []).length > 0 ? (
                    <ul>
                      {(leave.data ?? []).slice(0, 12).map((row) => (
                        <li key={row.id}>
                          <div className="hd-row">
                            <div className="min-w-0">
                              <p className="hd-row__title">{t(`hr.leave.types.${row.leaveType}`)}</p>
                              <p className="hd-row__meta">
                                {row.dateFrom} → {row.dateTo} · {row.days}d
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}>
                                {t(`hr.leave.status.${row.status}`)}
                              </Badge>
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
                </EssPanel>
              ) : null}

              {active === "issues" && person && canIssues ? (
                <EssPanel id="me-issues" title={t("hr.me.myIssues")} hint={t("hr.me.issuesHint")}>
                  <EmployeeIssuesList compact />
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
                            <p className="text-sm font-semibold">{t("hr.me.netQar", { amount: row.netQar.toLocaleString() })}</p>
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
    </HrShell>
  );
}
