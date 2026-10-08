import { englishAssistText } from "./copy";
import { resultFrom } from "./items";
import type { AssistItem, AssistResult } from "./types";
import { INSUFFICIENT_HR_DATA } from "./types";

export type CopilotBundle = {
  question: string;
  periodFrom: string;
  periodTo: string;
  filters: string;
  canPayroll: boolean;
  payroll: AssistResult;
  attendance: AssistResult;
  roster: AssistResult;
  leave: AssistResult;
  recruitment: AssistResult;
  performance: AssistResult;
  training: AssistResult;
  documents: AssistResult;
  warnings: AssistResult;
  workforce: AssistResult;
};

export type CopilotAnswer = AssistResult & {
  source: string;
  periodFrom: string;
  periodTo: string;
  filters: string;
};

const ROUTES: Array<{ source: string; words: string[]; key: keyof CopilotBundle }> = [
  { source: "payroll", words: ["payroll", "salary", "wage", "wps", "deduction", "net pay"], key: "payroll" },
  { source: "attendance", words: ["attendance", "punch", "absent"], key: "attendance" },
  { source: "roster", words: ["roster", "shift"], key: "roster" },
  { source: "leave", words: ["leave", "vacation"], key: "leave" },
  { source: "recruitment", words: ["recruit", "candidate", "hiring", "vacancy"], key: "recruitment" },
  { source: "performance", words: ["performance", "kra", "kpi", "evaluation"], key: "performance" },
  { source: "training", words: ["training", "course", "skill"], key: "training" },
  { source: "documents", words: ["document", "expiry", "passport"], key: "documents" },
  { source: "warnings", words: ["warning", "disciplinary"], key: "warnings" },
  { source: "workforce", words: ["headcount", "quota", "overtime", "workload", "engagement"], key: "workforce" },
];

export function answerHrCopilot(input: CopilotBundle): CopilotAnswer {
  const periodFrom = input.periodFrom;
  const periodTo = input.periodTo;
  const filters = input.filters || "none";
  const base = { source: "", periodFrom, periodTo, filters };
  const question = input.question.trim().toLowerCase();
  if (!question || periodTo < periodFrom) {
    return { status: "insufficient", items: [], ...base, source: "" };
  }
  const route = ROUTES.find((entry) => entry.words.some((word) => question.includes(word)));
  if (!route) return { status: "insufficient", items: [], ...base };
  if (route.source === "payroll" && !input.canPayroll) {
    const item: AssistItem = {
      id: "copilot:payroll-hidden",
      titleKey: "hrAssist.copilot.hidden_payroll.title",
      whyKey: "hrAssist.copilot.hidden_payroll.why",
      evidenceKey: "hrAssist.copilot.hidden_payroll.evidence",
      actionKey: "hrAssist.copilot.action",
      linkKey: "hrAssist.openModule",
      href: "/people/payroll",
      values: { periodFrom, periodTo, filters },
    };
    return { status: "ok", items: [item], ...base, source: "payroll access check" };
  }
  const result = input[route.key];
  if (!result || typeof result !== "object" || !("status" in result)) {
    return { status: "insufficient", items: [], ...base, source: route.source };
  }
  return { ...result, ...base, source: route.source };
}

export function copilotInsufficientText(): string {
  return INSUFFICIENT_HR_DATA;
}

export function describeCopilotItem(item: AssistItem): { why: string; evidence: string } {
  return { why: englishAssistText(item.whyKey, item.values), evidence: englishAssistText(item.evidenceKey, item.values) };
}

export function buildActionCards(groups: AssistResult[]): AssistResult {
  const items = groups.flatMap((group) => group.items).filter((item) => item.href);
  const capped = items.slice(0, 12).map((item) => ({
    ...item,
    linkKey: item.linkKey ?? "hrAssist.openModule",
    actionKey: "hrAssist.actions.action",
  }));
  return resultFrom(capped);
}
