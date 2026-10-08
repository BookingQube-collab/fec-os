import { HR_REPORT_IDS, type HrReportId } from "@/lib/hr-reports";

import { englishAssistText } from "./copy";
import type { AssistItem, AssistResult } from "./types";

export function explainHrReport(reportId: string): AssistResult {
  if (!HR_REPORT_IDS.includes(reportId as HrReportId)) return { status: "insufficient", items: [] };
  const item: AssistItem = {
    id: `report:${reportId}`,
    titleKey: "hrAssist.reports.catalog.title",
    whyKey: "hrAssist.reports.catalog.why",
    evidenceKey: "hrAssist.reports.catalog.evidence",
    actionKey: "hrAssist.reports.action",
    values: { reportId, reportName: reportId.replaceAll("_", " ") },
  };
  return { status: "ok", items: [item] };
}

export function describeReportItem(item: AssistItem): { why: string; evidence: string } {
  return { why: englishAssistText(item.whyKey, item.values), evidence: englishAssistText(item.evidenceKey, item.values) };
}

/** Columns this assist layer is allowed to read. Sensitive identifiers stay off the select. */
export const PAYROLL_ASSIST_SELECT =
  "id, staff_id, payment_method, earnings, deductions, gross_qar, net_qar, variance_vs_prev, imported_net_qar, system_net_qar, snapshot, staff(full_name)";

export const RECRUITMENT_CANDIDATE_SELECT =
  "id, full_name, skills, experience_years, education, cv_text, visa_status";

/** Presence only. The value is converted to a boolean and is not returned. */
export const RECRUITMENT_QID_PRESENCE_SELECT = "id, qid";
