import { englishAssistText } from "./copy";
import type { AssistItem, AssistResult } from "./types";

export type EssBalance = {
  leaveType: string;
  available: number;
};

export type EssDocument = {
  docType: string;
  expiryDate: string | null;
};

function wants(question: string, words: string[]): boolean {
  const text = question.toLowerCase();
  return words.some((word) => text.includes(word));
}

export function answerEssQuestion(input: {
  question: string;
  year: number;
  balances: EssBalance[];
  documents: EssDocument[];
}): AssistResult {
  const question = input.question.trim();
  if (!question) return { status: "empty", items: [] };
  if (wants(question, ["leave", "balance", "remaining", "pto", "vacation", "annual", "sick"])) {
    if (!input.balances.length) return { status: "insufficient", items: [] };
    const lines = input.balances
      .map((row) => `${row.leaveType} ${row.available}`)
      .join(", ");
    const item: AssistItem = {
      id: "ess:leave",
      titleKey: "hrAssist.ess.leave.title",
      whyKey: "hrAssist.ess.leave.why",
      evidenceKey: "hrAssist.ess.leave.evidence",
      actionKey: "hrAssist.ess.action",
      linkKey: "hrAssist.openModule",
      href: "/hr/me#me-leave",
      values: { year: input.year, lines },
    };
    return { status: "ok", items: [item] };
  }
  if (wants(question, ["document", "insurance", "upload", "passport", "medical", "file"])) {
    const files = input.documents
      .slice(0, 6)
      .map((row) => (row.expiryDate ? `${row.docType} (${row.expiryDate})` : row.docType))
      .join(", ");
    const empty = input.documents.length === 0;
    const item: AssistItem = {
      id: "ess:doc",
      titleKey: empty ? "hrAssist.ess.document_empty.title" : "hrAssist.ess.document.title",
      whyKey: empty ? "hrAssist.ess.document_empty.why" : "hrAssist.ess.document.why",
      evidenceKey: empty ? "hrAssist.ess.document_empty.evidence" : "hrAssist.ess.document.evidence",
      actionKey: "hrAssist.ess.action",
      linkKey: "hrAssist.openModule",
      href: "/hr/me#me-documents",
      values: { count: input.documents.length, files: files || "none" },
    };
    return { status: "ok", items: [item] };
  }
  return { status: "insufficient", items: [] };
}

export function describeEssItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}
