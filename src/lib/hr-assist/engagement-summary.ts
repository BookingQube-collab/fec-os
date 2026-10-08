import { englishAssistText } from "./copy";
import { resultFrom } from "./items";
import type { AssistItem, AssistResult } from "./types";

export type RecognitionRow = {
  title: string;
  on: string;
};

export type EngagementInput = {
  periodFrom: string;
  periodTo: string;
  surveysStored: boolean;
  recognition: RecognitionRow[];
  warningCategories: Array<{ category: string; count: number }>;
  missedPunchDays: number | null;
  leaveDays: number | null;
};

export function buildEngagementSummary(input: EngagementInput): AssistResult {
  if (input.periodTo < input.periodFrom) return { status: "insufficient", items: [] };
  const items: AssistItem[] = [];
  const period = { periodFrom: input.periodFrom, periodTo: input.periodTo };
  if (!input.surveysStored) {
    items.push({
      id: "eng:surveys",
      titleKey: "hrAssist.engagement.missing_survey.title",
      whyKey: "hrAssist.engagement.missing_survey.why",
      evidenceKey: "hrAssist.engagement.missing_survey.evidence",
      actionKey: "hrAssist.engagement.action",
      values: period,
    });
  }
  const titles = input.recognition
    .map((row) => row.title.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (titles.length) {
    items.push({
      id: "eng:recognition",
      titleKey: "hrAssist.engagement.recognition.title",
      whyKey: "hrAssist.engagement.recognition.why",
      evidenceKey: "hrAssist.engagement.recognition.evidence",
      actionKey: "hrAssist.engagement.action",
      linkKey: "hrAssist.openModule",
      href: "/people/performance",
      values: { ...period, count: input.recognition.length, titles: titles.join("; ") },
    });
  }
  for (const row of input.warningCategories) {
    if (row.count < 2 || !row.category.trim()) continue;
    items.push({
      id: `eng:warn:${row.category}`,
      titleKey: "hrAssist.engagement.concern.title",
      whyKey: "hrAssist.engagement.concern.why",
      evidenceKey: "hrAssist.engagement.concern.evidence",
      actionKey: "hrAssist.engagement.action",
      linkKey: "hrAssist.openModule",
      href: "/people/hr/warnings",
      values: { ...period, category: row.category, count: row.count },
    });
  }
  if (input.missedPunchDays != null && input.missedPunchDays >= 3) {
    items.push({
      id: "eng:attendance",
      titleKey: "hrAssist.engagement.attendance.title",
      whyKey: "hrAssist.engagement.attendance.why",
      evidenceKey: "hrAssist.engagement.attendance.evidence",
      actionKey: "hrAssist.engagement.action",
      linkKey: "hrAssist.openModule",
      href: "/people/attendance",
      values: { ...period, count: input.missedPunchDays },
    });
  }
  if (input.leaveDays != null && input.leaveDays >= 8) {
    items.push({
      id: "eng:leave",
      titleKey: "hrAssist.engagement.leave.title",
      whyKey: "hrAssist.engagement.leave.why",
      evidenceKey: "hrAssist.engagement.leave.evidence",
      actionKey: "hrAssist.engagement.action",
      linkKey: "hrAssist.openModule",
      href: "/people/leave",
      values: { ...period, count: input.leaveDays },
    });
  }
  return resultFrom(items.slice(0, 8));
}

export function describeEngagementItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}
