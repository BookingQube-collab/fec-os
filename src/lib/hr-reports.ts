/**
 * HR reports catalog (Phase 11). Pure — permission filtering + stubs; no Supabase.
 */

export const HR_REPORT_IDS = [
  "employee_master",
  "employee_history",
  "document_expiry",
  "missing_document",
  "warning_disciplinary",
  "probation",
  "leave_balance",
  "ot",
  "payroll",
  "loan_deduction",
  "bonus_commission",
  "air_ticket",
  "resignation_termination",
  "recruitment_funnel",
  "time_to_hire",
  "candidate_source",
  "location_quota",
  "department_quota",
  "headcount_movement",
] as const;

export type HrReportId = (typeof HR_REPORT_IDS)[number];

export type HrReportColumn = {
  key: string;
  header: string;
  /** Strip unless caller has identity/salary capability. */
  sensitive?: "identity" | "salary";
};

export type HrReportCaps = {
  canIdentity: boolean;
  canSalary: boolean;
  canPayroll: boolean;
  canRecruitment: boolean;
  canWarnings: boolean;
  canLeave: boolean;
  canOt: boolean;
  canQuota: boolean;
  canAirTicket: boolean;
  canExit: boolean;
  canDocs: boolean;
  canTimeline: boolean;
};

/** Reports that require a specific capability beyond basic roster/HR view. */
export function reportRequiredCapability(id: HrReportId): keyof HrReportCaps | null {
  switch (id) {
    case "payroll":
    case "loan_deduction":
    case "bonus_commission":
      return "canPayroll";
    case "recruitment_funnel":
    case "time_to_hire":
    case "candidate_source":
      return "canRecruitment";
    case "warning_disciplinary":
      return "canWarnings";
    case "leave_balance":
      return "canLeave";
    case "ot":
      return "canOt";
    case "location_quota":
    case "department_quota":
      return "canQuota";
    case "air_ticket":
      return "canAirTicket";
    case "resignation_termination":
      return "canExit";
    case "document_expiry":
    case "missing_document":
      return "canDocs";
    case "employee_history":
      return "canTimeline";
    default:
      return null;
  }
}

export function isHrReportVisible(id: HrReportId, caps: HrReportCaps): boolean {
  const req = reportRequiredCapability(id);
  if (!req) return true;
  return Boolean(caps[req]);
}

export function visibleHrReportIds(caps: HrReportCaps): HrReportId[] {
  return HR_REPORT_IDS.filter((id) => isHrReportVisible(id, caps));
}

export function filterReportColumns(
  columns: HrReportColumn[],
  caps: Pick<HrReportCaps, "canIdentity" | "canSalary">,
): HrReportColumn[] {
  return columns.filter((c) => {
    if (c.sensitive === "identity" && !caps.canIdentity) return false;
    if (c.sensitive === "salary" && !caps.canSalary) return false;
    return true;
  });
}

/** Drop sensitive keys from row objects after column filter. */
export function projectReportRows(
  rows: Array<Record<string, string | number | null>>,
  columns: HrReportColumn[],
): Array<Record<string, string | number | null>> {
  const keys = new Set(columns.map((c) => c.key));
  return (rows ?? []).map((row) => {
    const out: Record<string, string | number | null> = {};
    for (const k of keys) out[k] = row[k] ?? null;
    return out;
  });
}

export function columnsForReport(id: HrReportId): HrReportColumn[] {
  switch (id) {
    case "employee_master":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "status", header: "Status" },
        { key: "jobTitle", header: "Designation" },
        { key: "department", header: "Department" },
        { key: "location", header: "Location" },
        { key: "category", header: "Category" },
        { key: "hireDate", header: "Hire date" },
        { key: "qid", header: "QID", sensitive: "identity" },
        { key: "basicSalary", header: "Basic salary", sensitive: "salary" },
      ];
    case "employee_history":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "eventType", header: "Event" },
        { key: "effectiveOn", header: "Effective on" },
        { key: "detail", header: "Detail" },
      ];
    case "document_expiry":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "docType", header: "Document" },
        { key: "expiryDate", header: "Expiry" },
        { key: "status", header: "Status" },
        { key: "docRef", header: "Ref", sensitive: "identity" },
      ];
    case "missing_document":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "location", header: "Location" },
        { key: "missing", header: "Missing" },
      ];
    case "warning_disciplinary":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "level", header: "Level" },
        { key: "category", header: "Category" },
        { key: "status", header: "Status" },
        { key: "issuedOn", header: "Issued" },
        { key: "validUntil", header: "Valid until" },
      ];
    case "probation":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "probationEnd", header: "Probation end" },
        { key: "reviewStatus", header: "Review" },
        { key: "decision", header: "Decision" },
      ];
    case "leave_balance":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "leaveType", header: "Type" },
        { key: "allotted", header: "Allotted" },
        { key: "used", header: "Used" },
        { key: "remaining", header: "Remaining" },
        { key: "pending", header: "Pending" },
      ];
    case "ot":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "workDate", header: "Work date" },
        { key: "minutes", header: "Minutes" },
        { key: "rateType", header: "Rate" },
        { key: "status", header: "Status" },
        { key: "amountQar", header: "Amount QAR", sensitive: "salary" },
      ];
    case "payroll":
      return [
        { key: "period", header: "Period" },
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "paymentMethod", header: "Payment" },
        { key: "grossQar", header: "Gross", sensitive: "salary" },
        { key: "netQar", header: "Net", sensitive: "salary" },
        { key: "qid", header: "QID", sensitive: "identity" },
        { key: "status", header: "Status" },
      ];
    case "loan_deduction":
      return [
        { key: "note", header: "Note" },
        { key: "status", header: "Status" },
      ];
    case "bonus_commission":
      return [
        { key: "note", header: "Note" },
        { key: "status", header: "Status" },
      ];
    case "air_ticket":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "eligibilityOn", header: "Eligibility" },
        { key: "status", header: "Status" },
        { key: "expiryOn", header: "Expiry" },
      ];
    case "resignation_termination":
      return [
        { key: "employeeCode", header: "Employee code" },
        { key: "fullName", header: "Name" },
        { key: "kind", header: "Kind" },
        { key: "status", header: "Status" },
        { key: "effectiveOn", header: "Effective" },
        { key: "lastWorkingDate", header: "Last working day" },
      ];
    case "recruitment_funnel":
      return [
        { key: "vacancy", header: "Vacancy" },
        { key: "stage", header: "Stage" },
        { key: "count", header: "Count" },
      ];
    case "time_to_hire":
      return [
        { key: "vacancy", header: "Vacancy" },
        { key: "candidate", header: "Candidate" },
        { key: "appliedOn", header: "Applied" },
        { key: "joinedOn", header: "Joined" },
        { key: "days", header: "Days" },
      ];
    case "candidate_source":
      return [
        { key: "source", header: "Source" },
        { key: "count", header: "Count" },
      ];
    case "location_quota":
    case "department_quota":
      return [
        { key: "scope", header: "Scope" },
        { key: "approved", header: "Approved" },
        { key: "active", header: "Active" },
        { key: "variance", header: "Variance" },
      ];
    case "headcount_movement":
      return [
        { key: "period", header: "Period" },
        { key: "joined", header: "Joined" },
        { key: "left", header: "Left" },
        { key: "net", header: "Net" },
        { key: "location", header: "Location" },
      ];
    default:
      return [{ key: "note", header: "Note" }];
  }
}

export function stubRowsForReport(id: HrReportId): Array<Record<string, string | number | null>> {
  if (id === "loan_deduction") {
    return [
      {
        note: "Loan product not configured — stub only (Phase 11).",
        status: "stub",
      },
    ];
  }
  if (id === "bonus_commission") {
    return [
      {
        note: "Bonus/commission product not configured — stub only (Phase 11).",
        status: "stub",
      },
    ];
  }
  return [];
}

export type HrReportFilterInput = {
  dateFrom?: string | null;
  dateTo?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
  employeeId?: string | null;
  category?: string | null;
  designation?: string | null;
  status?: string | null;
};

/** Inclusive YMD filter helpers for report builders. */
export function inDateRange(
  value: string | null | undefined,
  from?: string | null,
  to?: string | null,
): boolean {
  if (!value) return !(from || to);
  const v = value.slice(0, 10);
  if (from && v < from.slice(0, 10)) return false;
  if (to && v > to.slice(0, 10)) return false;
  return true;
}

export function matchesTextFilter(
  value: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (!filter || filter === "all") return true;
  return String(value ?? "").toLowerCase() === String(filter).toLowerCase();
}
