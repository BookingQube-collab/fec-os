export const ROSTER_WORKSHEET_TITLE = "Employee Roster";

/** E3 Employee Masterfile 2026 sheet titles (membership drives status). */
export const E3_MASTERFILE_SHEETS = [
  "E3 - Active Employee",
  "Secondment Contract",
  "Resigned-Terminated",
  "Remote Staff",
] as const;
export type E3MasterfileSheet = (typeof E3_MASTERFILE_SHEETS)[number];

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

export type EmploymentType = "permanent" | "temporary" | "secondment" | "joker";

/** Directory / E3 employment statuses stored on staff.status */
export type StaffDirectoryStatus =
  | "active"
  | "probation"
  | "secondment"
  | "remote"
  | "vacation"
  | "sick_leave"
  | "unpaid_leave"
  | "on_leave"
  | "resigned"
  | "terminated"
  | "released"
  | "serving_notice"
  | "inactive";

export type ParsedRosterRow = {
  rowNumber: number;
  sourceRowNo: number | null;
  locationLabel: string;
  locationCode: string | null;
  fullName: string;
  employeeCode: string | null;
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
  status: StaffDirectoryStatus | null;
  /** Sheet that produced this row (E3 multi-sheet). */
  sheetSource: E3MasterfileSheet | "Employee Roster" | null;
  sponsorship: string | null;
  nationality: string | null;
  gender: string | null;
  dateOfBirthRaw: string;
  dateOfBirth: string | null;
  qidExpiryRaw: string;
  qidExpiry: string | null;
  passportNumber: string | null;
  passportIssueDate: string | null;
  passportExpiryRaw: string;
  passportExpiry: string | null;
  ticketEligibility: boolean | null;
  ticketEligibilityMonths: number | null;
  ticketAmount: number | null;
  notes: string | null;
  warnings: string[];
  errors: string[];
  emptyTemplate: boolean;
};

export type RosterColumnKey =
  | "source_row_no"
  | "location"
  | "full_name"
  | "employee_code"
  | "e3"
  | "employment_type"
  | "salary"
  | "qid"
  | "qid_expiry"
  | "activity"
  | "position"
  | "contact"
  | "joining_date"
  | "status"
  | "sponsorship"
  | "nationality"
  | "gender"
  | "date_of_birth"
  | "passport_number"
  | "passport_expiry"
  | "ticket_eligibility"
  | "ticket_months"
  | "ticket_amount"
  | "notes";

export type RosterParseResult = {
  worksheetName: string | null;
  headers: string[];
  mapping: Partial<Record<RosterColumnKey, string>>;
  rows: ParsedRosterRow[];
  skippedEmpty: number;
  errors: Array<{ rowNumber: number; code: string; message: string }>;
};

export type MatchRule =
  | "employee_code"
  | "employee_code_ambiguous"
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
  daily_rate_qar?: number | null;
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
  is_roaming: boolean | null;
  profile_ext: ProposedProfileExt | null;
};

export type ProposedProfileExt = {
  nationality: string | null;
  gender: string | null;
  date_of_birth: string | null;
  qid_expiry: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  sponsorship_info: string | null;
  ticket_eligibility: boolean | null;
  ticket_eligibility_months: number | null;
  ticket_amount: number | null;
  notes: string | null;
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
