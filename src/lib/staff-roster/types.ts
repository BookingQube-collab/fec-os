export const ROSTER_WORKSHEET_TITLE = "Employee Roster";

export const ROSTER_IMPORT_MODES = ["safe_sync", "authoritative_replace"] as const;
export type RosterImportMode = (typeof ROSTER_IMPORT_MODES)[number];

export const ROSTER_ROW_ACTIONS = [
  "create",
  "update",
  "unchanged",
  "archive",
  "delete",
  "review",
] as const;
export type RosterRowAction = (typeof ROSTER_ROW_ACTIONS)[number];

export type StaffRoleValue =
  | "venue_supervisor"
  | "shift_lead"
  | "crew"
  | "technician"
  | "cashier"
  | "cleaner"
  | "security"
  | "other";

export type EmploymentType = "permanent" | "temporary";

export type ParsedRosterRow = {
  rowNumber: number;
  sourceRowNo: number | null;
  locationLabel: string;
  locationCode: string | null;
  fullName: string;
  e3Raw: string;
  e3Enrolled: boolean | null;
  employmentTypeRaw: string;
  employmentType: EmploymentType | null;
  salaryRaw: string;
  monthlySalaryQar: number | null;
  qidRaw: string;
  qid: string | null;
  activity: string | null;
  position: string | null;
  staffRole: StaffRoleValue | null;
  contactRaw: string;
  contactDisplay: string | null;
  contactMatch: string | null;
  joiningDateRaw: string;
  hireDate: string | null;
  statusRaw: string;
  status: "active" | "inactive" | "on_leave" | null;
  warnings: string[];
  errors: string[];
  emptyTemplate: boolean;
};

export type RosterColumnKey =
  | "source_row_no"
  | "location"
  | "full_name"
  | "e3"
  | "employment_type"
  | "salary"
  | "qid"
  | "activity"
  | "position"
  | "contact"
  | "joining_date"
  | "status";

export type RosterParseResult = {
  worksheetName: string | null;
  headers: string[];
  mapping: Partial<Record<RosterColumnKey, string>>;
  rows: ParsedRosterRow[];
  skippedEmpty: number;
  errors: Array<{ rowNumber: number; code: string; message: string }>;
};

export type MatchRule =
  | "qid"
  | "contact_name"
  | "name_location"
  | "qid_name_conflict"
  | "qid_ambiguous"
  | "contact_ambiguous"
  | "name_ambiguous"
  | "fuzzy_name"
  | "unmapped_location"
  | "blank_status"
  | "qid_unmatched"
  | "create"
  | "none";

export type ExistingStaffForMatch = {
  id: string;
  employee_code: string;
  full_name: string;
  qid: string | null;
  phone: string | null;
  location_id: string;
  location_code?: string | null;
  status: string;
  deleted_at: string | null;
  job_title: string | null;
  department: string | null;
  hire_date: string | null;
  e3_enrolled: boolean | null;
  employment_type: string | null;
  staff_role: string | null;
  is_roaming?: boolean | null;
  monthly_salary_qar?: number | null;
};

export type FieldDiff = {
  field: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
};

export type MatchResult = {
  action: RosterRowAction;
  matchRule: MatchRule;
  staffId: string | null;
  candidates: ExistingStaffForMatch[];
  warnings: string[];
};

export type ProposedStaffValues = {
  employee_code: string;
  full_name: string;
  qid: string | null;
  phone: string | null;
  location_code: string | null;
  location_id: string | null;
  job_title: string | null;
  department: string | null;
  hire_date: string | null;
  status: string;
  e3_enrolled: boolean | null;
  employment_type: EmploymentType | null;
  staff_role: StaffRoleValue | null;
  source_row_no: number | null;
  monthly_salary_qar: number | null;
};

export type PreviewLine = {
  rowNumber: number;
  action: RosterRowAction;
  matchRule: string | null;
  matchStaffId: string | null;
  fullName: string;
  locationCode: string | null;
  warnings: string[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  fieldDiffs: FieldDiff[];
  referenced?: boolean;
};

export type RosterPreview = {
  mode: RosterImportMode;
  canHardDelete: boolean;
  counts: {
    create: number;
    update: number;
    unchanged: number;
    archive: number;
    delete: number;
    review: number;
    skippedEmpty: number;
  };
  rows: PreviewLine[];
  missing: PreviewLine[];
  mapping: Record<string, string>;
  worksheetName: string | null;
  errors: Array<{ rowNumber: number; code: string; message: string }>;
};

export const STAFF_REFERENCE_TABLES = [
  "shifts",
  "attendance_logs",
  "attendance_daily_summary",
  "attendance_exceptions",
  "training_enrollments",
  "kpi_scores",
  "kpi_assignments",
  "sop_assignments",
] as const;
