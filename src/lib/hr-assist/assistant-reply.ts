import { answerHrCopilot, describeCopilotItem } from "./copilot";
import { buildCommandInsights, describeCommandItem } from "./command-insights";
import { fillTemplate } from "./copy";
import { answerEssQuestion, describeEssItem, type EssBalance } from "./ess-answers";
import { INSUFFICIENT_HR_DATA, type AssistItem } from "./types";

export type HrAssistantFacts = {
  periodFrom: string;
  periodTo: string;
  today: string;
  filters: string;
  canPayroll: boolean;
  /** False when the login was checked and has no staff row. Null when not checked. */
  staffLinked: boolean | null;
  headcount: number | null;
  presentToday: number | null;
  onLeaveToday: number | null;
  pendingLeave: number | null;
  expiredDocs: number | null;
  expiringDocs: number | null;
  payrollBlocked: number | null;
  payrollExceptions: number | null;
  openJobs: number | null;
  pendingJobRequests: number | null;
  absentNames: string[] | null;
  absentTotal: number | null;
  missingNames: string[] | null;
  missingTotal: number | null;
  presentNames: string[] | null;
  onLeaveNames: string[] | null;
  balances: EssBalance[] | null;
  balanceYear: number | null;
};

export type AssistantReply = {
  status: "ok" | "insufficient";
  text: string;
  messageKey: string;
  values: Record<string, string | number>;
  source: string;
  periodFrom: string;
  periodTo: string;
};

const PAGES = [
  { id: "attendance", href: "/people/attendance", words: ["attendance", "punch", "حضور", "البصمة"] },
  { id: "roster", href: "/people/roster", words: ["roster", "shift", "جدول", "وردية"] },
  { id: "leave", href: "/people/leave", words: ["leave", "إجازة"] },
  { id: "payroll", href: "/people/payroll", words: ["payroll", "رواتب", "راتب"] },
  { id: "people", href: "/people", words: ["people", "employee", "directory", "موظف", "الموظفين"] },
] as const;

const EN = {
  absentNone: "No one is marked absent today.",
  absentNames: "Absent today: {{names}}.",
  absentNamesMore: "Absent today: {{names}}, and {{more}} more.",
  absentCount: "{{count}} people are marked absent today.",
  missingNone: "No missing punches are stored for today.",
  missingNames: "Missing a punch today: {{names}}.",
  missingNamesMore: "Missing a punch today: {{names}}, and {{more}} more.",
  missingCount: "{{count}} missing punches are stored for today.",
  presentNone: "No one is marked present today.",
  presentNames: "Present today: {{names}}.",
  presentNamesMore: "Present today: {{names}}, and {{more}} more.",
  presentCount: "{{count}} people are marked present today.",
  onLeaveNone: "No one is on approved leave today.",
  onLeaveNames: "On leave today: {{names}}.",
  onLeaveNamesMore: "On leave today: {{names}}, and {{more}} more.",
  leaveUnlinked: "This login is not linked to a staff record, so leave remaining is not on file.",
  docs: "{{expired}} documents are past expiry. {{expiring}} expire within 30 days.",
  payrollCounts: "Payroll blocked: {{blocked}}. Payroll exceptions: {{exceptions}}.",
  hiring: "Open jobs: {{openJobs}}. Pending job requests: {{pending}}.",
  headcount: "Active headcount is {{headcount}}.",
  pageOne: "Open {{label}}: {{href}}.",
  pageAll: "Attendance {{attendance}}. Roster {{roster}}. Leave {{leave}}. Payroll {{payroll}}. People {{people}}.",
} as const;

function has(question: string, words: readonly string[]): boolean {
  return words.some((word) => question.includes(word));
}

function isNavigation(question: string): boolean {
  return (
    /\b(which page|what page|where (do|can|is|are|to)|open the|go to|take me|which screen)\b/.test(question) ||
    /\bpage for\b/.test(question) ||
    /\bopen (attendance|roster|leave|payroll|people|employees)\b/.test(question) ||
    question.includes("صفحة") ||
    question.includes("افتح ")
  );
}

function isDecision(question: string): boolean {
  return (
    /\b(fire|firing|dismiss|punish|burnout|attrition|mood)\b/.test(question) ||
    /should (i|we)\b/.test(question) ||
    question.includes("فصل") ||
    question.includes("إنهاء الخدمة")
  );
}

function asksSensitiveValue(question: string): boolean {
  return (
    /\b(salary|salaries|wage|wages|net pay|iban|bank account|bank details|qid number|passport number)\b/.test(question) ||
    question.includes("رقم الجواز") ||
    question.includes("رقم البطاقة") ||
    question.includes("رقم الحساب") ||
    (question.includes("كم") && question.includes("راتب"))
  );
}

function wantsNames(question: string): boolean {
  return /\b(who|names|list)\b/.test(question) || question.includes("من ") || question.includes("أسماء");
}

export function assistantNeeds(question: string): {
  attendance: boolean;
  leaveRemaining: boolean;
  leaveToday: boolean;
  documents: boolean;
  payroll: boolean;
  hiring: boolean;
} {
  const asked = question.trim().toLowerCase();
  const navigation = isNavigation(asked);
  const personalLeave = has(asked, ["remaining", "balance", "leave left", "my leave", "متبقي", "رصيد"]);
  return {
    attendance:
      !navigation &&
      has(asked, ["missing punch", "missed punch", "missing punches", "بصمة", "absent", "غياب", "غائب", "present", "حاضر", "حضور", "headcount", "العدد"]),
    leaveRemaining: !navigation && personalLeave,
    leaveToday: !navigation && !personalLeave && has(asked, ["leave", "إجازة"]),
    documents: !navigation && has(asked, ["document", "expir", "وثيق", "منته"]),
    payroll: !navigation && !isDecision(asked) && !asksSensitiveValue(asked) && has(asked, ["payroll", "رواتب"]),
    hiring: !navigation && has(asked, ["hiring", "vacanc", "recruit", "open job", "وظيف", "شاغر", "توظيف"]),
  };
}

function cleanName(name: string): string {
  return name
    .replace(/\b\d{11}\b/g, "")
    .replace(/\bQA[0-9A-Z]{10}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function reply(
  facts: HrAssistantFacts,
  status: "ok" | "insufficient",
  messageKey: string,
  values: Record<string, string | number>,
  text: string,
  source: string,
): AssistantReply {
  return {
    status,
    text,
    messageKey,
    values,
    source,
    periodFrom: facts.periodFrom,
    periodTo: facts.periodTo,
  };
}

function insufficientReply(facts: HrAssistantFacts): AssistantReply {
  return reply(facts, "insufficient", "hrAssist.insufficient", {}, INSUFFICIENT_HR_DATA, "none");
}

function fromTemplate(
  facts: HrAssistantFacts,
  key: keyof typeof EN,
  values: Record<string, string | number>,
  source: string,
): AssistantReply {
  return reply(facts, "ok", `hrAssistant.${key}`, values, fillTemplate(EN[key], values), source);
}

function fromCommand(facts: HrAssistantFacts, item: AssistItem, source: string): AssistantReply {
  return reply(facts, "ok", item.whyKey, item.values, describeCommandItem(item).why, source);
}

function nameReply(
  facts: HrAssistantFacts,
  names: string[] | null,
  total: number | null,
  keys: { none: keyof typeof EN; names: keyof typeof EN; more: keyof typeof EN; count: keyof typeof EN },
  source: string,
): AssistantReply {
  if (names == null && total == null) return insufficientReply(facts);
  const clean = (names ?? []).map(cleanName).filter(Boolean);
  const count = total ?? clean.length;
  if (count <= 0) return fromTemplate(facts, keys.none, {}, source);
  const shown = clean.slice(0, 8);
  if (!shown.length) return fromTemplate(facts, keys.count, { count }, source);
  const more = Math.max(0, count - shown.length);
  if (more > 0) {
    return fromTemplate(facts, keys.more, { names: shown.join(", "), more }, source);
  }
  return fromTemplate(facts, keys.names, { names: shown.join(", ") }, source);
}

function pageReply(question: string, facts: HrAssistantFacts): AssistantReply {
  const match = PAGES.find((page) => has(question, page.words));
  if (!match) {
    return fromTemplate(
      facts,
      "pageAll",
      {
        attendance: "/people/attendance",
        roster: "/people/roster",
        leave: "/people/leave",
        payroll: "/people/payroll",
        people: "/people",
      },
      "pages",
    );
  }
  const label = match.id.charAt(0).toUpperCase() + match.id.slice(1);
  return fromTemplate(facts, "pageOne", { label, href: match.href }, "pages");
}

function payrollReply(facts: HrAssistantFacts): AssistantReply {
  if (!facts.canPayroll) {
    const hidden = answerHrCopilot({
      question: "payroll",
      periodFrom: facts.periodFrom,
      periodTo: facts.periodTo,
      filters: facts.filters || "none",
      canPayroll: false,
      payroll: { status: "empty", items: [] },
      attendance: { status: "empty", items: [] },
      roster: { status: "empty", items: [] },
      leave: { status: "empty", items: [] },
      recruitment: { status: "empty", items: [] },
      performance: { status: "empty", items: [] },
      training: { status: "empty", items: [] },
      documents: { status: "empty", items: [] },
      warnings: { status: "empty", items: [] },
      workforce: { status: "empty", items: [] },
    });
    const item = hidden.items[0];
    if (!item) return insufficientReply(facts);
    const text = describeCopilotItem(item).why;
    if (/99999|qar|\d+\.\d{2}/i.test(text)) return insufficientReply(facts);
    return reply(facts, "ok", item.whyKey, item.values, text, "payrollAccess");
  }
  if (facts.payrollBlocked == null || facts.payrollExceptions == null) return insufficientReply(facts);
  return fromTemplate(
    facts,
    "payrollCounts",
    { blocked: facts.payrollBlocked, exceptions: facts.payrollExceptions },
    "payroll",
  );
}

function documentsReply(facts: HrAssistantFacts): AssistantReply {
  const insights = buildCommandInsights({
    periodFrom: facts.periodFrom,
    periodTo: facts.periodTo,
    today: facts.today,
    headcount: facts.headcount,
    onLeaveToday: facts.onLeaveToday,
    expiredDocs: facts.expiredDocs,
    expiringDocs: facts.expiringDocs,
    pendingLeave: facts.pendingLeave,
    presentToday: facts.presentToday,
  });
  if (facts.expiredDocs != null && facts.expiringDocs != null) {
    return fromTemplate(
      facts,
      "docs",
      { expired: facts.expiredDocs, expiring: facts.expiringDocs },
      "documents",
    );
  }
  const item = insights.items.find((entry) => entry.id === "cmd:expired" || entry.id === "cmd:expiring");
  if (!item) return insufficientReply(facts);
  return fromCommand(facts, item, "documents");
}

function leaveRemainingReply(facts: HrAssistantFacts): AssistantReply {
  if (facts.staffLinked === false) {
    return fromTemplate(facts, "leaveUnlinked", {}, "leave");
  }
  if (facts.staffLinked !== true || facts.balances == null || facts.balanceYear == null) {
    return insufficientReply(facts);
  }
  const ess = answerEssQuestion({
    question: "leave remaining",
    year: facts.balanceYear,
    balances: facts.balances,
    documents: [],
  });
  const item = ess.items[0];
  if (ess.status !== "ok" || !item) return insufficientReply(facts);
  return reply(facts, "ok", item.whyKey, item.values, describeEssItem(item).why, "leave");
}

function presentReply(question: string, facts: HrAssistantFacts): AssistantReply {
  if (wantsNames(question)) {
    return nameReply(
      facts,
      facts.presentNames,
      facts.presentToday,
      { none: "presentNone", names: "presentNames", more: "presentNamesMore", count: "presentCount" },
      "attendance",
    );
  }
  const insights = buildCommandInsights({
    periodFrom: facts.periodFrom,
    periodTo: facts.periodTo,
    today: facts.today,
    headcount: facts.headcount,
    onLeaveToday: facts.onLeaveToday,
    expiredDocs: facts.expiredDocs,
    expiringDocs: facts.expiringDocs,
    pendingLeave: facts.pendingLeave,
    presentToday: facts.presentToday,
  });
  const item = insights.items.find((entry) => entry.id === "cmd:present");
  if (item) return fromCommand(facts, item, "attendance");
  if (facts.headcount != null) return fromTemplate(facts, "headcount", { headcount: facts.headcount }, "attendance");
  return insufficientReply(facts);
}

export function answerHrAssistant(question: string, facts: HrAssistantFacts): AssistantReply {
  const asked = question.trim().toLowerCase();
  if (!asked || facts.periodTo < facts.periodFrom || !facts.today) return insufficientReply(facts);
  if (isNavigation(asked)) return pageReply(asked, facts);
  if (isDecision(asked) || asksSensitiveValue(asked)) return insufficientReply(facts);

  if (has(asked, ["payroll", "رواتب"])) return payrollReply(facts);
  if (has(asked, ["document", "expir", "وثيق", "منته"])) return documentsReply(facts);
  if (has(asked, ["remaining", "balance", "leave left", "my leave", "متبقي", "رصيد"])) return leaveRemainingReply(facts);
  if (has(asked, ["hiring", "vacanc", "recruit", "open job", "وظيف", "شاغر", "توظيف"])) {
    if (facts.openJobs == null || facts.pendingJobRequests == null) return insufficientReply(facts);
    return fromTemplate(
      facts,
      "hiring",
      { openJobs: facts.openJobs, pending: facts.pendingJobRequests },
      "recruitment",
    );
  }
  if (has(asked, ["missing punch", "missed punch", "missing punches", "بصمة"])) {
    return nameReply(
      facts,
      facts.missingNames,
      facts.missingTotal ?? (facts.missingNames == null ? null : facts.missingNames.length),
      { none: "missingNone", names: "missingNames", more: "missingNamesMore", count: "missingCount" },
      "attendance",
    );
  }
  if (has(asked, ["absent", "غياب", "غائب"])) {
    return nameReply(
      facts,
      facts.absentNames,
      facts.absentTotal ?? (facts.absentNames == null ? null : facts.absentNames.length),
      { none: "absentNone", names: "absentNames", more: "absentNamesMore", count: "absentCount" },
      "attendance",
    );
  }
  if (has(asked, ["present", "حاضر", "حضور", "headcount", "العدد"])) return presentReply(asked, facts);
  if (has(asked, ["pending leave", "إجازة معل"])) {
    const insights = buildCommandInsights({
      periodFrom: facts.periodFrom,
      periodTo: facts.periodTo,
      today: facts.today,
      headcount: facts.headcount,
      onLeaveToday: facts.onLeaveToday,
      expiredDocs: facts.expiredDocs,
      expiringDocs: facts.expiringDocs,
      pendingLeave: facts.pendingLeave,
      presentToday: facts.presentToday,
    });
    const item = insights.items.find((entry) => entry.id === "cmd:pending");
    if (item) return fromCommand(facts, item, "leave");
    if (facts.pendingLeave === 0) return fromTemplate(facts, "onLeaveNone", {}, "leave");
    return insufficientReply(facts);
  }
  if (has(asked, ["leave", "إجازة"])) {
    if (wantsNames(asked)) {
      return nameReply(
        facts,
        facts.onLeaveNames,
        facts.onLeaveToday,
        { none: "onLeaveNone", names: "onLeaveNames", more: "onLeaveNamesMore", count: "onLeaveNone" },
        "leave",
      );
    }
    const insights = buildCommandInsights({
      periodFrom: facts.periodFrom,
      periodTo: facts.periodTo,
      today: facts.today,
      headcount: facts.headcount,
      onLeaveToday: facts.onLeaveToday,
      expiredDocs: facts.expiredDocs,
      expiringDocs: facts.expiringDocs,
      pendingLeave: facts.pendingLeave,
      presentToday: facts.presentToday,
    });
    const item = insights.items.find((entry) => entry.id === "cmd:on_leave" || entry.id === "cmd:leave");
    if (item) return fromCommand(facts, item, "leave");
    if (facts.onLeaveToday === 0) return fromTemplate(facts, "onLeaveNone", {}, "leave");
    return insufficientReply(facts);
  }
  return insufficientReply(facts);
}
