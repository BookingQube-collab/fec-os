import { englishAssistText } from "./copy";
import type { AssistItem, AssistResult } from "./types";
import { INSUFFICIENT_HR_DATA } from "./types";
import { dayDiff, hmToMinutes, median, normalizeHm, qatarHm24, qatarYmd, shiftSpanMinutes } from "./time";

export { INSUFFICIENT_HR_DATA };

const MISSING_DAYS = 3;
const OT_MIN_DAYS = 4;
const OT_MINUTES = 90;
const OT_ABOVE_MEDIAN = 120;
const SHIFT_GAP_MINUTES = 180;
const MAX_SHIFT_MINUTES = 18 * 60;

const LEAVE_STATUS = new Set(["annual_leave", "sick_leave", "unpaid_leave"]);

export type AssistDay = {
  staffId: string | null;
  staffName: string;
  locationId: string;
  locationName: string;
  workDate: string;
  status: string;
  missedPunch: boolean;
  punchCount: number;
  overtimeMinutes: number;
  actualIn: string | null;
  actualOut: string | null;
  scheduledIn: string | null;
  scheduledOut: string | null;
};

export type AssistPunch = {
  staffId: string | null;
  staffName: string;
  locationId: string;
  punchAt: string;
  probableDuplicate: boolean;
  attendanceDate: string | null;
};

export type AssistRosterRow = {
  staffId: string;
  staffName: string;
  locationId: string;
  locationName: string;
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
};

export type AttendanceReviewInput = {
  periodFrom: string;
  periodTo: string;
  days: readonly AssistDay[];
  punches: readonly AssistPunch[];
  roster: readonly AssistRosterRow[];
};

function person(name: string): string {
  return name.trim();
}

function dayKey(staffId: string | null, workDate: string, locationId: string): string {
  return `${staffId ?? `unmapped:${locationId}`}|${workDate}`;
}

function baseValues(periodFrom: string, periodTo: string, extra: Record<string, string | number>): Record<string, string | number> {
  return { periodFrom, periodTo, ...extra };
}

function attendanceItem(
  id: string,
  titleKey: string,
  whyKey: string,
  evidenceKey: string,
  values: Record<string, string | number>,
): AssistItem {
  return {
    id,
    titleKey,
    whyKey,
    evidenceKey,
    actionKey: "hrAssist.attendance.action",
    values,
    href: "/people/attendance/corrections",
  };
}

function minutesOnTimeline(start: number, end: number, point: number, asOut: boolean): { start: number; end: number; point: number } {
  let endMin = end;
  if (endMin <= start) endMin += 1440;
  let pointMin = point;
  if (asOut && pointMin < start) pointMin += 1440;
  return { start, end: endMin, point: pointMin };
}

function scheduledWindow(day: AssistDay, roster: AssistRosterRow | undefined): { start: string; end: string } | null {
  const inHm = qatarHm24(day.scheduledIn);
  const outHm = qatarHm24(day.scheduledOut);
  if (inHm && outHm) return { start: inHm, end: outHm };
  const start = normalizeHm(roster?.shiftStart);
  const end = normalizeHm(roster?.shiftEnd);
  if (start && end) return { start, end };
  return null;
}

export function buildAttendanceReview(input: AttendanceReviewInput): AssistResult {
  const periodFrom = input.periodFrom.slice(0, 10);
  const periodTo = input.periodTo.slice(0, 10);
  if (!periodFrom || !periodTo || periodTo < periodFrom) {
    return { status: "insufficient", items: [] };
  }
  if (input.days.length === 0 && input.punches.length === 0 && input.roster.length === 0) {
    return { status: "insufficient", items: [] };
  }

  const items: AssistItem[] = [];
  const rosterByPersonDay = new Map<string, AssistRosterRow>();
  for (const row of input.roster) {
    rosterByPersonDay.set(`${row.staffId}|${row.workDate.slice(0, 10)}`, row);
  }

  const dupes = new Map<string, AssistPunch[]>();
  for (const punch of input.punches) {
    if (!punch.probableDuplicate) continue;
    const workDate = (punch.attendanceDate ?? qatarYmd(punch.punchAt) ?? "").slice(0, 10);
    if (!workDate) continue;
    const key = dayKey(punch.staffId, workDate, punch.locationId);
    const list = dupes.get(key) ?? [];
    list.push(punch);
    dupes.set(key, list);
  }
  for (const [key, punches] of dupes) {
    const first = punches[0];
    const workDate = (first.attendanceDate ?? qatarYmd(first.punchAt) ?? "").slice(0, 10);
    if (!workDate || workDate < periodFrom || workDate > periodTo) continue;
    const times = punches
      .map((p) => qatarHm24(p.punchAt))
      .filter((t): t is string => Boolean(t))
      .slice(0, 6)
      .join(", ");
    items.push(
      attendanceItem(
        `duplicate:${key}`,
        "hrAssist.attendance.duplicate_punch.title",
        "hrAssist.attendance.duplicate_punch.why",
        "hrAssist.attendance.duplicate_punch.evidence",
        baseValues(periodFrom, periodTo, {
          staffName: person(first.staffName),
          workDate,
          count: punches.length,
          times: times || "—",
        }),
      ),
    );
  }

  const missingByStaff = new Map<string, { name: string; dates: string[] }>();
  const otByStaff = new Map<string, AssistDay[]>();

  for (const day of input.days) {
    const workDate = day.workDate.slice(0, 10);
    const name = person(day.staffName);
    const roster = day.staffId ? rosterByPersonDay.get(`${day.staffId}|${workDate}`) : undefined;

    const inOk = !day.actualIn || Boolean(qatarYmd(day.actualIn));
    const outOk = !day.actualOut || Boolean(qatarYmd(day.actualOut));
    if ((day.actualIn && !inOk) || (day.actualOut && !outOk)) {
      items.push(
        attendanceItem(
          `impossible:${day.staffId ?? day.locationId}:${workDate}:bad`,
          "hrAssist.attendance.impossible_timestamp.title",
          "hrAssist.attendance.impossible_timestamp.why",
          "hrAssist.attendance.impossible_timestamp.evidence",
          baseValues(periodFrom, periodTo, {
            staffName: name,
            workDate,
            detailCode: "unparseable",
            actualIn: day.actualIn || "—",
            actualOut: day.actualOut || "—",
          }),
        ),
      );
    } else if (day.actualIn && day.actualOut) {
      const span = shiftSpanMinutes(day.actualIn, day.actualOut);
      if (span != null && span > MAX_SHIFT_MINUTES) {
        items.push(
          attendanceItem(
            `impossible:${day.staffId ?? day.locationId}:${workDate}:span`,
            "hrAssist.attendance.impossible_timestamp.title",
            "hrAssist.attendance.impossible_timestamp.why",
            "hrAssist.attendance.impossible_timestamp.evidence",
            baseValues(periodFrom, periodTo, {
              staffName: name,
              workDate,
              detailCode: "span",
              hours: Math.round((span / 60) * 10) / 10,
              actualIn: day.actualIn,
              actualOut: day.actualOut,
            }),
          ),
        );
      }
    }

    const inDay = qatarYmd(day.actualIn);
    const outDay = qatarYmd(day.actualOut);
    const far = (inDay && Math.abs(dayDiff(workDate, inDay)) > 1) || (outDay && Math.abs(dayDiff(workDate, outDay)) > 1);
    if (far) {
      items.push(
        attendanceItem(
          `impossible:${day.staffId ?? day.locationId}:${workDate}:far`,
          "hrAssist.attendance.impossible_timestamp.title",
          "hrAssist.attendance.impossible_timestamp.why",
          "hrAssist.attendance.impossible_timestamp.evidence",
          baseValues(periodFrom, periodTo, {
            staffName: name,
            workDate,
            detailCode: "far_from_day",
            actualIn: day.actualIn || "—",
            actualOut: day.actualOut || "—",
          }),
        ),
      );
    }

    if (day.staffId && day.missedPunch) {
      const bucket = missingByStaff.get(day.staffId) ?? { name, dates: [] };
      bucket.dates.push(workDate);
      missingByStaff.set(day.staffId, bucket);
    }

    if (day.staffId && day.punchCount > 0 && !LEAVE_STATUS.has(day.status)) {
      const list = otByStaff.get(day.staffId) ?? [];
      list.push(day);
      otByStaff.set(day.staffId, list);
    }

    if (roster && !roster.isWeekOff && roster.locationId !== day.locationId) {
      items.push(
        attendanceItem(
          `site:${day.staffId}:${workDate}`,
          "hrAssist.attendance.outside_assigned_site.title",
          "hrAssist.attendance.outside_assigned_site.why",
          "hrAssist.attendance.outside_assigned_site.evidence",
          baseValues(periodFrom, periodTo, {
            staffName: name || person(roster.staffName),
            workDate,
            rosterSite: roster.locationName,
            attendanceSite: day.locationName,
          }),
        ),
      );
    }

    const window = scheduledWindow(day, roster);
    if (window && (day.actualIn || day.actualOut)) {
      const start = hmToMinutes(window.start);
      const end = hmToMinutes(window.end);
      const actualIn = hmToMinutes(qatarHm24(day.actualIn));
      const actualOut = hmToMinutes(qatarHm24(day.actualOut));
      if (start != null && end != null && (actualIn != null || actualOut != null)) {
        const inPoint = actualIn == null ? null : minutesOnTimeline(start, end, actualIn, false);
        const outPoint = actualOut == null ? null : minutesOnTimeline(start, end, actualOut, true);
        const early = inPoint ? inPoint.start - inPoint.point : 0;
        const late = outPoint ? outPoint.point - outPoint.end : 0;
        const gap = Math.max(early, late, 0);
        if (early > SHIFT_GAP_MINUTES || late > SHIFT_GAP_MINUTES) {
          items.push(
            attendanceItem(
              `shift:${day.staffId ?? day.locationId}:${workDate}`,
              "hrAssist.attendance.outside_assigned_shift.title",
              "hrAssist.attendance.outside_assigned_shift.why",
              "hrAssist.attendance.outside_assigned_shift.evidence",
              baseValues(periodFrom, periodTo, {
                staffName: name,
                workDate,
                start: window.start,
                end: window.end,
                actualInHm: qatarHm24(day.actualIn) ?? "",
                actualOutHm: qatarHm24(day.actualOut) ?? "",
                gapMinutes: gap,
              }),
            ),
          );
        }
      }
    }
  }

  for (const [staffId, bucket] of missingByStaff) {
    const unique = [...new Set(bucket.dates)].sort();
    if (unique.length < MISSING_DAYS) continue;
    items.push(
      attendanceItem(
        `missing:${staffId}`,
        "hrAssist.attendance.repeated_missing_punch.title",
        "hrAssist.attendance.repeated_missing_punch.why",
        "hrAssist.attendance.repeated_missing_punch.evidence",
        baseValues(periodFrom, periodTo, {
          staffName: bucket.name,
          count: unique.length,
          dates: unique.slice(0, 6).join(", "),
        }),
      ),
    );
  }

  for (const [staffId, days] of otByStaff) {
    if (days.length < OT_MIN_DAYS) continue;
    const med = median(days.map((d) => d.overtimeMinutes));
    for (const day of days) {
      if (day.overtimeMinutes < OT_MINUTES) continue;
      if (day.overtimeMinutes < med + OT_ABOVE_MEDIAN) continue;
      const workDate = day.workDate.slice(0, 10);
      items.push(
        attendanceItem(
          `ot:${staffId}:${workDate}`,
          "hrAssist.attendance.unusual_overtime.title",
          "hrAssist.attendance.unusual_overtime.why",
          "hrAssist.attendance.unusual_overtime.evidence",
          baseValues(periodFrom, periodTo, {
            staffName: person(day.staffName),
            workDate,
            overtimeMinutes: day.overtimeMinutes,
            medianMinutes: med,
            comparedDays: days.length,
          }),
        ),
      );
    }
  }

  if (input.days.length > 0) {
    const dayIndex = new Map<string, AssistDay>();
    for (const day of input.days) {
      if (!day.staffId) continue;
      dayIndex.set(`${day.staffId}|${day.workDate.slice(0, 10)}`, day);
    }
    for (const row of input.roster) {
      const workDate = row.workDate.slice(0, 10);
      const day = dayIndex.get(`${row.staffId}|${workDate}`);
      if (!day) continue;
      if (row.isWeekOff && day.punchCount > 0) {
        items.push(mismatchItem(periodFrom, periodTo, row, workDate, "week_off", day.status, day.punchCount));
        continue;
      }
      if (!row.isWeekOff && LEAVE_STATUS.has(day.status)) {
        items.push(mismatchItem(periodFrom, periodTo, row, workDate, "leave", day.status, day.punchCount));
        continue;
      }
      if (!row.isWeekOff && (day.status === "absent" || day.punchCount === 0) && !LEAVE_STATUS.has(day.status) && day.status !== "weekly_off" && day.status !== "public_holiday") {
        items.push(mismatchItem(periodFrom, periodTo, row, workDate, "absent", day.status || "absent", day.punchCount));
      }
    }
  }

  const rank: Record<string, number> = {
    "hrAssist.attendance.impossible_timestamp.title": 0,
    "hrAssist.attendance.duplicate_punch.title": 1,
    "hrAssist.attendance.roster_mismatch.title": 2,
    "hrAssist.attendance.outside_assigned_site.title": 3,
    "hrAssist.attendance.outside_assigned_shift.title": 4,
    "hrAssist.attendance.repeated_missing_punch.title": 5,
    "hrAssist.attendance.unusual_overtime.title": 6,
  };
  const PER_KIND = 3;
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  unique.sort((a, b) => (rank[a.titleKey] ?? 9) - (rank[b.titleKey] ?? 9) || String(a.values.workDate ?? "").localeCompare(String(b.values.workDate ?? "")));
  const counts = new Map<string, number>();
  const capped = unique.filter((item) => {
    const count = counts.get(item.titleKey) ?? 0;
    if (count >= PER_KIND) return false;
    counts.set(item.titleKey, count + 1);
    return true;
  });
  if (capped.length === 0) {
    if (input.days.length === 0 && input.punches.length === 0) return { status: "insufficient", items: [] };
    return { status: "empty", items: [] };
  }
  return { status: "ok", items: capped };
}

function mismatchItem(
  periodFrom: string,
  periodTo: string,
  row: AssistRosterRow,
  workDate: string,
  code: "absent" | "week_off" | "leave",
  status: string,
  punchCount: number,
): AssistItem {
  return attendanceItem(
    `mismatch:${code}:${row.staffId}:${workDate}`,
    "hrAssist.attendance.roster_mismatch.title",
    `hrAssist.attendance.roster_mismatch.${code}.why`,
    "hrAssist.attendance.roster_mismatch.evidence",
    baseValues(periodFrom, periodTo, {
      staffName: person(row.staffName),
      workDate,
      site: row.locationName,
      status,
      punchCount,
    }),
  );
}

export function describeAttendanceItem(item: AssistItem): { title: string; why: string; evidence: string; action: string } {
  return {
    title: englishAssistText(item.titleKey, item.values),
    why: englishAssistText(item.whyKey, item.values),
    evidence: englishAssistText(item.evidenceKey, item.values),
    action: englishAssistText(item.actionKey, item.values),
  };
}
