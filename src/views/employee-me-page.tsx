"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecPageHeader } from "@/components/fec";
import { EmployeeIssuesList, EmployeeRosterList } from "@/components/hr/employee-self-dashboard";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { useMyAttendance, useMyEmployeeProfile, useMyLeaveBalances, useMyLeaveRequests, useMyRoster } from "@/hooks/queries/use-employee-self";
import { usePermission } from "@/hooks/use-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEmployeeDocumentUrl, listEmployeeDocuments, uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import { reviewLeaveRequest, submitLeaveRequest } from "@/lib/hr-leave.functions";
import { listAnnouncements } from "@/lib/hr-announcements.functions";
import { listAirTicketEntitlements } from "@/lib/hr-air-ticket.functions";
import { listMyPayslips } from "@/lib/hr-payroll.functions";
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

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
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
}: {
  id: string;
  title: string;
  hint?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <HrPanel className="h-full p-4 md:p-5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        <div className="mt-3">{children}</div>
      </HrPanel>
    </section>
  );
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
      if (docFile.size > 10 * 1024 * 1024) throw new Error(t("hr.me.fileTooLarge"));
      const data_base64 = await fileToBase64(docFile);
      return uploadEmployeeDocument({
        docType,
        filename: docFile.name,
        data_base64,
        content_type: docFile.type || "application/pdf",
        title: docFile.name,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.docs.uploaded"));
      setDocFile(null);
      setDocInputKey((key) => key + 1);
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
  ];

  return (
    <HrShell>
      <div className="space-y-4 md:space-y-6">
        <FecPageHeader
          className="hidden md:flex"
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
            <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden" aria-label={t("hr.me.jumpTo")}>
              {jumps.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="shrink-0 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium touch-manipulation"
                  onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {profile.isError ? (
              <HrPanel className="p-5 text-sm text-muted-foreground lg:col-span-2">{t("hr.me.profileUnavailable")}</HrPanel>
            ) : null}
            {person ? (
            <section id="me-profile" className="scroll-mt-24 lg:col-span-2">
              <HrPanel className="p-4 md:p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground"
                    aria-hidden
                  >
                    {initials(displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-semibold tracking-tight">{person.fullName}</h1>
                    <p className="truncate text-xs text-muted-foreground">
                      {[person.employeeCode, person.jobTitle].filter(Boolean).join(" · ") || t("hr.me.profile")}
                    </p>
                    {lastDay ? (
                      <p className="mt-2 text-sm">
                        {t("hr.me.lastStatus")}: {labelOrRaw(`attendanceHr.reports.statuses.${lastDay.status}`, lastDay.status)} ·{" "}
                        {formatWorkDateDdMmYyyy(lastDay.workDate)}
                      </p>
                    ) : !attendance.isLoading ? (
                      <p className="mt-2 text-sm text-muted-foreground">{t("hr.me.noStatus")}</p>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 xl:grid-cols-4">
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
                <p className="mt-4 text-sm text-muted-foreground">{t("hr.me.biometricNote")}</p>
              </HrPanel>
            </section>
            ) : null}

              <MeSection
                id="me-attendance"
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
                {!attendance.isLoading && !attendance.isError && (attendance.data?.rows ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("hr.me.noStatus")}</p>
                ) : null}
                <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {(attendance.data?.rows ?? []).map((row) => (
                    <div key={row.id} className="flex items-start justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium">{formatWorkDateDdMmYyyy(row.workDate)}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.locationLabel} · {formatPunchTime12h(row.actualIn) || "—"} – {formatPunchTime12h(row.actualOut) || "—"} ·{" "}
                          {formatHoursValue(computeHoursWorked(row.actualIn, row.actualOut))}h
                        </p>
                      </div>
                      <Badge variant={row.missedPunch ? "destructive" : "muted"}>
                        {labelOrRaw(`attendanceHr.reports.statuses.${row.status}`, row.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </MeSection>

              <MeSection
                id="me-roster"
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
              <MeSection id="me-leave" title={t("hr.leave.requestTitle")}>
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
                <select
                  className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as (typeof HR_LEAVE_TYPES)[number])}
                >
                  {HR_LEAVE_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`hr.leave.types.${value}`)}
                    </option>
                  ))}
                </select>
                {leaveType === "compassionate" ? (
                  <select
                    className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                    value={compassionateScope}
                    onChange={(e) => setCompassionateScope(e.target.value as "inside_qatar" | "outside_qatar")}
                  >
                    <option value="inside_qatar">{t("hr.leave.compassionateInside")}</option>
                    <option value="outside_qatar">{t("hr.leave.compassionateOutside")}</option>
                  </select>
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
                <Button className="mt-3" disabled={!leaveFrom || askLeave.isPending} onClick={() => askLeave.mutate(false)}>
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
                <MeSection id="me-issues" title={t("hr.me.myIssues")} hint={t("hr.me.issuesHint")}>
                  <EmployeeIssuesList compact />
                </MeSection>
              ) : null}

              <MeSection id="me-documents" title={t("hr.me.myDocuments")} hint={t("hr.me.uploadHint")}>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
                  <div>
                    <Label>{t("hr.me.docType")}</Label>
                    <select
                      className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as (typeof EMPLOYEE_DOC_TYPES)[number])}
                    >
                      {EMPLOYEE_DOC_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {t(`hr.docs.types.${value}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("hr.me.chooseFile")}</Label>
                    <Input
                      key={docInputKey}
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <Button disabled={!docFile || uploadDoc.isPending} onClick={() => uploadDoc.mutate()}>
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

              <MeSection id="me-announcements" title={t("hr.me.announcements")}>
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

              <MeSection id="me-tickets" title={t("hr.me.myAirTickets")}>
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

              <MeSection id="me-payslips" title={t("hr.me.myPayslips")}>
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
              </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </HrShell>
  );
}
