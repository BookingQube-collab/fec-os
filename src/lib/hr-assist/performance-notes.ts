import { englishAssistText } from "./copy";
import { resultFrom, takeItems } from "./items";
import type { AssistItem, AssistResult } from "./types";

const PRAISE = /\b(excellent|strong|great|good|exceeded|outstanding|well done)\b/i;
const CONCERN = /\b(concern|below|missed|improvement|poor|unsatisfactory|needs work)\b/i;

export type PerformanceNoteInput = {
  staffId: string;
  staffName: string;
  cycleName: string;
  kpiLabel: string;
  earlier: number | null;
  later: number | null;
  earlierLabel: string;
  laterLabel: string;
  supervisorComments: string;
  managerComments: string;
};

function commentsDisagree(supervisor: string, manager: string): boolean {
  const leftPraise = PRAISE.test(supervisor);
  const leftConcern = CONCERN.test(supervisor);
  const rightPraise = PRAISE.test(manager);
  const rightConcern = CONCERN.test(manager);
  return (leftPraise && rightConcern) || (leftConcern && rightPraise);
}

export function buildPerformanceNotes(input: { rows: PerformanceNoteInput[] }): AssistResult {
  if (!input.rows.length) return { status: "empty", items: [] };
  const items: AssistItem[] = [];
  for (const row of input.rows) {
    const dropped =
      row.earlier != null && row.later != null && Number.isFinite(row.earlier) && Number.isFinite(row.later) && row.later + 1 <= row.earlier;
    const base = {
      staffName: row.staffName,
      cycleName: row.cycleName || "current cycle",
      kpiLabel: row.kpiLabel || "KPI",
      earlier: row.earlier ?? "—",
      later: row.later ?? "—",
      earlierLabel: row.earlierLabel || "—",
      laterLabel: row.laterLabel || "—",
      supervisorLength: row.supervisorComments.trim().length,
      managerLength: row.managerComments.trim().length,
    };
    if (dropped) {
      items.push({
        id: `perf:trend:${row.staffId}:${row.kpiLabel}`,
        titleKey: "hrAssist.performance.trend.title",
        whyKey: "hrAssist.performance.trend.why",
        evidenceKey: "hrAssist.performance.trend.evidence",
        actionKey: "hrAssist.performance.action",
        linkKey: "hrAssist.openModule",
        href: "/people/performance",
        values: base,
      });
      items.push({
        id: `perf:coach:${row.staffId}:${row.kpiLabel}`,
        titleKey: "hrAssist.performance.coaching.title",
        whyKey: "hrAssist.performance.coaching.why",
        evidenceKey: "hrAssist.performance.coaching.evidence",
        actionKey: "hrAssist.performance.action",
        linkKey: "hrAssist.openModule",
        href: "/people/performance",
        values: base,
      });
    }
    if (commentsDisagree(row.supervisorComments, row.managerComments)) {
      items.push({
        id: `perf:comments:${row.staffId}`,
        titleKey: "hrAssist.performance.contradiction.title",
        whyKey: "hrAssist.performance.contradiction.why",
        evidenceKey: "hrAssist.performance.contradiction.evidence",
        actionKey: "hrAssist.performance.action",
        linkKey: "hrAssist.openModule",
        href: "/people/performance",
        values: base,
      });
    }
  }
  return resultFrom(takeItems(items, 3, 12));
}

export function describePerformanceItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}

export function countKpiDrops(rows: PerformanceNoteInput[]): number {
  return rows.filter(
    (row) => row.earlier != null && row.later != null && Number.isFinite(row.earlier) && Number.isFinite(row.later) && row.later + 1 <= row.earlier,
  ).length;
}
