import type {
  ExistingStaffForMatch,
  FieldDiff,
  MatchResult,
  ParsedRosterRow,
  ProposedProfileExt,
  ProposedStaffValues,
} from "./types";
import {
  generateEmployeeCode,
  isPreservableEmployeeCode,
  isQidShapedCode,
  namesAreFuzzyMatch,
  normalizeName,
  normalizePhoneMatch,
  normalizeQid,
  pickNonBlank,
  statusFromE3Sheet,
} from "./values";

function activeStaff(staff: ExistingStaffForMatch[]): ExistingStaffForMatch[] {
  return staff.filter((s) => !s.deleted_at);
}

function fuzzyCandidates(name: string, staff: ExistingStaffForMatch[]): ExistingStaffForMatch[] {
  const target = normalizeName(name);
  if (!target) return [];
  return activeStaff(staff).filter((s) => namesAreFuzzyMatch(name, s.full_name));
}

function normalizeCode(value: string | null | undefined): string | null {
  const s = (value ?? "").trim().toLowerCase();
  return s || null;
}

/**
 * Match priority: Employee Code → QID → contact+name → name+location → fuzzy review.
 * Blank Excel cells never wipe existing values (see proposeStaffValues / pickNonBlank).
 */
export function matchRosterRow(
  row: ParsedRosterRow,
  staff: ExistingStaffForMatch[],
  locationId: string | null,
): MatchResult {
  const warnings = [...row.warnings];
  const hasStrongId = Boolean(row.employeeCode || row.qid);

  if (!row.locationCode || !locationId) {
    if (!hasStrongId) {
      return {
        action: "review",
        matchRule: "unmapped_location",
        staffId: null,
        candidates: [],
        warnings,
      };
    }
    warnings.push("Location unmapped — matching by employee code / QID only");
  }

  if (!row.status) {
    warnings.push("Status is blank — defaulting from sheet or active");
  }

  const code = normalizeCode(row.employeeCode);
  if (code) {
    const hits = activeStaff(staff).filter((s) => normalizeCode(s.employee_code) === code);
    if (hits.length === 1) {
      return { action: "update", matchRule: "employee_code", staffId: hits[0].id, candidates: hits, warnings };
    }
    if (hits.length > 1) {
      return {
        action: "review",
        matchRule: "employee_code_ambiguous",
        staffId: null,
        candidates: hits,
        warnings,
      };
    }
  }

  const qid = row.qid;
  if (qid) {
    const hits = activeStaff(staff).filter((s) => {
      if (normalizeQid(s.qid) === qid) return true;
      return isQidShapedCode(s.employee_code) && normalizeQid(s.employee_code) === qid;
    });
    if (hits.length === 1) {
      const existingName = normalizeName(hits[0].full_name);
      const incomingName = normalizeName(row.fullName);
      if (existingName && incomingName && existingName !== incomingName) {
        warnings.push("Same QID — updating name to the sheet spelling");
      }
      return { action: "update", matchRule: "qid", staffId: hits[0].id, candidates: hits, warnings };
    }
    if (hits.length > 1) {
      return {
        action: "review",
        matchRule: "qid_ambiguous",
        staffId: null,
        candidates: hits,
        warnings,
      };
    }
    return { action: "create", matchRule: "qid_unmatched", staffId: null, candidates: [], warnings };
  }

  const phone = row.contactMatch;
  const name = normalizeName(row.fullName);
  if (phone && name) {
    const hits = activeStaff(staff).filter((s) => {
      return normalizePhoneMatch(s.phone) === phone && normalizeName(s.full_name) === name;
    });
    if (hits.length === 1) {
      return { action: "update", matchRule: "contact_name", staffId: hits[0].id, candidates: hits, warnings };
    }
    if (hits.length > 1) {
      return { action: "review", matchRule: "contact_ambiguous", staffId: null, candidates: hits, warnings };
    }
    const fuzzy = fuzzyCandidates(row.fullName, staff);
    if (fuzzy.length) {
      return { action: "review", matchRule: "fuzzy_name", staffId: null, candidates: fuzzy, warnings };
    }
    return { action: "create", matchRule: "create", staffId: null, candidates: [], warnings };
  }

  if (name && locationId && !qid && !phone) {
    const hits = activeStaff(staff).filter((s) => {
      return normalizeName(s.full_name) === name && s.location_id === locationId;
    });
    if (hits.length === 1) {
      return { action: "update", matchRule: "name_location", staffId: hits[0].id, candidates: hits, warnings };
    }
    if (hits.length > 1) {
      return { action: "review", matchRule: "name_ambiguous", staffId: null, candidates: hits, warnings };
    }
  }

  const fuzzy = fuzzyCandidates(row.fullName, staff);
  if (fuzzy.length) {
    return { action: "review", matchRule: "fuzzy_name", staffId: null, candidates: fuzzy, warnings };
  }

  return { action: "create", matchRule: "create", staffId: null, candidates: [], warnings };
}

function mapStatus(row: ParsedRosterRow, existing: ExistingStaffForMatch | null): string {
  if (row.status === "inactive") return "terminated";
  if (row.status) return row.status;
  if (row.sheetSource && row.sheetSource !== "Employee Roster") {
    return statusFromE3Sheet(row.sheetSource).status;
  }
  return existing?.status ?? "active";
}

function buildProfileExt(row: ParsedRosterRow): ProposedProfileExt | null {
  const hasAny =
    row.nationality ||
    row.gender ||
    row.dateOfBirth ||
    row.qidExpiry ||
    row.passportNumber ||
    row.passportExpiry ||
    row.sponsorship ||
    row.ticketEligibility != null ||
    row.ticketEligibilityMonths != null ||
    row.ticketAmount != null ||
    row.notes;
  if (!hasAny) return null;
  return {
    nationality: row.nationality,
    gender: row.gender,
    date_of_birth: row.dateOfBirth,
    qid_expiry: row.qidExpiry,
    passport_number: row.passportNumber,
    passport_expiry: row.passportExpiry,
    sponsorship_info: row.sponsorship,
    ticket_eligibility: row.ticketEligibility,
    ticket_eligibility_months: row.ticketEligibilityMonths,
    ticket_amount: row.ticketAmount,
    notes: row.notes,
  };
}

export function proposeStaffValues(
  row: ParsedRosterRow,
  existing: ExistingStaffForMatch | null,
  locationId: string | null,
  usedCodes: Set<string>,
): ProposedStaffValues {
  const qid = pickNonBlank(row.qid, existing?.qid ?? null);
  const incomingCode = row.employeeCode?.trim() || "";
  const existingCode = existing?.employee_code ?? "";
  let employeeCode = "";
  if (incomingCode && !isQidShapedCode(incomingCode) && incomingCode !== (qid ?? "")) {
    employeeCode = incomingCode;
    usedCodes.add(employeeCode);
  } else if (isPreservableEmployeeCode(existingCode, qid)) {
    employeeCode = existingCode;
    usedCodes.add(employeeCode);
  } else {
    employeeCode = generateEmployeeCode(row.locationCode ?? existing?.location_code ?? "UNK", usedCodes, {
      staffRole: row.staffRole ?? existing?.staff_role,
      jobTitle: row.position ?? existing?.job_title,
    });
  }

  const sheetDefaults =
    row.sheetSource && row.sheetSource !== "Employee Roster" ? statusFromE3Sheet(row.sheetSource) : null;
  const employmentType =
    row.employmentType ??
    sheetDefaults?.employmentType ??
    (existing?.employment_type as ProposedStaffValues["employment_type"]) ??
    null;

  let isRoaming: boolean | null = sheetDefaults?.isRoaming ?? null;
  if (isRoaming == null && existing?.is_roaming != null) isRoaming = existing.is_roaming;

  return {
    employee_code: employeeCode,
    full_name: pickNonBlank(row.fullName, existing?.full_name ?? null) ?? row.fullName,
    qid,
    phone: pickNonBlank(row.contactDisplay, existing?.phone ?? null),
    location_code: row.locationCode,
    location_id: locationId,
    job_title: pickNonBlank(row.position, existing?.job_title ?? null),
    department: pickNonBlank(row.activity, existing?.department ?? null),
    hire_date: pickNonBlank(row.hireDate, existing?.hire_date ?? null),
    status: mapStatus(row, existing),
    e3_enrolled: row.e3Enrolled === null ? (existing?.e3_enrolled ?? null) : row.e3Enrolled,
    employment_type: employmentType,
    staff_role: row.staffRole ?? (existing?.staff_role as ProposedStaffValues["staff_role"]) ?? null,
    source_row_no: row.sourceRowNo,
    monthly_salary_qar: row.monthlySalaryQar,
    is_roaming: isRoaming,
    profile_ext: buildProfileExt(row),
  };
}

function scalar(value: string | number | boolean | null | undefined): string | number | boolean | null {
  if (value == null || value === "") return null;
  return value;
}

export function diffStaffFields(
  existing: ExistingStaffForMatch | null,
  proposed: ProposedStaffValues,
  includeSalary: boolean,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const pairs: Array<[string, string | number | boolean | null | undefined, string | number | boolean | null | undefined]> = [
    ["employee_code", existing?.employee_code, proposed.employee_code],
    ["full_name", existing?.full_name, proposed.full_name],
    ["qid", existing?.qid, proposed.qid],
    ["phone", existing?.phone, proposed.phone],
    ["job_title", existing?.job_title, proposed.job_title],
    ["department", existing?.department, proposed.department],
    ["hire_date", existing?.hire_date, proposed.hire_date],
    ["status", existing?.status, proposed.status],
    ["e3_enrolled", existing?.e3_enrolled, proposed.e3_enrolled],
    ["employment_type", existing?.employment_type, proposed.employment_type],
    ["staff_role", existing?.staff_role, proposed.staff_role],
    ["location_id", existing?.location_id, proposed.location_id],
    ["is_roaming", existing?.is_roaming, proposed.is_roaming],
  ];
  if (includeSalary) {
    pairs.push(["monthly_salary_qar", existing?.monthly_salary_qar, proposed.monthly_salary_qar]);
  }
  for (const [field, oldValue, newValue] of pairs) {
    const oldS = scalar(oldValue as string | number | boolean | null);
    const newS = scalar(newValue as string | number | boolean | null);
    if (oldS !== newS) diffs.push({ field, oldValue: oldS, newValue: newS });
  }
  if (proposed.profile_ext) {
    diffs.push({
      field: "profile_ext",
      oldValue: null,
      newValue: "updated",
    });
  }
  return diffs;
}

export function salaryWouldWipe(
  existingSalary: number | null | undefined,
  incomingSalary: number | null | undefined,
): boolean {
  return incomingSalary == null && existingSalary != null;
}

export function resolveRowAction(
  match: MatchResult,
  diffs: FieldDiff[],
): MatchResult {
  if (match.action !== "update") return match;
  if (!diffs.length) return { ...match, action: "unchanged" };
  return match;
}
