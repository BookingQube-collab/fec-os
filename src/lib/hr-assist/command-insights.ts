import { englishAssistText } from "./copy";
import { resultFrom } from "./items";
import type { AssistItem, AssistResult } from "./types";

export type CommandCounts = {
  periodFrom: string;
  periodTo: string;
  today: string;
  headcount: number | null;
  onLeaveToday: number | null;
  expiredDocs: number | null;
  expiringDocs: number | null;
  pendingLeave: number | null;
  presentToday: number | null;
};

function known(input: CommandCounts): boolean {
  return [input.headcount, input.onLeaveToday, input.expiredDocs, input.expiringDocs, input.pendingLeave, input.presentToday].some(
    (value) => value != null,
  );
}

export function buildCommandInsights(input: CommandCounts): AssistResult {
  if (input.periodTo < input.periodFrom || !input.today) return { status: "insufficient", items: [] };
  if (!known(input)) return { status: "insufficient", items: [] };
  const period = { periodFrom: input.periodFrom, periodTo: input.periodTo, today: input.today };
  const items: AssistItem[] = [];
  if (input.onLeaveToday != null && input.onLeaveToday > 0) {
    items.push({
      id: "cmd:leave",
      titleKey: "hrAssist.command.on_leave.title",
      whyKey: "hrAssist.command.on_leave.why",
      evidenceKey: "hrAssist.command.on_leave.evidence",
      actionKey: "hrAssist.command.action",
      linkKey: "hrAssist.openModule",
      href: "/people/leave",
      values: { ...period, count: input.onLeaveToday },
    });
  }
  if (input.expiredDocs != null && input.expiredDocs > 0) {
    items.push({
      id: "cmd:expired",
      titleKey: "hrAssist.command.expired.title",
      whyKey: "hrAssist.command.expired.why",
      evidenceKey: "hrAssist.command.expired.evidence",
      actionKey: "hrAssist.command.action",
      linkKey: "hrAssist.openModule",
      href: "/people/hr/documents",
      values: { ...period, count: input.expiredDocs },
    });
  }
  if (input.expiringDocs != null && input.expiringDocs > 0) {
    items.push({
      id: "cmd:expiring",
      titleKey: "hrAssist.command.expiring.title",
      whyKey: "hrAssist.command.expiring.why",
      evidenceKey: "hrAssist.command.expiring.evidence",
      actionKey: "hrAssist.command.action",
      linkKey: "hrAssist.openModule",
      href: "/people/hr/documents",
      values: { ...period, count: input.expiringDocs },
    });
  }
  if (input.pendingLeave != null && input.pendingLeave > 0) {
    items.push({
      id: "cmd:pending",
      titleKey: "hrAssist.command.pending_leave.title",
      whyKey: "hrAssist.command.pending_leave.why",
      evidenceKey: "hrAssist.command.pending_leave.evidence",
      actionKey: "hrAssist.command.action",
      linkKey: "hrAssist.openModule",
      href: "/people/leave",
      values: { ...period, count: input.pendingLeave },
    });
  }
  if (input.presentToday != null && input.headcount != null) {
    items.push({
      id: "cmd:present",
      titleKey: "hrAssist.command.present.title",
      whyKey: "hrAssist.command.present.why",
      evidenceKey: "hrAssist.command.present.evidence",
      actionKey: "hrAssist.command.action",
      linkKey: "hrAssist.openModule",
      href: "/people/attendance",
      values: { ...period, present: input.presentToday, headcount: input.headcount },
    });
  }
  if (!items.length && input.headcount != null) {
    items.push({
      id: "cmd:quiet",
      titleKey: "hrAssist.command.quiet.title",
      whyKey: "hrAssist.command.quiet.why",
      evidenceKey: "hrAssist.command.quiet.evidence",
      actionKey: "hrAssist.command.action",
      values: {
        ...period,
        headcount: input.headcount,
        onLeave: input.onLeaveToday ?? 0,
        expired: input.expiredDocs ?? 0,
        pending: input.pendingLeave ?? 0,
      },
    });
  }
  return resultFrom(items);
}

export function describeCommandItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}

/** Plain recap of counts already on the dashboard. Null counts are not filled in. */
export function buildSmartKpiSummary(input: {
  periodFrom: string;
  periodTo: string;
  headcount: number | null;
  presentToday: number | null;
  onLeaveToday: number | null;
  pendingLeave: number | null;
  expiredDocs: number | null;
}): AssistResult {
  if (input.periodTo < input.periodFrom) return { status: "insufficient", items: [] };
  if (
    input.headcount == null ||
    input.presentToday == null ||
    input.onLeaveToday == null ||
    input.pendingLeave == null ||
    input.expiredDocs == null
  ) {
    return { status: "insufficient", items: [] };
  }
  return resultFrom([
    {
      id: "cmd:summary",
      titleKey: "hrAssist.command.summary.title",
      whyKey: "hrAssist.command.summary.why",
      evidenceKey: "hrAssist.command.summary.evidence",
      actionKey: "hrAssist.command.action",
      values: {
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        headcount: input.headcount,
        present: input.presentToday,
        onLeave: input.onLeaveToday,
        pending: input.pendingLeave,
        expired: input.expiredDocs,
      },
    },
  ]);
}
