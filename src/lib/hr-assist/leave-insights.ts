import { englishAssistText } from "./copy";
import type { AssistItem, AssistResult } from "./types";
import { datesBetween } from "./time";

export type LeaveInsightRequest = {
  id: string;
  staffId: string;
  staffName: string;
  locationId: string | null;
  locationName: string | null;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  status: string;
};

export type LeaveRosterDay = {
  locationId: string;
  locationName: string;
  workDate: string;
  onDuty: number;
};

export type LeaveInsightInput = {
  requests: readonly LeaveInsightRequest[];
  rosterDays: readonly LeaveRosterDay[];
};

const ACTIVE = new Set(["pending", "approved"]);
const PATTERN = new Set(["pending", "approved", "rejected"]);
const MAX_ITEMS = 16;

function namesOf(people: Map<string, string>): string {
  const names = [...people.values()].filter(Boolean);
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 4).join(", ")} +${names.length - 4}`;
}

export function buildLeaveInsights(input: LeaveInsightInput): AssistResult {
  const requests = input.requests.filter((row) => {
    const from = row.dateFrom.slice(0, 10);
    const to = row.dateTo.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && to >= from;
  });
  if (input.requests.length === 0) return { status: "empty", items: [] };
  if (requests.length === 0) return { status: "insufficient", items: [] };

  const roster = new Map<string, LeaveRosterDay>();
  for (const day of input.rosterDays) {
    roster.set(`${day.locationId}|${day.workDate.slice(0, 10)}`, day);
  }

  const byDay = new Map<string, { workDate: string; locationId: string | null; site: string; people: Map<string, string> }>();
  for (const request of requests) {
    if (!ACTIVE.has(request.status)) continue;
    for (const workDate of datesBetween(request.dateFrom, request.dateTo, 31)) {
      const key = `${request.locationId ?? "unknown"}|${workDate}`;
      let bucket = byDay.get(key);
      if (!bucket) {
        bucket = {
          workDate,
          locationId: request.locationId,
          site: request.locationName?.trim() || "",
          people: new Map(),
        };
        byDay.set(key, bucket);
      }
      bucket.people.set(request.staffId, request.staffName.trim() || request.staffId);
      if (!bucket.site && request.locationName) bucket.site = request.locationName.trim();
    }
  }

  const items: AssistItem[] = [];
  const dayItems: Array<AssistItem & { weight: number }> = [];
  for (const bucket of byDay.values()) {
    if (bucket.people.size < 2) continue;
    const names = namesOf(bucket.people);
    const rosterDay = bucket.locationId ? roster.get(`${bucket.locationId}|${bucket.workDate}`) : undefined;
    const leaveCount = bucket.people.size;
    const onDuty = rosterDay?.onDuty ?? 0;
    if (rosterDay && onDuty > 0 && onDuty <= leaveCount * 2) {
      dayItems.push({
        weight: leaveCount * 10 + onDuty,
        id: `staffing:${bucket.locationId}:${bucket.workDate}`,
        titleKey: "hrAssist.leave.staffing.title",
        whyKey: "hrAssist.leave.staffing.why",
        evidenceKey: "hrAssist.leave.staffing.evidence",
        actionKey: "hrAssist.leave.action",
        values: {
          workDate: bucket.workDate,
          site: rosterDay.locationName || bucket.site,
          leaveCount,
          onDuty,
          names,
        },
      });
      continue;
    }
    if (!bucket.locationId) {
      dayItems.push({
        weight: leaveCount,
        id: `overlap:unknown:${bucket.workDate}`,
        titleKey: "hrAssist.leave.team_overlap_no_site.title",
        whyKey: "hrAssist.leave.team_overlap_no_site.why",
        evidenceKey: "hrAssist.leave.team_overlap_no_site.evidence",
        actionKey: "hrAssist.leave.action",
        values: { workDate: bucket.workDate, count: leaveCount, names },
      });
      continue;
    }
    dayItems.push({
      weight: leaveCount,
      id: `overlap:${bucket.locationId}:${bucket.workDate}`,
      titleKey: "hrAssist.leave.team_overlap.title",
      whyKey: "hrAssist.leave.team_overlap.why",
      evidenceKey: "hrAssist.leave.team_overlap.evidence",
      actionKey: "hrAssist.leave.action",
      values: {
        workDate: bucket.workDate,
        site: bucket.site,
        count: leaveCount,
        names,
      },
    });
  }
  dayItems.sort((a, b) => b.weight - a.weight || a.values.workDate.toString().localeCompare(String(b.values.workDate)));
  for (const item of dayItems.slice(0, 10)) {
    const { weight: _weight, ...rest } = item;
    items.push(rest);
  }

  const patterns = new Map<string, { staffName: string; leaveType: string; count: number; from: string; to: string }>();
  for (const request of requests) {
    if (!PATTERN.has(request.status)) continue;
    const key = `${request.staffId}|${request.leaveType}`;
    const from = request.dateFrom.slice(0, 10);
    const to = request.dateTo.slice(0, 10);
    const existing = patterns.get(key);
    if (!existing) {
      patterns.set(key, { staffName: request.staffName.trim(), leaveType: request.leaveType, count: 1, from, to });
      continue;
    }
    existing.count += 1;
    if (from < existing.from) existing.from = from;
    if (to > existing.to) existing.to = to;
    if (!existing.staffName && request.staffName) existing.staffName = request.staffName.trim();
  }
  for (const [key, pattern] of patterns) {
    if (pattern.count < 3) continue;
    items.push({
      id: `pattern:${key}`,
      titleKey: "hrAssist.leave.pattern_review.title",
      whyKey: "hrAssist.leave.pattern_review.why",
      evidenceKey: "hrAssist.leave.pattern_review.evidence",
      actionKey: "hrAssist.leave.action",
      values: {
        staffName: pattern.staffName,
        count: pattern.count,
        leaveType: pattern.leaveType,
        periodFrom: pattern.from,
        periodTo: pattern.to,
      },
    });
  }

  if (items.length === 0) return { status: "empty", items: [] };
  return { status: "ok", items: items.slice(0, MAX_ITEMS) };
}

export function describeLeaveItem(item: AssistItem): { title: string; why: string; evidence: string; action: string } {
  return {
    title: englishAssistText(item.titleKey, item.values),
    why: englishAssistText(item.whyKey, item.values),
    evidence: englishAssistText(item.evidenceKey, item.values),
    action: englishAssistText(item.actionKey, item.values),
  };
}
