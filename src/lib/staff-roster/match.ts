import type {
  ExistingStaffForMatch,
  FieldDiff,
  MatchResult,
  ParsedRosterRow,
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
} from "./values";

function activeStaff(staff: ExistingStaffForMatch[]): ExistingStaffForMatch[] {
  return staff.filter((s) => !s.deleted_at);
}

function fuzzyCandidates(name: string, staff: ExistingStaffForMatch[]): ExistingStaffForMatch[] {
  const target = normalizeName(name);
  if (!target) return [];
  return activeStaff(staff).filter((s) => namesAreFuzzyMatch(name, s.full_name));
}

export function matchRosterRow(
  row: ParsedRosterRow,
  staff: ExistingStaffForMatch[],
  locationId: string | null,
): MatchResult {
  const warnings = [...row.warnings];

  if (!row.locationCode || !locationId) {
    return {
      action: "review",
      matchRule: "unmapped_location",
      staffId: null,
      candidates: [],
      warnings,
    };
  }

  if (!row.status) {
    warnings.push("Status is blank — defaulting to active");
  }

  const qid = row.qid;
  if (qid) {
    const hits = activeStaff(staff).filter((s) => {
      if (normalizeQid(s.qid) === qid) return true;
      // Dirty rows that stored QID in employee_code before backfill.
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

export function proposeStaffValues(
  row: ParsedRosterRow,
  existing: ExistingStaffForMatch | null,
  locationId: string | null,
  usedCodes: Set<string>,
): ProposedStaffValues {
  const qid = pickNonBlank(row.qid, existing?.qid ?? null);
  const existingCode = existing?.employee_code ?? "";
  let employeeCode = isPreservableEmployeeCode(existingCode, qid) ? existingCode : "";
  if (!employeeCode) {
    employeeCode = generateEmployeeCode(row.locationCode ?? existing?.location_code ?? "UNK", usedCodes, {
      staffRole: row.staffRole ?? existing?.staff_role,
      jobTitle: row.position ?? existing?.job_title,
    });
  } else {
    usedCodes.add(employeeCode);
  }

  const mappedStatus =
    row.status === "inactive" ? "terminated" : row.status === "on_leave" ? "on_leave" : row.status === "active" ? "active" : existing?.status ?? "active";

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
    status: mappedStatus,
    e3_enrolled: row.e3Enrolled === null ? (existing?.e3_enrolled ?? null) : row.e3Enrolled,
    employment_type: row.employmentType ?? (existing?.employment_type as ProposedStaffValues["employment_type"]) ?? null,
    staff_role: row.staffRole ?? (existing?.staff_role as ProposedStaffValues["staff_role"]) ?? null,
    source_row_no: row.sourceRowNo,
    monthly_salary_qar: row.monthlySalaryQar,
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
  ];
  if (includeSalary) {
    pairs.push(["monthly_salary_qar", existing?.monthly_salary_qar, proposed.monthly_salary_qar]);
  }
  for (const [field, oldValue, newValue] of pairs) {
    const oldS = scalar(oldValue as string | number | boolean | null);
    const newS = scalar(newValue as string | number | boolean | null);
    if (oldS !== newS) diffs.push({ field, oldValue: oldS, newValue: newS });
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
