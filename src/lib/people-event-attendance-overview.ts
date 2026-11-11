/**
 * Aggregations for People → Event Attendance overview dashboard.
 * Uses real event / crew / attendance rows — no invented metrics.
 */

import {
  getAttendanceStatusDisplay,
  type AttendanceSummaryRow,
} from "@/lib/attendance-display";
import { toEventAttendanceSummaryRow } from "@/lib/people-event-attendance-display";
import type {
  PeopleEventAttendanceRow,
  PeopleEventCrewRow,
  PeopleEventOption,
} from "@/lib/people-event-workforce.functions";

export type AttendanceBucket = "present" | "late" | "absent";

export type EventAttendanceSummary = {
  eventId: string;
  eventName: string;
  dateLabel: string;
  location: string;
  assigned: number;
  present: number;
  late: number;
  absent: number;
  attendancePct: number;
};

export type EventBarPoint = {
  key: string;
  label: string;
  assigned: number;
  present: number;
  pct: number;
};

export type DayTrendPoint = {
  date: string;
  label: string;
  present: number;
  assigned: number;
  pct: number;
};

export type OverviewKpis = {
  totalEvents: number;
  assignedCrew: number;
  present: number;
  late: number;
  absent: number;
  presentPct: number;
  latePct: number;
  absentPct: number;
  eventsDeltaPct: number | null;
  assignedDeltaPct: number | null;
  avgAttendancePct: number;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Classify a day-row into Present / Late / Absent for the mockup status model. */
export function classifyAttendanceBucket(row: PeopleEventAttendanceRow): AttendanceBucket {
  const summary = toEventAttendanceSummaryRow(row);
  const display = getAttendanceStatusDisplay(summary as AttendanceSummaryRow);
  const label = display.label;

  if (label === "Absent" || label === "Missing Punch" || label === "Not started") {
    return "absent";
  }
  if (label === "Late" || label === "Early Leave") {
    return "late";
  }
  if (
    label === "Present" ||
    label === "Working today" ||
    label === "Complete" ||
    label === "Undertime" ||
    label === "Incomplete" ||
    label === "Missed punch"
  ) {
    // Incomplete / missed punch still counted as present-ish for ops coverage;
    // late minutes push to Late.
    if (row.lateMinutes > 0) return "late";
    return "present";
  }
  if (row.lateMinutes > 0) return "late";
  if (row.actualIn) return "present";
  return "absent";
}

function formatShortDate(ymd: string, locale = "en"): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return ymd;
  }
}

export function formatRangeLabel(from: string, to: string, locale = "en"): string {
  return `${formatShortDate(from, locale)} – ${formatShortDate(to, locale)}`;
}

/** Default window: previous 7 complete days ending yesterday (matches mockup span). */
export function defaultOverviewRange(today = new Date()): { from: string; to: string } {
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { from: ymd(start), to: ymd(end) };
}

function isYmd(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function inclusiveDayCount(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function addDaysYmdUtc(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Date filter for a selected event so attendance rows are visible after seed.
 * Uses event start/end; when longer than `maxInclusiveDays`, prefers a window
 * that includes today (if the event is ongoing), otherwise the first N days.
 * Falls back when the event has no usable dates.
 */
export function rangeForSelectedEvent(
  event: { dateFrom: string | null; dateTo: string | null } | null | undefined,
  fallback: { from: string; to: string },
  maxInclusiveDays = 14,
  today = new Date(),
): { from: string; to: string } {
  if (!isYmd(event?.dateFrom)) return fallback;
  const from = event.dateFrom;
  let to = isYmd(event.dateTo) ? event.dateTo : from;
  if (to < from) to = from;

  const maxDays = Math.max(1, maxInclusiveDays);
  if (inclusiveDayCount(from, to) <= maxDays) return { from, to };

  const todayYmd = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  )
    .toISOString()
    .slice(0, 10);

  if (todayYmd >= from && todayYmd <= to) {
    const windowEnd = todayYmd;
    let windowFrom = addDaysYmdUtc(windowEnd, -(maxDays - 1));
    if (windowFrom < from) windowFrom = from;
    return { from: windowFrom, to: windowEnd };
  }

  const cappedTo = addDaysYmdUtc(from, maxDays - 1);
  return { from, to: cappedTo > to ? to : cappedTo };
}

/**
 * Date window covering all dated events (All events Overview).
 * Uses the union of event start/end; when longer than `maxInclusiveDays`,
 * keeps a window ending at the latest event end so recent ops stay visible.
 */
export function rangeCoveringEvents(
  events: Array<{ dateFrom: string | null; dateTo: string | null }>,
  fallback: { from: string; to: string },
  maxInclusiveDays = 31,
): { from: string; to: string } {
  let min: string | null = null;
  let max: string | null = null;
  for (const ev of events) {
    if (!isYmd(ev.dateFrom)) continue;
    const from = ev.dateFrom;
    const to = isYmd(ev.dateTo) ? ev.dateTo : from;
    if (!min || from < min) min = from;
    if (!max || to > max) max = to > from ? to : from;
  }
  if (!min || !max) return fallback;
  if (max < min) max = min;

  const maxDays = Math.max(1, maxInclusiveDays);
  if (inclusiveDayCount(min, max) <= maxDays) return { from: min, to: max };

  let windowFrom = addDaysYmdUtc(max, -(maxDays - 1));
  if (windowFrom < min) windowFrom = min;
  return { from: windowFrom, to: max };
}

export function previousEqualRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - days);
  return {
    from: prevStart.toISOString().slice(0, 10),
    to: prevEnd.toISOString().slice(0, 10),
  };
}

function countBuckets(rows: PeopleEventAttendanceRow[]) {
  let present = 0;
  let late = 0;
  let absent = 0;
  for (const row of rows) {
    const bucket = classifyAttendanceBucket(row);
    if (bucket === "present") present += 1;
    else if (bucket === "late") late += 1;
    else absent += 1;
  }
  return { present, late, absent, assigned: present + late + absent };
}

export function eventsInRange(
  events: PeopleEventOption[],
  from: string,
  to: string,
): PeopleEventOption[] {
  return events.filter((ev) => {
    const start = ev.dateFrom ?? "";
    const end = ev.dateTo ?? start;
    if (!start && !end) return true;
    if (end && end < from) return false;
    if (start && start > to) return false;
    return true;
  });
}

export function buildOverviewKpis(input: {
  events: PeopleEventOption[];
  attendanceRows: PeopleEventAttendanceRow[];
  previousAttendanceRows: PeopleEventAttendanceRow[];
  previousEvents: PeopleEventOption[];
  dateFrom: string;
  dateTo: string;
}): OverviewKpis {
  const scopedEvents = eventsInRange(input.events, input.dateFrom, input.dateTo);
  const current = countBuckets(input.attendanceRows);
  const previous = countBuckets(input.previousAttendanceRows);
  const prevRange = previousEqualRange(input.dateFrom, input.dateTo);
  const prevEventCount = eventsInRange(
    input.previousEvents.length ? input.previousEvents : input.events,
    prevRange.from,
    prevRange.to,
  ).length;
  const totalEvents = scopedEvents.length;

  return {
    totalEvents,
    assignedCrew: current.assigned,
    present: current.present,
    late: current.late,
    absent: current.absent,
    presentPct: pct(current.present, current.assigned),
    latePct: pct(current.late, current.assigned),
    absentPct: pct(current.absent, current.assigned),
    eventsDeltaPct: deltaPct(totalEvents, prevEventCount),
    assignedDeltaPct: deltaPct(current.assigned, previous.assigned),
    avgAttendancePct: pct(current.present + current.late, current.assigned),
  };
}

export function buildAttendanceByEvent(
  rows: PeopleEventAttendanceRow[],
  limit = 5,
): EventBarPoint[] {
  const map = new Map<
    string,
    { label: string; assigned: number; present: number }
  >();
  for (const row of rows) {
    const key = row.eventId;
    const entry = map.get(key) ?? {
      label: row.eventName?.trim() || key.slice(0, 8),
      assigned: 0,
      present: 0,
    };
    entry.assigned += 1;
    const bucket = classifyAttendanceBucket(row);
    if (bucket === "present" || bucket === "late") entry.present += 1;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      assigned: v.assigned,
      present: v.present,
      pct: pct(v.present, v.assigned),
    }))
    .sort((a, b) => b.assigned - a.assigned)
    .slice(0, limit);
}

export function buildAttendanceTrend(
  rows: PeopleEventAttendanceRow[],
  dateFrom: string,
  dateTo: string,
  locale = "en",
): DayTrendPoint[] {
  const byDay = new Map<string, { present: number; assigned: number }>();
  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    byDay.set(d.toISOString().slice(0, 10), { present: 0, assigned: 0 });
  }
  for (const row of rows) {
    const day = byDay.get(row.workDate);
    if (!day) continue;
    day.assigned += 1;
    const bucket = classifyAttendanceBucket(row);
    if (bucket === "present" || bucket === "late") day.present += 1;
  }
  return [...byDay.entries()].map(([date, v]) => ({
    date,
    label: formatShortDate(date, locale).replace(/,?\s*\d{4}$/, ""),
    present: v.present,
    assigned: v.assigned,
    pct: pct(v.present, v.assigned),
  }));
}

export function buildEventWiseSummary(
  rows: PeopleEventAttendanceRow[],
  events: PeopleEventOption[],
  locale = "en",
  limit = 8,
): EventAttendanceSummary[] {
  const eventMeta = new Map(events.map((e) => [e.id, e]));
  const map = new Map<
    string,
    {
      eventName: string;
      location: string;
      dateYmd: string;
      present: number;
      late: number;
      absent: number;
    }
  >();

  for (const row of rows) {
    const meta = eventMeta.get(row.eventId);
    const entry = map.get(row.eventId) ?? {
      eventName: row.eventName?.trim() || meta?.name || row.eventId.slice(0, 8),
      location: row.locationName?.trim() || meta?.locationName?.trim() || "—",
      dateYmd: meta?.dateFrom || row.workDate,
      present: 0,
      late: 0,
      absent: 0,
    };
    if (row.workDate && (!entry.dateYmd || row.workDate > entry.dateYmd)) {
      // Keep earliest event start if known; otherwise latest work date as fallback.
      if (!meta?.dateFrom) entry.dateYmd = row.workDate;
    }
    if (meta?.dateFrom) entry.dateYmd = meta.dateFrom;
    if (!entry.location || entry.location === "—") {
      entry.location = row.locationName?.trim() || meta?.locationName?.trim() || "—";
    }
    const bucket = classifyAttendanceBucket(row);
    if (bucket === "present") entry.present += 1;
    else if (bucket === "late") entry.late += 1;
    else entry.absent += 1;
    map.set(row.eventId, entry);
  }

  // Include events in the Overview scope even when they have no attendance yet.
  for (const ev of events) {
    if (map.has(ev.id)) continue;
    map.set(ev.id, {
      eventName: ev.name?.trim() || ev.id.slice(0, 8),
      location: ev.locationName?.trim() || "—",
      dateYmd: ev.dateFrom || "",
      present: 0,
      late: 0,
      absent: 0,
    });
  }

  return [...map.entries()]
    .map(([eventId, v]) => {
      const assigned = v.present + v.late + v.absent;
      return {
        eventId,
        eventName: v.eventName,
        dateLabel: v.dateYmd ? formatShortDate(v.dateYmd, locale) : "—",
        location: v.location,
        assigned,
        present: v.present,
        late: v.late,
        absent: v.absent,
        attendancePct: pct(v.present + v.late, assigned),
      };
    })
    .sort((a, b) => b.assigned - a.assigned || a.eventName.localeCompare(b.eventName))
    .slice(0, limit);
}

export function activeCrewHeadcount(
  crewRows: PeopleEventCrewRow[],
  dateFrom: string,
  dateTo: string,
  /** When true, count all active crew for the event (ignore From–To overlap). */
  ignoreDateWindow = false,
): number {
  const ids = new Set<string>();
  for (const row of crewRows) {
    if (row.status !== "active") continue;
    if (!ignoreDateWindow) {
      if (row.dateTo && row.dateTo < dateFrom) continue;
      if (row.dateFrom && row.dateFrom > dateTo) continue;
    }
    ids.add(row.staffId);
  }
  return ids.size;
}

/**
 * Suggest a From–To covering real attendance rows for a selected event
 * when the Overview window has none (e.g. seed used today±2 while event is later).
 */
export function rangeCoveringAttendanceRows(
  rows: Array<{ workDate: string }>,
  fallback: { from: string; to: string },
  maxInclusiveDays = 14,
): { from: string; to: string } {
  let min: string | null = null;
  let max: string | null = null;
  for (const row of rows) {
    const d = String(row.workDate ?? "").slice(0, 10);
    if (!isYmd(d)) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min || !max) return fallback;
  if (max < min) max = min;
  const maxDays = Math.max(1, maxInclusiveDays);
  if (inclusiveDayCount(min, max) <= maxDays) return { from: min, to: max };
  const cappedTo = addDaysYmdUtc(min, maxDays - 1);
  return { from: min, to: cappedTo > max ? max : cappedTo };
}
