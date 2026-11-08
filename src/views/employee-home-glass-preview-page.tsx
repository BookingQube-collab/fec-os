"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck2,
  Clock3,
  Filter,
  Plane,
  UserMinus,
  Users,
  XCircle,
} from "lucide-react";

import { HrShell } from "@/components/hr/hr-shell";
import { useAuth } from "@/hooks/use-auth";
import { useMyEmployeeProfile } from "@/hooks/queries/use-employee-self";
import { getAttendanceLeaveCalendar } from "@/lib/attendance-hr/attendance-leave-calendar.functions";
import { qatarTodayYmd } from "@/lib/attendance-hr/dashboard";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { canSeeAttendanceLeaveCalendar } from "@/lib/attendance-listing-access";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { type AppRole } from "@/lib/rbac";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import "@/styles/employee-home-glass-preview.css";

type LeaveTone = "paid" | "vacation" | "sick" | "annual";
type ApprovalState = "Approved" | "Pending";

type PreviewLeaveBar = {
  label: string;
  tone: LeaveTone;
  status: ApprovalState;
  /** 0-based day index within the visible week */
  startCol: number;
  /** inclusive span in day columns */
  span: number;
};

type PreviewPersonRow = {
  id: string;
  name: string;
  role: string;
  avatarTone: "a" | "b" | "c" | "d" | "e";
  bars: PreviewLeaveBar[];
};

const SAMPLE_ROWS: PreviewPersonRow[] = [
  {
    id: "s1",
    name: "Ethan Parker",
    role: "Software Engineer",
    avatarTone: "a",
    bars: [{ label: "Paid Leave", tone: "paid", status: "Approved", startCol: 1, span: 3 }],
  },
  {
    id: "s2",
    name: "Maya Chen",
    role: "Operations Lead",
    avatarTone: "b",
    bars: [{ label: "Vacation", tone: "vacation", status: "Approved", startCol: 0, span: 2 }],
  },
  {
    id: "s3",
    name: "Omar Hassan",
    role: "Shift Supervisor",
    avatarTone: "c",
    bars: [{ label: "Sick Leave", tone: "sick", status: "Pending", startCol: 3, span: 2 }],
  },
  {
    id: "s4",
    name: "Priya Nair",
    role: "HR Coordinator",
    avatarTone: "d",
    bars: [{ label: "Annual Leave", tone: "annual", status: "Approved", startCol: 2, span: 4 }],
  },
  {
    id: "s5",
    name: "James Okonkwo",
    role: "Facility Manager",
    avatarTone: "e",
    bars: [{ label: "Paid Leave", tone: "paid", status: "Pending", startCol: 4, span: 2 }],
  },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

function greetingWord(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function addDaysYmd(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function startOfWeekMonday(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  const dow = dt.getUTCDay(); // 0 Sun … 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function dayLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(dt);
  return `${weekday} ${d}`;
}

function isWeekendYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1)).getUTCDay();
  return dow === 0 || dow === 6;
}

function pctLabel(count: number, total: number) {
  if (!total) return "";
  return ` (${((count / total) * 100).toFixed(1)}%)`;
}

function barStyle(startCol: number, span: number, cols: number): CSSProperties {
  const left = (startCol / cols) * 100;
  const width = (span / cols) * 100;
  return {
    left: `calc(${left}% + 0.35rem)`,
    width: `calc(${width}% - 0.7rem)`,
  };
}

export default function EmployeeHomeGlassPreviewPage() {
  const { roles, profile: sessionProfile } = useAuth();
  const roleList = roles.map((role) => role.role as AppRole);
  const { hasDirectReports } = useHasDirectReports();
  const canCalendar = canSeeAttendanceLeaveCalendar(
    roleList,
    hasDirectReports,
    sessionProfile?.job_title,
    sessionProfile?.department,
    sessionProfile?.staff_role,
  );
  const me = useMyEmployeeProfile();
  const today = qatarTodayYmd();
  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i)),
    [weekStart],
  );
  const todayIndex = days.indexOf(today);

  const calendar = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "home-glass-preview-calendar",
      month: today.slice(0, 7),
      calendarView: "day",
      anchorDate: today,
    }),
    queryFn: () =>
      getAttendanceLeaveCalendar({
        month: today.slice(0, 7),
        view: "day",
        anchorDate: today,
      }),
    staleTime: STALE.people,
    enabled: canCalendar,
    retry: false,
  });

  const kpis = calendar.data?.kpis;
  const total = kpis?.total || kpis?.scheduled || 0;
  const displayName = me.data?.fullName || sessionProfile?.display_name || "there";
  const jobLine = [me.data?.jobTitle || sessionProfile?.job_title, "FEC Operations Command"]
    .filter(Boolean)
    .join(" · ");
  const hour = new Date().getHours();

  const onLeave = calendar.data?.onLeaveToday ?? [];
  const exceptions = calendar.data?.exceptions ?? [];
  const upcoming = calendar.data?.upcomingLeaves ?? [];
  const upcomingByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of upcoming) {
      const key = row.dateFrom;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(0, 5);
  }, [upcoming]);

  const rangeLabel = `${formatWorkDateDdMmYyyy(days[0]!)} – ${formatWorkDateDdMmYyyy(days[6]!)}`;

  return (
    <HrShell>
      <div className="fec-glass-preview">
        <div className="fec-glass-preview__banner" role="status">
          <div>
            <p className="fec-glass-preview__banner-label">Preview · awaiting approval</p>
            <p className="fec-glass-preview__banner-copy">
              Reference-faithful Employee Home glass redesign. Production{" "}
              <Link href="/hr/me">/hr/me</Link> is unchanged until you approve.
            </p>
          </div>
          <Link href="/hr/me">Back to current Employee Home</Link>
        </div>

        <header className="fec-gp-greeting">
          <h1 className="fec-gp-greeting__title">
            {greetingWord(hour)},{" "}
            <span className="fec-gp-greeting__name">{displayName}</span>
            <span className="fec-gp-greeting__wave" aria-hidden>
              {" "}
              👋
            </span>
          </h1>
          <p className="fec-gp-greeting__sub">{jobLine}</p>
        </header>

        <section className="fec-gp-kpis" aria-label="Attendance KPIs">
          <div className="fec-gp-kpi fec-gp-kpi--violet">
            <div className="fec-gp-kpi__meta">
              <p className="fec-gp-kpi__label">Total Employees</p>
              <p className="fec-gp-kpi__value">
                {canCalendar && kpis ? total : canCalendar && calendar.isLoading ? "…" : "—"}
              </p>
            </div>
            <span className="fec-gp-kpi__icon" aria-hidden>
              <Users className="size-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="fec-gp-kpi fec-gp-kpi--green">
            <div className="fec-gp-kpi__meta">
              <p className="fec-gp-kpi__label">Present Today</p>
              <p className="fec-gp-kpi__value">
                {canCalendar && kpis ? (
                  <>
                    {kpis.present}
                    <span className="fec-gp-kpi__pct">{pctLabel(kpis.present, total)}</span>
                  </>
                ) : canCalendar && calendar.isLoading ? (
                  "…"
                ) : (
                  "—"
                )}
              </p>
            </div>
            <span className="fec-gp-kpi__icon" aria-hidden>
              <CalendarCheck2 className="size-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="fec-gp-kpi fec-gp-kpi--red">
            <div className="fec-gp-kpi__meta">
              <p className="fec-gp-kpi__label">Absent Today</p>
              <p className="fec-gp-kpi__value">
                {canCalendar && kpis ? (
                  <>
                    {kpis.absent}
                    <span className="fec-gp-kpi__pct">{pctLabel(kpis.absent, total)}</span>
                  </>
                ) : canCalendar && calendar.isLoading ? (
                  "…"
                ) : (
                  "—"
                )}
              </p>
            </div>
            <span className="fec-gp-kpi__icon" aria-hidden>
              <UserMinus className="size-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="fec-gp-kpi fec-gp-kpi--orange">
            <div className="fec-gp-kpi__meta">
              <p className="fec-gp-kpi__label">On Leave Today</p>
              <p className="fec-gp-kpi__value">
                {canCalendar && kpis ? (
                  <>
                    {kpis.leave}
                    <span className="fec-gp-kpi__pct">{pctLabel(kpis.leave, total)}</span>
                  </>
                ) : canCalendar && calendar.isLoading ? (
                  "…"
                ) : (
                  "—"
                )}
              </p>
            </div>
            <span className="fec-gp-kpi__icon" aria-hidden>
              <Plane className="size-4" strokeWidth={1.75} />
            </span>
          </div>
          <div className="fec-gp-kpi fec-gp-kpi--blue">
            <div className="fec-gp-kpi__meta">
              <p className="fec-gp-kpi__label">Late Today</p>
              <p className="fec-gp-kpi__value">
                {canCalendar && kpis ? (
                  <>
                    {kpis.late}
                    <span className="fec-gp-kpi__pct">{pctLabel(kpis.late, total)}</span>
                  </>
                ) : canCalendar && calendar.isLoading ? (
                  "…"
                ) : (
                  "—"
                )}
              </p>
            </div>
            <span className="fec-gp-kpi__icon" aria-hidden>
              <Clock3 className="size-4" strokeWidth={1.75} />
            </span>
          </div>
        </section>

        <section className="fec-gp-glass fec-gp-timeline" aria-label="Planned Absences preview">
          <div className="fec-gp-timeline__head">
            <h2 className="fec-gp-timeline__title">
              Planned Absences
              <span className="fec-gp-timeline__sample-tag">Preview sample</span>
            </h2>
            <div className="fec-gp-timeline__actions">
              <span className="fec-gp-chip">{rangeLabel}</span>
              <span className="fec-gp-chip">
                <Filter className="size-3.5" strokeWidth={1.75} aria-hidden />
                Filter
              </span>
              <button type="button" className="fec-gp-chip fec-gp-chip--ghost">
                View all
              </button>
            </div>
          </div>

          <div className="fec-gp-timeline__scroll">
            <div
              className="fec-gp-gantt"
              style={{ ["--gp-cols" as string]: String(days.length) }}
            >
              <div className="fec-gp-gantt__corner" />
              {days.map((ymd) => (
                <div
                  key={ymd}
                  className={cn("fec-gp-gantt__day", ymd === today && "is-today")}
                >
                  {dayLabel(ymd)}
                </div>
              ))}

              {SAMPLE_ROWS.map((person) => (
                <div key={person.id} style={{ display: "contents" }}>
                  <div className="fec-gp-gantt__person">
                    <span className={cn("fec-gp-avatar", `fec-gp-avatar--${person.avatarTone}`)} aria-hidden>
                      {initials(person.name)}
                    </span>
                    <div>
                      <p className="fec-gp-person__name">{person.name}</p>
                      <p className="fec-gp-person__role">{person.role}</p>
                    </div>
                  </div>
                  <div className="fec-gp-gantt__row-tracks" style={{ gridColumn: `2 / span ${days.length}` }}>
                    {todayIndex >= 0 ? (
                      <div
                        className="fec-gp-gantt__today-line"
                        style={{ left: `${((todayIndex + 0.5) / days.length) * 100}%` }}
                        aria-hidden
                      />
                    ) : null}
                    <div className="fec-gp-gantt__weekend-layer" aria-hidden>
                      {days.map((ymd) => (
                        <div
                          key={`${person.id}-we-${ymd}`}
                          className={cn("fec-gp-gantt__track", isWeekendYmd(ymd) && "is-weekend")}
                        />
                      ))}
                    </div>
                    {person.bars.map((bar) => (
                      <div
                        key={`${person.id}-${bar.label}-${bar.startCol}`}
                        className={cn("fec-gp-bar", `fec-gp-bar--${bar.tone}`)}
                        style={barStyle(bar.startCol, bar.span, days.length)}
                        title={`${bar.label} · ${bar.status} (preview sample)`}
                      >
                        <span>{bar.label}</span>
                        <span
                          className={cn(
                            "fec-gp-bar__badge",
                            bar.status === "Pending" && "is-pending",
                          )}
                        >
                          {bar.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="fec-gp-note">
            Timeline rows above are labelled preview sample layout only — not live leave records.
          </p>
        </section>

        <section className="fec-gp-widgets" aria-label="Home widgets">
          <article className="fec-gp-glass fec-gp-widget">
            <div className="fec-gp-widget__head">
              <h3 className="fec-gp-widget__title">
                Employees on Leave
                <span className="fec-gp-widget__count">{onLeave.length}</span>
              </h3>
            </div>
            {!canCalendar ? (
              <p className="fec-gp-empty">Live leave list needs calendar access. Visual shell only.</p>
            ) : calendar.isLoading ? (
              <p className="fec-gp-empty">Loading…</p>
            ) : onLeave.length === 0 ? (
              <p className="fec-gp-empty">No one on leave today.</p>
            ) : (
              onLeave.slice(0, 5).map((person) => (
                <div key={`${person.staffId}-${person.dateFrom}`} className="fec-gp-person-row">
                  <span className="fec-gp-avatar fec-gp-avatar--e" aria-hidden>
                    {initials(person.staffName || person.employeeCode || "?")}
                  </span>
                  <div className="fec-gp-person-row__copy">
                    <p className="fec-gp-person-row__name">{person.staffName || person.employeeCode || "—"}</p>
                    <p className="fec-gp-person-row__meta">
                      {[person.leaveType, person.locationCode].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </article>

          <article className="fec-gp-glass fec-gp-widget fec-gp-widget--alert">
            <div className="fec-gp-widget__head">
              <h3 className="fec-gp-widget__title">
                Exceptions
                <span className="fec-gp-widget__count">
                  {exceptions.reduce((sum, g) => sum + g.count, 0)}
                </span>
              </h3>
              <Link href="/hr/me#me-correction" className="fec-gp-widget__link">
                View all
              </Link>
            </div>
            {!canCalendar ? (
              <p className="fec-gp-empty">Live exceptions need calendar access.</p>
            ) : calendar.isLoading ? (
              <p className="fec-gp-empty">Loading…</p>
            ) : exceptions.length === 0 ? (
              <p className="fec-gp-empty">No attendance exceptions right now.</p>
            ) : (
              exceptions.map((group) => (
                <div key={group.kind} className="fec-gp-event">
                  <div className="fec-gp-event__top">
                    <p className="fec-gp-event__title">
                      {group.kind === "absent" ? (
                        <XCircle className="me-1 inline size-3.5 align-text-top" aria-hidden />
                      ) : group.kind === "late" ? (
                        <Clock3 className="me-1 inline size-3.5 align-text-top" aria-hidden />
                      ) : (
                        <UserMinus className="me-1 inline size-3.5 align-text-top" aria-hidden />
                      )}
                      {group.kind === "missed_punch" ? "Missed punch" : group.kind} ({group.count})
                    </p>
                  </div>
                  <p className="fec-gp-event__meta">{group.names.join(", ")}</p>
                </div>
              ))
            )}
          </article>

          <article className="fec-gp-glass fec-gp-widget">
            <div className="fec-gp-widget__head">
              <h3 className="fec-gp-widget__title">
                Upcoming Leaves
                <span className="fec-gp-widget__count">{upcoming.length}</span>
              </h3>
            </div>
            {!canCalendar ? (
              <p className="fec-gp-empty">Live upcoming leaves need calendar access.</p>
            ) : calendar.isLoading ? (
              <p className="fec-gp-empty">Loading…</p>
            ) : upcomingByDay.length === 0 ? (
              <p className="fec-gp-empty">No upcoming leaves in range.</p>
            ) : (
              upcomingByDay.map(([ymd, count], index) => (
                <div key={ymd} className={cn("fec-gp-event", index === 0 && "fec-gp-event--hot")}>
                  <div className="fec-gp-event__top">
                    <p className="fec-gp-event__title">{formatWorkDateDdMmYyyy(ymd)}</p>
                    {index === 0 ? <span className="fec-gp-event__tag">Next</span> : null}
                  </div>
                  <p className="fec-gp-event__meta">
                    {count} leave{count === 1 ? "" : "s"} starting
                  </p>
                </div>
              ))
            )}
          </article>
        </section>

        <p className="fec-gp-note">
          This route is temporary for visual approval. Approving will replace the current glass Employee
          Home implementation with this layout language.
        </p>
      </div>
    </HrShell>
  );
}
