/**
 * Attendance & Leave Calendar aggregates for My Day (management roles).
 * Reuses listing status resolution so KPIs match Attendance reports.
 */

import {
  resolveHoursBasedAttendanceStatus,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import { attendanceSharedKpiFlags } from "@/lib/attendance-hr/shared-kpis";
import {
  attendanceHrIdentityKey,
  attendanceHrToListingSource,
  type AttendanceHrReportRow,
} from "@/lib/attendance-hr/report";
import { qatarTodayYmd } from "@/lib/attendance-hr/dashboard";

const LEAVE_STATUSES = new Set([
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "comp_off",
]);

export type CalendarStatusFilter =
  | "all"
  | "present"
  | "absent"
  | "leave"
  | "late"
  | "week_off"
  | "holiday"
  | "missed_punch";

export type CalendarDayBuckets = {
  /** Rostered / expected for the day (excludes week-off & holiday when known). */
  scheduled: number;
  present: number;
  absent: number;
  leave: number;
  /** Late is a subset of present — never double-count into absent. */
  late: number;
  weekOff: number;
  holiday: number;
  missedPunch: number;
};

export type CalendarDayAggregate = {
  workDate: string;
  isToday: boolean;
  isFuture: boolean;
  buckets: CalendarDayBuckets;
};

export type CalendarLocationBreakdown = {
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  buckets: CalendarDayBuckets;
};

export type CalendarEmployeeRow = {
  id: string;
  staffId: string | null;
  staffName: string | null;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  workDate: string;
  status: string;
  calendarCode: CalendarCellCode;
  scheduledIn: string | null;
  scheduledOut: string | null;
  actualIn: string | null;
  actualOut: string | null;
  workedMinutes: number | null;
  lateMinutes: number;
  missedPunch: boolean;
  leaveType: string | null;
};

export type CalendarLeavePerson = {
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  leaveType: string;
  locationCode: string | null;
  dateFrom: string;
  dateTo: string;
};

export type CalendarExceptionGroup = {
  kind: "absent" | "late" | "missed_punch";
  count: number;
  names: string[];
};

export type CalendarCellCode = "P" | "A" | "L" | "LT" | "WO" | "H" | "S" | "MP" | "";

export type CalendarKpis = CalendarDayBuckets & {
  /** Denominator for % — prefers scheduled, else present+absent+leave+weekOff+holiday. */
  total: number;
};

function emptyBuckets(): CalendarDayBuckets {
  return {
    scheduled: 0,
    present: 0,
    absent: 0,
    leave: 0,
    late: 0,
    weekOff: 0,
    holiday: 0,
    missedPunch: 0,
  };
}

export function calendarMonthBounds(yearMonth: string): { dateFrom: string; dateTo: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const year = y || 1970;
  const month = m || 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

export function addCalendarDays(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function calendarWeekBounds(anchorYmd: string): { dateFrom: string; dateTo: string } {
  const d = new Date(`${anchorYmd.slice(0, 10)}T12:00:00.000Z`);
  // Monday-start week in UTC date parts (Qatar calendar dates are already YMD).
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const from = addCalendarDays(anchorYmd, mondayOffset);
  return { dateFrom: from, dateTo: addCalendarDays(from, 6) };
}

function isLeaveStatus(status: string): boolean {
  return LEAVE_STATUSES.has(status);
}

/** Compact cell code for day drawer / legend (LT only when late evidence). */
export function calendarStatusCode(
  listing: AttendanceListingSource,
  options?: { isFuture?: boolean },
): CalendarCellCode {
  const status = resolveHoursBasedAttendanceStatus(listing);
  if (status === "public_holiday") return "H";
  if (status === "weekly_off") return "WO";
  if (isLeaveStatus(status)) return "L";
  if (options?.isFuture) {
    if (listing.hasRosterAssignment || listing.scheduled_in || listing.scheduled_out) return "S";
    return "";
  }
  if (status === "missed_punch") return "MP";
  if (status === "absent") return "A";
  const flags = attendanceSharedKpiFlags({
    status: listing.status,
    missed_punch: listing.missed_punch,
    actual_in: listing.actual_in,
    actual_out: listing.actual_out,
    late_minutes: listing.late_minutes,
    worked_minutes: listing.worked_minutes,
    break_minutes: listing.break_minutes,
    expected_minutes: listing.expected_minutes,
    employment_type: listing.employment_type,
    flexible_attendance: listing.flexible_attendance,
    work_date: listing.work_date,
    scheduled_in: listing.scheduled_in,
    scheduled_out: listing.scheduled_out,
    hasRosterAssignment: listing.hasRosterAssignment,
    hire_date: listing.hire_date,
  });
  if (flags.late) return "LT";
  if (flags.present) return "P";
  if (status === "not_started" || status === "unscheduled" || status === "not_joined") return "";
  return "";
}

type Classified = {
  key: string;
  workDate: string;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  code: CalendarCellCode;
  leaveType: string | null;
  flags: {
    scheduled: boolean;
    present: boolean;
    absent: boolean;
    leave: boolean;
    late: boolean;
    weekOff: boolean;
    holiday: boolean;
    missedPunch: boolean;
  };
  row: AttendanceHrReportRow;
  listing: AttendanceListingSource;
};

function classifyRow(row: AttendanceHrReportRow, today: string): Classified | null {
  const workDate = String(row.work_date ?? "").slice(0, 10);
  if (!workDate) return null;
  const listing = attendanceHrToListingSource(row);
  const isFuture = workDate > today;
  const status = resolveHoursBasedAttendanceStatus(listing);
  const code = calendarStatusCode(listing, { isFuture });

  const holiday = status === "public_holiday";
  const weekOff = status === "weekly_off";
  const leave = isLeaveStatus(status);
  const shared = attendanceSharedKpiFlags({
    status: listing.status,
    missed_punch: listing.missed_punch,
    actual_in: listing.actual_in,
    actual_out: listing.actual_out,
    late_minutes: listing.late_minutes,
    worked_minutes: listing.worked_minutes,
    break_minutes: listing.break_minutes,
    expected_minutes: listing.expected_minutes,
    employment_type: listing.employment_type,
    flexible_attendance: listing.flexible_attendance,
    work_date: listing.work_date,
    scheduled_in: listing.scheduled_in,
    scheduled_out: listing.scheduled_out,
    hasRosterAssignment: listing.hasRosterAssignment,
    hire_date: listing.hire_date,
  });

  const rostered = Boolean(
    listing.hasRosterAssignment || listing.scheduled_in || listing.scheduled_out || weekOff || leave || holiday,
  );

  if (isFuture) {
    return {
      key: `${attendanceHrIdentityKey(row)}:${workDate}`,
      workDate,
      locationId: row.location_id,
      locationCode: row.location_code ?? null,
      locationName: row.location_name ?? null,
      code,
      leaveType: leave ? status : null,
      flags: {
        scheduled: rostered && !weekOff && !leave && !holiday,
        present: false,
        absent: false,
        leave,
        late: false,
        weekOff,
        holiday,
        missedPunch: false,
      },
      row,
      listing,
    };
  }

  return {
    key: `${attendanceHrIdentityKey(row)}:${workDate}`,
    workDate,
    locationId: row.location_id,
    locationCode: row.location_code ?? null,
    locationName: row.location_name ?? null,
    code,
    leaveType: leave ? status : null,
    flags: {
      scheduled: rostered && !weekOff && !holiday,
      present: shared.present,
      absent: shared.absent,
      leave,
      late: shared.late,
      weekOff,
      holiday,
      missedPunch: shared.missedPunch,
    },
    row,
    listing,
  };
}

function bump(buckets: CalendarDayBuckets, flags: Classified["flags"]) {
  if (flags.scheduled) buckets.scheduled += 1;
  if (flags.present) buckets.present += 1;
  if (flags.absent) buckets.absent += 1;
  if (flags.leave) buckets.leave += 1;
  if (flags.late) buckets.late += 1;
  if (flags.weekOff) buckets.weekOff += 1;
  if (flags.holiday) buckets.holiday += 1;
  if (flags.missedPunch) buckets.missedPunch += 1;
}

function matchesStatusFilter(flags: Classified["flags"], filter: CalendarStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "present") return flags.present;
  if (filter === "absent") return flags.absent;
  if (filter === "leave") return flags.leave;
  if (filter === "late") return flags.late;
  if (filter === "week_off") return flags.weekOff;
  if (filter === "holiday") return flags.holiday;
  if (filter === "missed_punch") return flags.missedPunch;
  return true;
}

export function filterCalendarRows(
  rows: readonly AttendanceHrReportRow[],
  filters: {
    staffQ?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    status?: CalendarStatusFilter | null;
    today?: string;
  },
): AttendanceHrReportRow[] {
  const today = filters.today ?? qatarTodayYmd();
  const q = (filters.staffQ ?? "").trim().toLowerCase();
  const title = (filters.jobTitle ?? "").trim().toLowerCase();
  const dept = (filters.department ?? "").trim().toLowerCase();
  const status = filters.status ?? "all";

  return rows.filter((row) => {
    if (q) {
      const hay = [row.staff_name, row.employee_code, row.qid, row.device_name]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      if (!hay.includes(q)) return false;
    }
    if (title) {
      if (!String(row.job_title ?? "")
        .toLowerCase()
        .includes(title)) {
        return false;
      }
    }
    if (dept) {
      if (!String(row.department ?? "")
        .toLowerCase()
        .includes(dept)) {
        return false;
      }
    }
    if (status !== "all") {
      const classified = classifyRow(row, today);
      if (!classified || !matchesStatusFilter(classified.flags, status)) return false;
    }
    return true;
  });
}

/** One person-day per identity key (prefer first row after listing enrich). */
function dedupeClassified(items: Classified[]): Classified[] {
  const seen = new Set<string>();
  const out: Classified[] = [];
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

export function aggregateCalendarDays(
  rows: readonly AttendanceHrReportRow[],
  options?: { today?: string; dateFrom?: string; dateTo?: string },
): CalendarDayAggregate[] {
  const today = options?.today ?? qatarTodayYmd();
  const classified = dedupeClassified(
    rows.map((row) => classifyRow(row, today)).filter((row): row is Classified => Boolean(row)),
  );

  const byDay = new Map<string, CalendarDayBuckets>();
  for (const item of classified) {
    if (options?.dateFrom && item.workDate < options.dateFrom) continue;
    if (options?.dateTo && item.workDate > options.dateTo) continue;
    const buckets = byDay.get(item.workDate) ?? emptyBuckets();
    bump(buckets, item.flags);
    byDay.set(item.workDate, buckets);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([workDate, buckets]) => ({
      workDate,
      isToday: workDate === today,
      isFuture: workDate > today,
      buckets,
    }));
}

export function aggregateCalendarKpis(
  rows: readonly AttendanceHrReportRow[],
  workDate: string,
  options?: { today?: string },
): CalendarKpis {
  const today = options?.today ?? qatarTodayYmd();
  const classified = dedupeClassified(
    rows
      .filter((row) => String(row.work_date).slice(0, 10) === workDate)
      .map((row) => classifyRow(row, today))
      .filter((row): row is Classified => Boolean(row)),
  );
  const buckets = emptyBuckets();
  for (const item of classified) bump(buckets, item.flags);
  const total =
    buckets.scheduled > 0
      ? buckets.scheduled
      : buckets.present + buckets.absent + buckets.leave + buckets.weekOff + buckets.holiday;
  return { ...buckets, total };
}

export function aggregateCalendarByLocation(
  rows: readonly AttendanceHrReportRow[],
  workDate: string,
  options?: { today?: string },
): CalendarLocationBreakdown[] {
  const today = options?.today ?? qatarTodayYmd();
  const classified = dedupeClassified(
    rows
      .filter((row) => String(row.work_date).slice(0, 10) === workDate)
      .map((row) => classifyRow(row, today))
      .filter((row): row is Classified => Boolean(row)),
  );
  const byLoc = new Map<string, CalendarLocationBreakdown>();
  for (const item of classified) {
    const existing =
      byLoc.get(item.locationId) ??
      ({
        locationId: item.locationId,
        locationCode: item.locationCode,
        locationName: item.locationName,
        buckets: emptyBuckets(),
      } satisfies CalendarLocationBreakdown);
    bump(existing.buckets, item.flags);
    byLoc.set(item.locationId, existing);
  }
  return [...byLoc.values()].sort((a, b) =>
    String(a.locationCode ?? a.locationName ?? "").localeCompare(
      String(b.locationCode ?? b.locationName ?? ""),
    ),
  );
}

export function buildCalendarEmployeeRows(
  rows: readonly AttendanceHrReportRow[],
  workDate: string,
  options?: { today?: string },
): CalendarEmployeeRow[] {
  const today = options?.today ?? qatarTodayYmd();
  const classified = dedupeClassified(
    rows
      .filter((row) => String(row.work_date).slice(0, 10) === workDate)
      .map((row) => classifyRow(row, today))
      .filter((row): row is Classified => Boolean(row)),
  );
  return classified
    .map((item) => ({
      id: item.row.id,
      staffId: item.row.staff_id,
      staffName: item.row.staff_name,
      employeeCode: item.row.employee_code,
      jobTitle: item.row.job_title ?? null,
      department: item.row.department ?? null,
      locationId: item.locationId,
      locationCode: item.locationCode,
      locationName: item.locationName,
      workDate: item.workDate,
      status: resolveHoursBasedAttendanceStatus(item.listing),
      calendarCode: item.code,
      scheduledIn: item.listing.scheduled_in ?? null,
      scheduledOut: item.listing.scheduled_out ?? null,
      actualIn: item.listing.actual_in ?? null,
      actualOut: item.listing.actual_out ?? null,
      workedMinutes: item.listing.worked_minutes ?? null,
      lateMinutes: Number(item.listing.late_minutes ?? 0),
      missedPunch: Boolean(item.listing.missed_punch),
      leaveType: item.leaveType,
    }))
    .sort((a, b) => String(a.staffName ?? "").localeCompare(String(b.staffName ?? "")));
}

export function buildOnLeaveToday(
  rows: readonly AttendanceHrReportRow[],
  workDate: string,
  options?: { today?: string },
): CalendarLeavePerson[] {
  return buildCalendarEmployeeRows(rows, workDate, options)
    .filter((row) => row.calendarCode === "L" || (row.leaveType && LEAVE_STATUSES.has(row.leaveType)))
    .map((row) => ({
      staffId: row.staffId ?? row.id,
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      leaveType: row.leaveType ?? row.status,
      locationCode: row.locationCode,
      dateFrom: workDate,
      dateTo: workDate,
    }));
}

export function buildAttendanceExceptions(
  rows: readonly AttendanceHrReportRow[],
  workDate: string,
  options?: { today?: string; nameLimit?: number },
): CalendarExceptionGroup[] {
  const people = buildCalendarEmployeeRows(rows, workDate, options);
  const limit = options?.nameLimit ?? 6;
  const groups: CalendarExceptionGroup[] = [];
  const absent = people.filter((p) => p.calendarCode === "A" || p.status === "absent");
  const late = people.filter((p) => p.calendarCode === "LT" || p.lateMinutes > 0);
  const missed = people.filter((p) => p.calendarCode === "MP" || p.missedPunch);
  if (absent.length) {
    groups.push({
      kind: "absent",
      count: absent.length,
      names: absent.slice(0, limit).map((p) => p.staffName || p.employeeCode || "—"),
    });
  }
  if (late.length) {
    groups.push({
      kind: "late",
      count: late.length,
      names: late.slice(0, limit).map((p) => p.staffName || p.employeeCode || "—"),
    });
  }
  if (missed.length) {
    groups.push({
      kind: "missed_punch",
      count: missed.length,
      names: missed.slice(0, limit).map((p) => p.staffName || p.employeeCode || "—"),
    });
  }
  return groups;
}

/** Soft shortage when present+leave coverage is under 85% of scheduled. */
export function locationShortageHints(
  locations: readonly CalendarLocationBreakdown[],
): Array<{ locationId: string; label: string; coveragePct: number }> {
  const hints: Array<{ locationId: string; label: string; coveragePct: number }> = [];
  for (const loc of locations) {
    const scheduled = loc.buckets.scheduled;
    if (scheduled < 4) continue;
    const covered = loc.buckets.present + loc.buckets.leave;
    const pct = Math.round((covered / scheduled) * 1000) / 10;
    if (pct < 85) {
      hints.push({
        locationId: loc.locationId,
        label: loc.locationCode || loc.locationName || loc.locationId,
        coveragePct: pct,
      });
    }
  }
  return hints.sort((a, b) => a.coveragePct - b.coveragePct);
}

export function calendarKpiPercent(count: number, total: number): number | null {
  if (!total || total <= 0) return null;
  return Math.round((count / total) * 1000) / 10;
}

/** Format day cell summary like `P 116 | A 4 | L 7`. */
export function formatDayCellSummary(agg: CalendarDayAggregate): string {
  const b = agg.buckets;
  if (agg.isFuture) {
    const parts: string[] = [];
    if (b.scheduled) parts.push(`S ${b.scheduled}`);
    if (b.leave) parts.push(`L ${b.leave}`);
    if (b.weekOff) parts.push(`WO ${b.weekOff}`);
    if (b.holiday) parts.push(`H ${b.holiday}`);
    return parts.join(" | ") || "—";
  }
  const parts: string[] = [];
  if (b.present) parts.push(`P ${b.present}`);
  if (b.absent) parts.push(`A ${b.absent}`);
  if (b.leave) parts.push(`L ${b.leave}`);
  if (b.late) parts.push(`LT ${b.late}`);
  if (b.weekOff) parts.push(`WO ${b.weekOff}`);
  if (b.holiday) parts.push(`H ${b.holiday}`);
  return parts.join(" | ") || "—";
}
