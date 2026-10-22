"use client";

import Link from "next/link";
import { CalendarDays, CalendarRange, Clock, Palmtree, TicketCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmployeeAttendanceCalendar } from "@/components/hr/employee-attendance-calendar";
import { EmployeeRosterCalendar } from "@/components/hr/employee-roster-calendar";
import { IncompletePunchRosterSelf } from "@/components/hr/incomplete-punch-roster-self";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMyAttendance,
  useMyEmployeeProfile,
  useMyIssues,
  useMyLeaveBalances,
  useMyLeaveRequests,
  useMyRoster,
} from "@/hooks/queries/use-employee-self";
import { usePermission } from "@/hooks/use-permission";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { monthDateRange } from "@/lib/daily-ops/roster-calendar-utils";
import { cn } from "@/lib/utils";

function labelOrRaw(t: (key: string) => string, key: string, raw: string) {
  const label = t(key);
  return label === key ? raw.replace(/_/g, " ") : label;
}

function issueBadgeVariant(status: string): "destructive" | "warning" | "success" | "muted" | "outline" {
  if (status === "blocked") return "destructive";
  if (status === "open" || status === "assigned" || status === "in_progress") return "warning";
  if (status === "resolved" || status === "closed") return "success";
  return "muted";
}

/** Own tickets, HR list rows. Mount only when `issues.view` is allowed. */
export function EmployeeIssuesList({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const issues = useMyIssues(true);

  if (issues.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    );
  }
  if (issues.isError) {
    return <p className="text-sm text-muted-foreground">{t("hr.me.issuesUnavailable")}</p>;
  }
  const items = issues.data?.items ?? [];
  if (items.length === 0) {
    if (compact) return <p className="text-sm text-muted-foreground">{t("hr.me.issuesEmpty")}</p>;
    return <HrEmptyState message={t("hr.me.issuesEmpty")} icon={TicketCheck} />;
  }
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <Link key={row.id} href={`/issues/${row.id}`} className="hr-list-row">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{row.title}</p>
            <p className="text-xs text-muted-foreground">
              {[row.category, labelOrRaw(t, `hr.me.issuePriority.${row.priority}`, row.priority)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Badge variant={issueBadgeVariant(row.status)}>
            {labelOrRaw(t, `hr.me.issueStatus.${row.status}`, row.status)}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

function LeavePanel() {
  const { t } = useTranslation();
  const leave = useMyLeaveRequests(true);
  const balances = useMyLeaveBalances(true);
  const rows = leave.data ?? [];
  const balanceRows = balances.data?.balances ?? [];

  return (
    <HrPanel className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Palmtree className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            {t("hr.leave.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("hr.leave.history")}</p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href="/hr/me#me-leave">{t("hr.leave.requestTitle")}</Link>
        </Button>
      </div>

      {balances.isLoading ? (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : balanceRows.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {balanceRows.map((b) => (
            <div key={b.leaveType} className="rounded-xl border border-[var(--hr-border)] bg-white/70 px-3 py-2.5 text-sm">
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

      {balances.data?.accrual?.eligible ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("hr.leave.accrualHint", {
            accrued: balances.data.accrual.accruedDays,
            months: balances.data.accrual.monthsAccrued,
            hire: balances.data.accrual.hireDate ?? "—",
          })}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {leave.isLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : rows.length === 0 ? (
          <HrEmptyState message={t("hr.me.leaveEmpty")} icon={Palmtree} />
        ) : (
          rows.slice(0, 8).map((row) => (
            <div key={row.id} className="hr-list-row">
              <div className="min-w-0">
                <p className="font-medium">{t(`hr.leave.types.${row.leaveType}`)}</p>
                <p className="text-xs text-muted-foreground">
                  {row.dateFrom} → {row.dateTo} · {row.days} {t("hr.leave.days")}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </div>
              <Badge
                variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}
              >
                {t(`hr.leave.status.${row.status}`)}
              </Badge>
            </div>
          ))
        )}
      </div>
    </HrPanel>
  );
}

function AttendancePanel() {
  const { t } = useTranslation();
  const todayYmd = useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }),
    [],
  );
  const [yearMonth, setYearMonth] = useState(() => todayYmd.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const range = useMemo(() => {
    const { from, to } = monthDateRange(yearMonth);
    return { dateFrom: from, dateTo: to };
  }, [yearMonth]);
  const attendance = useMyAttendance(true, range);
  const roster = useMyRoster(true, range);
  const rows = attendance.data?.rows ?? [];

  return (
    <HrPanel className="h-full p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Clock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        {t("hr.me.myAttendance")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("hr.me.biometricNote")}</p>
      <div className="mt-3">
        {attendance.isError ? (
          <p className="text-sm text-muted-foreground">{t("hr.me.attendanceUnavailable")}</p>
        ) : (
          <EmployeeAttendanceCalendar
            yearMonth={yearMonth}
            onYearMonthChange={(ym) => {
              setYearMonth(ym);
              setSelectedDate(null);
            }}
            rows={rows}
            rosterRows={roster.data?.rows}
            isLoading={attendance.isLoading}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            todayYmd={todayYmd}
          />
        )}
      </div>
    </HrPanel>
  );
}

/** Own roster for the current FEC month. Safe to mount only for a linked (or profile-error) employee. */
export function EmployeeRosterList() {
  const { t } = useTranslation();
  const roster = useMyRoster(true);
  const rows = roster.data?.rows ?? [];

  if (roster.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (roster.isError) return <p className="text-sm text-muted-foreground">{t("hr.me.rosterUnavailable")}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("hr.me.rosterEmpty")}</p>;

  return (
    <EmployeeRosterCalendar rows={rows} dateFrom={roster.data?.dateFrom} dateTo={roster.data?.dateTo} />
  );
}

function RosterPanel() {
  const { t } = useTranslation();
  const roster = useMyRoster(true);
  return (
    <HrPanel className="h-full p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <CalendarRange className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        {t("hr.me.myRoster")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {roster.isLoading
          ? t("common.loading")
          : roster.data
            ? `${formatWorkDateDdMmYyyy(roster.data.dateFrom)} → ${formatWorkDateDdMmYyyy(roster.data.dateTo)}`
            : null}
      </p>
      <div className="mt-3 space-y-4">
        <IncompletePunchRosterSelf />
        <EmployeeRosterList />
      </div>
    </HrPanel>
  );
}

function IssuesPanel() {
  const { t } = useTranslation();
  return (
    <HrPanel className="h-full p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <TicketCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        {t("hr.me.myIssues")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("hr.me.issuesHint")}</p>
      <div className="mt-3">
        <EmployeeIssuesList />
      </div>
    </HrPanel>
  );
}

function ProfilePanel() {
  const { t } = useTranslation();
  const profile = useMyEmployeeProfile();
  const person = profile.data;
  if (!person) return null;

  const facts = [
    [t("hr.me.jobTitle"), person.jobTitle],
    [t("hr.me.department"), person.department],
    [t("hr.me.location"), person.locationLabel],
    [t("hr.me.phone"), person.phone],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <HrPanel className="p-4 md:p-5 lg:col-span-2">
      <h2 className="text-sm font-semibold tracking-tight">{person.fullName}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[person.employeeCode, person.jobTitle].filter(Boolean).join(" · ") || t("hr.me.profile")}
      </p>
      {facts.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="truncate text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-4 text-sm text-muted-foreground">{t("hr.me.biometricNote")}</p>
    </HrPanel>
  );
}

/** Floor-staff home: profile, biometric attendance, own roster, leave, and issues. No ops wall. */
export function EmployeeSelfDashboard() {
  const { t } = useTranslation();
  const canIssues = usePermission("issues.view");
  const profile = useMyEmployeeProfile();
  const linked = Boolean(profile.data?.id);
  const person = profile.data;
  const showSelf = linked || profile.isError;

  return (
    <HrShell>
      <HrSection
        icon={CalendarDays}
        kicker={t("hr.me.brand")}
        title={person?.fullName || t("hr.me.title")}
        subtitle={
          person
            ? [person.employeeCode, person.jobTitle].filter(Boolean).join(" · ") || t("hr.me.selfSubtitle")
            : t("hr.me.selfSubtitle")
        }
      >
        {profile.isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-28 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : !showSelf ? (
          <HrPanel className="space-y-2 p-5 text-center md:p-8">
            <h2 className="text-lg font-semibold tracking-tight">{t("hr.me.unlinked")}</h2>
            <p className="text-sm text-muted-foreground">{t("hr.me.unlinkedHint")}</p>
          </HrPanel>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {profile.isError ? (
              <HrPanel className="p-5 text-sm text-muted-foreground lg:col-span-2">{t("hr.me.profileUnavailable")}</HrPanel>
            ) : (
              <ProfilePanel />
            )}
            <AttendancePanel />
            <RosterPanel />
            <div className={cn(!canIssues && "lg:col-span-2")}>
              <LeavePanel />
            </div>
            {canIssues ? <IssuesPanel /> : null}
          </div>
        )}
      </HrSection>
    </HrShell>
  );
}
