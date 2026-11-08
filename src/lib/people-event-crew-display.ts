/**
 * Aggregations for People → Event Crew page.
 * Uses real crew + attendance rows — no invented metrics.
 */

import {
  classifyAttendanceBucket,
  previousEqualRange,
} from "@/lib/people-event-attendance-overview";
import type {
  PeopleEventAttendanceRow,
  PeopleEventCrewRow,
} from "@/lib/people-event-workforce.functions";

export type CrewKpis = {
  totalAssignments: number;
  activeAssignments: number;
  onDutyToday: number;
  lateToday: number;
  absentToday: number;
  totalDeltaPct: number | null;
  activeDeltaPct: number | null;
  onDutyPct: number;
  latePct: number;
  absentPct: number;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Inclusive overlap of assignment date range with [from, to]. */
export function assignmentOverlapsRange(
  row: Pick<PeopleEventCrewRow, "dateFrom" | "dateTo">,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return true;
  const start = from || to;
  const end = to || from;
  if (row.dateTo && row.dateTo < start) return false;
  if (row.dateFrom && row.dateFrom > end) return false;
  return true;
}

export function formatCrewDate(ymd: string, locale = "en"): string {
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

export function formatCrewDateRange(from: string, to: string, locale = "en"): string {
  if (!from && !to) return "—";
  if (!from) return formatCrewDate(to, locale);
  if (!to) return formatCrewDate(from, locale);
  return `${formatCrewDate(from, locale)} – ${formatCrewDate(to, locale)}`;
}

/** Default table window: current month through next month end. */
export function defaultCrewRange(today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 2, 0));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { from: ymd(from), to: ymd(to) };
}

export function personInitials(name: string | null | undefined, code: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const c = (code ?? "").trim();
  if (c) return c.slice(0, 2).toUpperCase();
  return "?";
}

export function buildCrewKpis(input: {
  crewRows: PeopleEventCrewRow[];
  attendanceToday: PeopleEventAttendanceRow[];
  rangeFrom: string;
  rangeTo: string;
  todayYmd: string;
}): CrewKpis {
  const inRange = input.crewRows.filter((r) =>
    assignmentOverlapsRange(r, input.rangeFrom, input.rangeTo),
  );
  const totalAssignments = inRange.length;
  const activeAssignments = inRange.filter((r) => r.status === "active").length;

  const prev = previousEqualRange(input.rangeFrom, input.rangeTo);
  const prevRows = input.crewRows.filter((r) =>
    assignmentOverlapsRange(r, prev.from, prev.to),
  );
  const prevActive = prevRows.filter((r) => r.status === "active").length;

  let onDutyToday = 0;
  let lateToday = 0;
  let absentToday = 0;
  for (const row of input.attendanceToday) {
    if (row.workDate !== input.todayYmd) continue;
    const bucket = classifyAttendanceBucket(row);
    if (bucket === "present") onDutyToday += 1;
    else if (bucket === "late") lateToday += 1;
    else absentToday += 1;
  }
  const todayTotal = onDutyToday + lateToday + absentToday;

  return {
    totalAssignments,
    activeAssignments,
    onDutyToday,
    lateToday,
    absentToday,
    totalDeltaPct: deltaPct(totalAssignments, prevRows.length),
    activeDeltaPct: deltaPct(activeAssignments, prevActive),
    onDutyPct: pct(onDutyToday, todayTotal || activeAssignments),
    latePct: pct(lateToday, todayTotal || activeAssignments),
    absentPct: pct(absentToday, todayTotal || activeAssignments),
  };
}

export function typeBadgeTone(
  assignmentType: string,
): "loaned" | "hire" | "joker" | "neutral" {
  const v = assignmentType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "loaned") return "loaned";
  if (v === "event_hire" || v === "eventhire") return "hire";
  if (v === "joker" || v === "labour") return "joker";
  return "neutral";
}
