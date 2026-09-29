"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  ClipboardList,
  Clock,
  FileText,
  Megaphone,
  Palmtree,
  Plane,
  Share,
  TicketCheck,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecPageHeader } from "@/components/fec";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import {
  MissedPunchApprovalQueue,
  MissedPunchRequestButton,
  MyMissedPunchRequests,
} from "@/components/attendance-hr/missed-punch-approval-queue";
import { EmployeeIssuesList, EmployeeRosterList } from "@/components/hr/employee-self-dashboard";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { useMyAttendance, useMyEmployeeProfile, useMyLeaveBalances, useMyLeaveRequests, useMyRoster } from "@/hooks/queries/use-employee-self";
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

function MeSection({
  id,
  title,
  hint,
  children,
  className,
  icon: Icon,
}: {
  id: string;
  title: string;
  hint?: string | null;
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <section id={id} className={cn("scroll-mt-28", className)}>
      <HrPanel className="h-full border-t-2 border-t-primary/70 p-4 shadow-elevated-sm md:p-5">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
        <div className="mt-3">{children}</div>
      </HrPanel>
    </section>
  );
}

function attendanceTone(status: string, missedPunch: boolean): "destructive" | "warning" | "success" | "muted" {
  if (missedPunch || status === "absent" || status === "missed_punch") return "destructive";
  if (status === "late" || status === "early_leave" || status === "early_departure") return "warning";
  if (status === "present" || status === "overtime") return "success";
  return "muted";
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
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

  const lastDay = attendance.data?.rows[0];
  const ios = useMemo(() => isIos(), []);
  const person = profile.data;

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

  const jumps = [
    { id: "me-profile", label: t("hr.me.profile") },
    { id: "me-attendance", label: t("hr.me.myAttendance") },
    { id: "me-roster", label: t("hr.me.myRoster") },
    { id: "me-leave", label: t("hr.leave.requestTitle") },
    ...(canIssues ? [{ id: "me-issues", label: t("hr.me.myIssues") }] : []),
    { id: "me-documents", label: t("hr.me.myDocuments") },
    { id: "me-announcements", label: t("hr.me.announcements") },
    { id: "me-tickets", label: t("hr.me.myAirTickets") },
    { id: "me-payslips", label: t("hr.me.myPayslips") },
    { id: "me-kra", label: t("hr.me.myKra") },
  ];

  return (
    <HrShell>
      <div className="space-y-4 md:space-y-6">
        <FecPageHeader
          className="sr-only"
          icon={UserRound}
          kicker={t("hr.me.brand")}
          title={t("hr.me.title")}
          subtitle={
            person
              ? [person.fullName, person.employeeCode, person.jobTitle].filter(Boolean).join(" · ")
              : t("hr.me.biometricNote")
          }
        />

        {!installDismissed ? (
          <section className="hr-notice hr-enter text-sm md:hidden">
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

        {profile.isLoading ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}

        {unlinked ? (
          <HrPanel className="space-y-2 p-5 text-center md:p-8">
            <h1 className="text-lg font-semibold tracking-tight">{t("hr.me.unlinked")}</h1>
            <p className="text-sm text-muted-foreground">{t("hr.me.unlinkedHint")}</p>
          </HrPanel>
        ) : null}

        {selfReady && (person || profile.isError) ? (
          <>
            <PillTabScroller label={t("hr.me.jumpTo")}>
              {jumps.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={pillTabItemClass(false)}
                  onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  {item.label}
                </button>
              ))}
            </PillTabScroller>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {profile.isError ? (
              <HrPanel className="p-5 text-sm text-muted-foreground lg:col-span-2">{t("hr.me.profileUnavailable")}</HrPanel>
            ) : null}
            {person ? (
            <section id="me-profile" className="scroll-mt-28 lg:col-span-2">
              <HrPanel className="relative overflow-hidden border-t-4 border-t-primary p-4 shadow-elevated-sm md:p-6">
                <div
                  className="pointer-events-none absolute -end-10 -top-12 h-36 w-36 rounded-full bg-primary/15 blur-2xl"
                  aria-hidden
                />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-elevated-xs"
                    aria-hidden
                  >
                    {initials(displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("hr.me.brand")} · {t("hr.me.title")}
                    </p>
                    <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{person.fullName}</h1>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {[person.jobTitle, person.locationLabel].filter(Boolean).join(" · ") || t("hr.me.profile")}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {person.employeeCode ? <Badge variant="outline">{person.employeeCode}</Badge> : null}
                      {person.status ? (
                        <Badge variant={person.status === "active" ? "success" : "muted"}>
                          {labelOrRaw(`hr.me.staffStatus.${person.status}`, person.status)}
                        </Badge>
                      ) : null}
                      {lastDay ? (
                        <Badge variant={attendanceTone(lastDay.status, lastDay.missedPunch)}>
                          {t("hr.me.lastStatus")}: {labelOrRaw(`attendanceHr.reports.statuses.${lastDay.status}`, lastDay.status)} ·{" "}
                          {formatWorkDateDdMmYyyy(lastDay.workDate)}
                        </Badge>
                      ) : !attendance.isLoading ? (
                        <span className="text-sm text-muted-foreground">{t("hr.me.noStatus")}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <dl className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 xl:grid-cols-4">
                  <Fact label={t("hr.me.jobTitle")} value={person.jobTitle} />
                  <Fact label={t("hr.me.department")} value={person.department} />
                  <Fact label={t("hr.me.location")} value={person.locationLabel} />
                  <Fact
                    label={t("hr.me.employmentType")}
                    value={
                      person.employmentType
                        ? labelOrRaw(`people.staff.employmentTypes.${person.employmentType}`, person.employmentType)
                        : null
                    }
                  />
                  <Fact
                    label={t("people.staff.status")}
                    value={person.status ? labelOrRaw(`hr.me.staffStatus.${person.status}`, person.status) : null}
                  />
                  <Fact label={t("hr.me.phone")} value={person.phone} />
                  <Fact label={t("hr.me.email")} value={person.email} />
                  <Fact
                    label={t("hr.me.hireDate")}
                    value={person.hireDate ? formatWorkDateDdMmYyyy(person.hireDate) : null}
                  />
                </dl>
                <p className="relative mt-4 text-sm text-muted-foreground">{t("hr.me.biometricNote")}</p>
              </HrPanel>
            </section>
            ) : null}

              <MeSection
                id="me-attendance"
                icon={Clock}
                title={t("hr.me.myAttendance")}
                hint={
                  attendance.isLoading
                    ? t("common.loading")
                    : attendance.isError
                      ? t("hr.me.attendanceUnavailable")
                      : attendance.data
                        ? `${formatWorkDateDdMmYyyy(attendance.data.dateFrom)} → ${formatWorkDateDdMmYyyy(attendance.data.dateTo)}`
                        : null
                }
              >
                <div id="me-punch-approvals">
                  <MissedPunchApprovalQueue hideWhenEmpty />
                </div>
                {!attendance.isLoading && !attendance.isError && (attendance.data?.rows ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("hr.me.noStatus")}</p>
                ) : null}
                <div className="max-h-[32rem] space-y-2 overflow-y-auto">
                  {(attendance.data?.rows ?? []).map((row) => {
                    const needsPunch =
                      row.missedPunch ||
                      row.status === "missed_punch" ||
                      Boolean(row.actualIn) !== Boolean(row.actualOut);
                    return (
                      <div
                        key={row.id}
                        className={cn(
                          "rounded-2xl border px-3 py-2.5 text-sm",
                          needsPunch ? "border-amber-500/40 bg-amber-500/10" : "border-border/60 bg-background/50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{formatWorkDateDdMmYyyy(row.workDate)}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.locationLabel} · {formatPunchTime12h(row.actualIn) || "—"} – {formatPunchTime12h(row.actualOut) || "—"} ·{" "}
                              {formatHoursValue(computeHoursWorked(row.actualIn, row.actualOut))}h
                            </p>
                          </div>
                          <Badge variant={attendanceTone(row.status, row.missedPunch)}>
                            {labelOrRaw(`attendanceHr.reports.statuses.${row.status}`, row.status)}
                          </Badge>
                        </div>
                        <MissedPunchRequestButton
                          summaryId={row.id}
                          missedPunch={row.missedPunch}
                          status={row.status}
                          actualIn={row.actualIn}
                          actualOut={row.actualOut}
                        />
                      </div>
                    );
                  })}
                </div>
                <MyMissedPunchRequests />
              </MeSection>

              <MeSection
                id="me-roster"
                icon={CalendarRange}
                title={t("hr.me.myRoster")}
                hint={
                  roster.isLoading
                    ? t("common.loading")
                    : roster.data
                      ? `${formatWorkDateDdMmYyyy(roster.data.dateFrom)} → ${formatWorkDateDdMmYyyy(roster.data.dateTo)}`
                      : null
                }
              >
                <EmployeeRosterList />
              </MeSection>

              {person ? (
              <>
              <MeSection id="me-leave" icon={Palmtree} title={t("hr.leave.requestTitle")}>
                {(balances.data?.balances ?? []).length > 0 ? (
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                    {balances.data!.balances.slice(0, 4).map((b) => (
                      <div key={b.leaveType} className="rounded-xl border border-border/60 bg-background/70 px-2 py-1.5">
                        <p className="font-medium">{t(`hr.leave.types.${b.leaveType}`)}</p>
                        <p className="text-muted-foreground">
                          {t("hr.leave.remaining", {
                            remaining: b.remainingDays,
                            allotted: b.allottedDays,
                            used: b.usedDays,
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
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
                    <ul className="mt-1 list-disc pl-4">
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

                <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("hr.leave.history")}
                </h3>
                {(leave.data ?? []).length === 0 && !leave.isLoading ? (
                  <p className="text-xs text-muted-foreground">{t("hr.me.leaveEmpty")}</p>
                ) : null}
                <div className="space-y-2">
                  {(leave.data ?? []).slice(0, 12).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {row.dateFrom} → {row.dateTo} · {t(`hr.leave.types.${row.leaveType}`)} · {t(`hr.leave.status.${row.status}`)} · {row.days}d
                      </span>
                      {row.status === "pending" ? (
                        <Button size="sm" variant="ghost" disabled={cancelLeave.isPending} onClick={() => cancelLeave.mutate(row.id)}>
                          {t("hr.leave.cancel")}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </MeSection>

              {canIssues ? (
                <MeSection id="me-issues" icon={TicketCheck} title={t("hr.me.myIssues")} hint={t("hr.me.issuesHint")}>
                  <EmployeeIssuesList compact />
                </MeSection>
              ) : null}

              <MeSection id="me-documents" icon={FileText} title={t("hr.me.myDocuments")} hint={t("hr.me.uploadHint")}>
                <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
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
                            className="mt-1 text-left text-xs text-primary underline"
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
                            className="mt-1 text-left text-xs text-primary underline"
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
                    {docReading ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{t("people.staff.readingDocument")}</p>
                    ) : null}
                    {docExtractNote ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{docExtractNote}</p>
                    ) : null}
                  </div>
                  <Button className="min-h-11" disabled={!docFile || uploadDoc.isPending} onClick={() => uploadDoc.mutate()}>
                    {t("hr.me.uploadDoc")}
                  </Button>
                </div>
                {(documents.data ?? []).length === 0 && !documents.isLoading && !documents.isError ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("hr.me.noDocuments")}</p>
                ) : null}
                <div className="mt-2">
                  {(documents.data ?? []).slice(0, 12).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-2 text-sm last:border-0">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{doc.title || t(`hr.docs.types.${doc.docType}`)}</p>
                        <p className="text-xs text-muted-foreground">
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
                  ))}
                </div>
              </MeSection>

              <MeSection id="me-announcements" icon={Megaphone} title={t("hr.me.announcements")}>
                {(announcements.data ?? []).length === 0 && !announcements.isLoading && !announcements.isError ? (
                  <p className="text-sm text-muted-foreground">{t("hr.me.announcementsEmpty")}</p>
                ) : null}
                <ul className="space-y-3">
                  {(announcements.data ?? []).slice(0, 8).map((item) => (
                    <li key={item.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.body}</p>
                    </li>
                  ))}
                </ul>
              </MeSection>

              <MeSection id="me-tickets" icon={Plane} title={t("hr.me.myAirTickets")}>
                {(airTickets.data ?? []).length === 0 && !airTickets.isLoading && !airTickets.isError ? (
                  <p className="text-sm text-muted-foreground">{t("hr.me.noAirTickets")}</p>
                ) : null}
                <div className="space-y-2">
                  {(airTickets.data ?? []).slice(0, 8).map((row) => (
                    <div key={row.id} className="flex items-start justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium">{row.destination || t("hr.airTickets.destination")}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.me.eligibleOn", { date: formatWorkDateDdMmYyyy(row.eligibilityOn) })}
                        </p>
                      </div>
                      <Badge variant="muted">{labelOrRaw(`hr.airTickets.status.${row.status}`, row.status)}</Badge>
                    </div>
                  ))}
                </div>
              </MeSection>

              <MeSection id="me-payslips" icon={Wallet} title={t("hr.me.myPayslips")}>
                {(payslips.data ?? []).length === 0 && !payslips.isLoading && !payslips.isError ? (
                  <p className="text-sm text-muted-foreground">{t("hr.me.noPayslips")}</p>
                ) : null}
                <div className="space-y-2">
                  {(payslips.data ?? []).slice(0, 8).map((row) => (
                    <div key={row.lineId} className="flex items-start justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium">{row.month || `${formatWorkDateDdMmYyyy(row.dateFrom)} → ${formatWorkDateDdMmYyyy(row.dateTo)}`}</p>
                        {row.dateFrom && row.dateTo ? (
                          <p className="text-xs text-muted-foreground">
                            {formatWorkDateDdMmYyyy(row.dateFrom)} → {formatWorkDateDdMmYyyy(row.dateTo)}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-medium">{t("hr.me.netQar", { amount: row.netQar.toLocaleString() })}</p>
                    </div>
                  ))}
                </div>
              </MeSection>

              <MeSection id="me-kra" icon={ClipboardList} title={t("hr.me.myKra")}>
                <MyKraScorecards />
              </MeSection>
              </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </HrShell>
  );
}
