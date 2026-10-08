import { englishAssistText } from "./copy";
import type { AssistItem, AssistResult } from "./types";
import { median, normalizeHm, weekdayIndex } from "./time";

export type RosterAssistAssignment = {
  staffId: string;
  staffName: string;
  locationId: string;
  locationName: string;
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
};

export type RosterAssistLeave = {
  staffId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
};

export type RosterAssistOpening = {
  locationId: string | null;
  name: string;
  start: string;
  end: string;
};

export type RosterAssistInput = {
  periodFrom: string;
  periodTo: string;
  assignments: readonly RosterAssistAssignment[];
  leaves: readonly RosterAssistLeave[];
  openings: readonly RosterAssistOpening[];
};

const ACTIVE_LEAVE = new Set(["pending", "approved"]);
const MAX_ITEMS = 16;

function leaveCovers(leaves: readonly RosterAssistLeave[], staffId: string, workDate: string): RosterAssistLeave | undefined {
  return leaves.find(
    (leave) =>
      leave.staffId === staffId &&
      ACTIVE_LEAVE.has(leave.status) &&
      leave.dateFrom.slice(0, 10) <= workDate &&
      leave.dateTo.slice(0, 10) >= workDate,
  );
}

function windowName(openings: readonly RosterAssistOpening[], locationId: string, start: string, end: string): string {
  const matches = openings.filter((opening) => normalizeHm(opening.start) === start && normalizeHm(opening.end) === end);
  const specific = matches.find((opening) => opening.locationId === locationId);
  const shared = matches.find((opening) => opening.locationId == null);
  return (specific ?? shared)?.name?.trim() ?? "";
}

export function buildRosterRecommendations(input: RosterAssistInput): AssistResult {
  const periodFrom = input.periodFrom.slice(0, 10);
  const periodTo = input.periodTo.slice(0, 10);
  if (!periodFrom || !periodTo || periodTo < periodFrom) return { status: "insufficient", items: [] };
  if (input.assignments.length === 0 && input.leaves.length === 0 && input.openings.length === 0) {
    return { status: "insufficient", items: [] };
  }

  const items: AssistItem[] = [];
  const operating = new Map<string, Map<string, string>>();
  type WindowBucket = {
    locationId: string;
    locationName: string;
    weekday: number;
    start: string;
    end: string;
    dates: Map<string, { rostered: Set<string>; effective: Set<string> }>;
  };
  const windows = new Map<string, WindowBucket>();

  for (const row of input.assignments) {
    if (row.isWeekOff) continue;
    const workDate = row.workDate.slice(0, 10);
    const sites = operating.get(row.locationId) ?? new Map<string, string>();
    sites.set(workDate, row.locationName);
    operating.set(row.locationId, sites);

    const start = normalizeHm(row.shiftStart);
    const end = normalizeHm(row.shiftEnd);
    if (!start || !end) continue;
    const weekday = weekdayIndex(workDate);
    const key = `${row.locationId}|${weekday}|${start}|${end}`;
    let bucket = windows.get(key);
    if (!bucket) {
      bucket = { locationId: row.locationId, locationName: row.locationName, weekday, start, end, dates: new Map() };
      windows.set(key, bucket);
    }
    let counts = bucket.dates.get(workDate);
    if (!counts) {
      counts = { rostered: new Set(), effective: new Set() };
      bucket.dates.set(workDate, counts);
    }
    counts.rostered.add(row.staffId);
    if (!leaveCovers(input.leaves, row.staffId, workDate)) counts.effective.add(row.staffId);
  }

  const cover: Array<AssistItem & { gap: number }> = [];
  for (const bucket of windows.values()) {
    const siteDates = operating.get(bucket.locationId);
    if (!siteDates) continue;
    const comparable = [...siteDates.keys()]
      .filter((date) => weekdayIndex(date) === bucket.weekday)
      .sort();
    if (comparable.length < 2) continue;
    const counts = comparable.map((date) => bucket.dates.get(date)?.effective.size ?? 0);
    let worst: { date: string; gap: number; current: number; median: number; rostered: number; onLeave: number } | null = null;
    for (let index = 0; index < comparable.length; index += 1) {
      const date = comparable[index];
      const others = counts.filter((_, i) => i !== index);
      if (!others.length) continue;
      const med = median(others);
      const current = counts[index];
      const gap = med - current;
      if (gap < 2) continue;
      const slot = bucket.dates.get(date);
      const rostered = slot?.rostered.size ?? 0;
      const onLeave = Math.max(0, rostered - current);
      if (!worst || gap > worst.gap) worst = { date, gap, current, median: med, rostered, onLeave };
    }
    if (!worst) continue;
    const name = windowName(input.openings, bucket.locationId, bucket.start, bucket.end);
    const withLeave = worst.onLeave > 0;
    cover.push({
      gap: worst.gap,
      id: `cover:${bucket.locationId}:${worst.date}:${bucket.start}:${bucket.end}`,
      titleKey: withLeave ? "hrAssist.roster.short_cover_with_leave.title" : "hrAssist.roster.short_cover.title",
      whyKey: withLeave ? "hrAssist.roster.short_cover_with_leave.why" : "hrAssist.roster.short_cover.why",
      evidenceKey: "hrAssist.roster.evidence",
      actionKey: "hrAssist.roster.action",
      values: {
        windowPrefix: name ? `${name}: ` : "",
        weekdayIndex: bucket.weekday,
        start: bucket.start,
        end: bucket.end,
        site: bucket.locationName,
        date: worst.date,
        current: worst.current,
        median: worst.median,
        gap: worst.gap,
        rostered: worst.rostered,
        onLeave: worst.onLeave,
        periodFrom,
        periodTo,
      },
    });
  }
  cover.sort((a, b) => b.gap - a.gap || a.values.date.toString().localeCompare(String(b.values.date)));
  for (const item of cover.slice(0, 8)) {
    const { gap: _gap, ...rest } = item;
    items.push(rest);
  }

  let leaveHits = 0;
  for (const row of input.assignments) {
    if (row.isWeekOff || leaveHits >= 8) continue;
    const workDate = row.workDate.slice(0, 10);
    const leave = leaveCovers(input.leaves, row.staffId, workDate);
    if (!leave) continue;
    const start = normalizeHm(row.shiftStart);
    const end = normalizeHm(row.shiftEnd);
    items.push({
      id: `leave-roster:${row.staffId}:${workDate}`,
      titleKey: "hrAssist.roster.leave_still_rostered.title",
      whyKey: "hrAssist.roster.leave_still_rostered.why",
      evidenceKey: "hrAssist.roster.leave_still_rostered.evidence",
      actionKey: "hrAssist.roster.action",
      values: {
        staffName: row.staffName.trim(),
        site: row.locationName,
        workDate,
        start: start ?? "",
        end: end ?? "",
        leaveStatus: leave.status,
        periodFrom,
        periodTo,
      },
    });
    leaveHits += 1;
  }

  if (items.length === 0) {
    const timed = input.assignments.some((row) => !row.isWeekOff && normalizeHm(row.shiftStart) && normalizeHm(row.shiftEnd));
    if (!timed && input.leaves.length === 0) return { status: "insufficient", items: [] };
    return { status: "empty", items: [] };
  }
  return { status: "ok", items: items.slice(0, MAX_ITEMS) };
}

export function describeRosterItem(item: AssistItem): { title: string; why: string; evidence: string; action: string } {
  return {
    title: englishAssistText(item.titleKey, item.values),
    why: englishAssistText(item.whyKey, item.values),
    evidence: englishAssistText(item.evidenceKey, item.values),
    action: englishAssistText(item.actionKey, item.values),
  };
}
