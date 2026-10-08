import { englishAssistText } from "./copy";
import { dayDiff } from "./time";
import { resultFrom, takeItems } from "./items";
import type { AssistItem, AssistResult } from "./types";

const WATCHED_TYPES = new Set(["qid", "passport", "visa", "contract", "medical", "license"]);

export type DocumentNoteInput = {
  staffId: string;
  staffName: string;
  docType: string;
  expiryDate: string | null;
};

export function buildDocumentNotes(input: { today: string; rows: DocumentNoteInput[] }): AssistResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today)) return { status: "insufficient", items: [] };
  if (!input.rows.length) return { status: "empty", items: [] };
  const items: AssistItem[] = [];
  for (const row of input.rows) {
    const docType = row.docType || "document";
    if (!row.expiryDate) {
      if (!WATCHED_TYPES.has(docType.toLowerCase())) continue;
      items.push({
        id: `doc:missing:${row.staffId}:${docType}`,
        titleKey: "hrAssist.documents.missing_expiry.title",
        whyKey: "hrAssist.documents.missing_expiry.why",
        evidenceKey: "hrAssist.documents.missing_expiry.evidence",
        actionKey: "hrAssist.documents.action",
        linkKey: "hrAssist.openModule",
        href: "/people/hr/documents",
        values: { staffName: row.staffName, docType },
      });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate)) continue;
    const days = dayDiff(input.today, row.expiryDate);
    if (days > 30) continue;
    items.push({
      id: `doc:expiry:${row.staffId}:${docType}:${row.expiryDate}`,
      titleKey: "hrAssist.documents.expiry.title",
      whyKey: "hrAssist.documents.expiry.why",
      evidenceKey: "hrAssist.documents.expiry.evidence",
      actionKey: "hrAssist.documents.action",
      linkKey: "hrAssist.openModule",
      href: "/people/hr/documents",
      values: { staffName: row.staffName, docType, expiryDate: row.expiryDate, today: input.today, days },
    });
  }
  return resultFrom(takeItems(items, 3, 12));
}

export type WarningNoteInput = {
  staffId: string;
  staffName: string;
  category: string;
  level: string;
  issuedOn: string;
  status: string;
  hasEmployeeExplanation: boolean;
};

export function buildWarningNotes(input: {
  periodFrom: string;
  periodTo: string;
  rows: WarningNoteInput[];
}): AssistResult {
  if (input.periodTo < input.periodFrom) return { status: "insufficient", items: [] };
  if (!input.rows.length) return { status: "empty", items: [] };
  const items: AssistItem[] = [];
  const byStaff = new Map<string, WarningNoteInput[]>();
  for (const row of input.rows) {
    if (row.issuedOn < input.periodFrom || row.issuedOn > input.periodTo) continue;
    const list = byStaff.get(row.staffId) ?? [];
    list.push(row);
    byStaff.set(row.staffId, list);
    items.push({
      id: `warn:${row.staffId}:${row.issuedOn}:${row.level}`,
      titleKey: "hrAssist.warnings.case.title",
      whyKey: "hrAssist.warnings.case.why",
      evidenceKey: "hrAssist.warnings.case.evidence",
      actionKey: "hrAssist.warnings.action",
      linkKey: "hrAssist.openModule",
      href: "/people/hr/warnings",
      values: {
        staffName: row.staffName,
        level: row.level,
        category: row.category,
        issuedOn: row.issuedOn,
        status: row.status,
        explanation: row.hasEmployeeExplanation ? "yes" : "no",
      },
    });
  }
  for (const [staffId, rows] of byStaff) {
    if (rows.length < 3) continue;
    const categories = [...new Set(rows.map((row) => row.category))].join(", ");
    items.push({
      id: `warn:pattern:${staffId}`,
      titleKey: "hrAssist.warnings.pattern_review.title",
      whyKey: "hrAssist.warnings.pattern_review.why",
      evidenceKey: "hrAssist.warnings.pattern_review.evidence",
      actionKey: "hrAssist.warnings.action",
      linkKey: "hrAssist.openModule",
      href: "/people/hr/warnings",
      values: {
        staffName: rows[0]?.staffName ?? "",
        count: rows.length,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        categories,
      },
    });
  }
  return resultFrom(takeItems(items, 3, 12));
}

export function describeComplianceItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}
