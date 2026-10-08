import { englishAssistText } from "./copy";
import { resultFrom, takeItems } from "./items";
import type { AssistItem, AssistResult } from "./types";

export type OnboardingChecklist = {
  staffId: string;
  staffName: string;
  kind: string;
  openItems: string[];
};

export function buildOnboardingNotes(input: { rows: OnboardingChecklist[] }): AssistResult {
  const items: AssistItem[] = [];
  for (const row of input.rows) {
    const open = row.openItems.map((title) => title.trim()).filter(Boolean);
    if (!open.length) continue;
    items.push({
      id: `onboard:${row.staffId}`,
      titleKey: "hrAssist.onboarding.open_items.title",
      whyKey: "hrAssist.onboarding.open_items.why",
      evidenceKey: "hrAssist.onboarding.open_items.evidence",
      actionKey: "hrAssist.onboarding.action",
      linkKey: "hrAssist.openModule",
      href: "/people/hr/onboarding",
      values: {
        staffName: row.staffName,
        items: open.slice(0, 6).join(", "),
        kind: row.kind || "onboarding",
        count: open.length,
      },
    });
  }
  if (!input.rows.length) return { status: "empty", items: [] };
  return resultFrom(takeItems(items, 3, 8));
}

export function describeOnboardingItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}
