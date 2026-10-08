import { englishAssistText } from "./copy";
import { resultFrom, takeItems } from "./items";
import type { AssistItem, AssistResult } from "./types";

export type WorkforceNoteInput = {
  periodFrom: string;
  periodTo: string;
  midpoint: string;
  site: string;
  approvedHeadcount: number | null;
  rosteredPeople: number | null;
  otFirstHalfMinutes: number | null;
  otSecondHalfMinutes: number | null;
  missedPunchDays: number | null;
  leaveDays: number | null;
  overdueRequiredCourses: number | null;
  kpiDropCount: number | null;
};

function known(input: WorkforceNoteInput): boolean {
  return [
    input.approvedHeadcount,
    input.rosteredPeople,
    input.otFirstHalfMinutes,
    input.otSecondHalfMinutes,
    input.missedPunchDays,
    input.leaveDays,
    input.overdueRequiredCourses,
    input.kpiDropCount,
  ].some((value) => value != null);
}

export function buildWorkforceNotes(input: WorkforceNoteInput): AssistResult {
  if (input.periodTo < input.periodFrom || !input.midpoint) return { status: "insufficient", items: [] };
  if (!known(input)) return { status: "insufficient", items: [] };
  const items: AssistItem[] = [];
  const period = { periodFrom: input.periodFrom, periodTo: input.periodTo, site: input.site || "" };
  if (input.approvedHeadcount != null && input.rosteredPeople != null) {
    const gap = input.approvedHeadcount - input.rosteredPeople;
    if (gap >= 2) {
      items.push({
        id: `wf:quota:${input.site}`,
        titleKey: "hrAssist.workforce.quota.title",
        whyKey: "hrAssist.workforce.quota.why",
        evidenceKey: "hrAssist.workforce.quota.evidence",
        actionKey: "hrAssist.workforce.action",
        linkKey: "hrAssist.openModule",
        href: "/people/hr/quota",
        values: { ...period, approved: input.approvedHeadcount, rostered: input.rosteredPeople, gap },
      });
    }
  }
  if (input.otFirstHalfMinutes != null && input.otSecondHalfMinutes != null) {
    const gap = input.otSecondHalfMinutes - input.otFirstHalfMinutes;
    if (gap >= 180) {
      items.push({
        id: "wf:ot",
        titleKey: "hrAssist.workforce.overtime.title",
        whyKey: "hrAssist.workforce.overtime.why",
        evidenceKey: "hrAssist.workforce.overtime.evidence",
        actionKey: "hrAssist.workforce.action",
        linkKey: "hrAssist.openModule",
        href: "/people/attendance",
        values: {
          ...period,
          midpoint: input.midpoint,
          earlier: input.otFirstHalfMinutes,
          later: input.otSecondHalfMinutes,
          gap,
        },
      });
    }
  }
  if (input.missedPunchDays != null && input.missedPunchDays >= 3) {
    items.push({
      id: "wf:attendance",
      titleKey: "hrAssist.workforce.attendance.title",
      whyKey: "hrAssist.workforce.attendance.why",
      evidenceKey: "hrAssist.workforce.attendance.evidence",
      actionKey: "hrAssist.workforce.action",
      linkKey: "hrAssist.openModule",
      href: "/people/attendance",
      values: { ...period, count: input.missedPunchDays },
    });
  }
  if (input.leaveDays != null && input.leaveDays >= 8) {
    items.push({
      id: "wf:leave",
      titleKey: "hrAssist.workforce.leave.title",
      whyKey: "hrAssist.workforce.leave.why",
      evidenceKey: "hrAssist.workforce.leave.evidence",
      actionKey: "hrAssist.workforce.action",
      linkKey: "hrAssist.openModule",
      href: "/people/leave",
      values: { ...period, count: input.leaveDays },
    });
  }
  if (input.overdueRequiredCourses != null && input.overdueRequiredCourses >= 1) {
    items.push({
      id: "wf:training",
      titleKey: "hrAssist.workforce.training.title",
      whyKey: "hrAssist.workforce.training.why",
      evidenceKey: "hrAssist.workforce.training.evidence",
      actionKey: "hrAssist.workforce.action",
      linkKey: "hrAssist.openModule",
      href: "/people?tab=training",
      values: { ...period, count: input.overdueRequiredCourses },
    });
  }
  if (input.kpiDropCount != null && input.kpiDropCount >= 1) {
    items.push({
      id: "wf:performance",
      titleKey: "hrAssist.workforce.performance.title",
      whyKey: "hrAssist.workforce.performance.why",
      evidenceKey: "hrAssist.workforce.performance.evidence",
      actionKey: "hrAssist.workforce.action",
      linkKey: "hrAssist.openModule",
      href: "/people/performance",
      values: { ...period, count: input.kpiDropCount },
    });
  }
  return resultFrom(takeItems(items, 3, 8));
}

export function describeWorkforceItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}
