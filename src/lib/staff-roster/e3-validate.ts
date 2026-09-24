/**
 * Pure validation for E3 / directory import rows (duplicate keys, dates, mandatory).
 * Used by preview and the runnable self-check.
 */

import type { ParsedRosterRow } from "./types";

export type E3ValidationIssue = {
  rowNumber: number;
  code:
    | "missing_name"
    | "missing_position"
    | "missing_status"
    | "missing_location"
    | "duplicate_code"
    | "duplicate_qid"
    | "duplicate_passport"
    | "invalid_date"
    | "passport_expiry_before_issue"
    | "conflict";
  message: string;
  field?: string;
};

export type E3AuditBucket =
  | "created"
  | "updated"
  | "unchanged"
  | "duplicates_conflicts"
  | "invalid"
  | "missing_mandatory";

function normKey(value: string | null | undefined): string | null {
  const s = (value ?? "").trim().toLowerCase();
  return s || null;
}

/** Passport expiry must not precede issue when both present. */
export function passportDatesValid(
  issue: string | null | undefined,
  expiry: string | null | undefined,
): boolean {
  if (!issue?.trim() || !expiry?.trim()) return true;
  return expiry.slice(0, 10) >= issue.slice(0, 10);
}

/**
 * Validate a set of parsed rows before commit.
 * Does not touch the DB — surfaces conflicts for HR resolution.
 */
export function validateE3ImportRows(rows: ParsedRosterRow[]): E3ValidationIssue[] {
  const issues: E3ValidationIssue[] = [];
  const codeHits = new Map<string, number[]>();
  const qidHits = new Map<string, number[]>();
  const passportHits = new Map<string, number[]>();

  for (const row of rows) {
    if (!row.fullName?.trim()) {
      issues.push({
        rowNumber: row.rowNumber,
        code: "missing_name",
        message: "Employee name is required",
        field: "full_name",
      });
    }
    if (!row.position?.trim()) {
      issues.push({
        rowNumber: row.rowNumber,
        code: "missing_position",
        message: "Position / designation is required",
        field: "position",
      });
    }
    if (!row.status && !row.statusRaw?.trim() && !row.sheetSource) {
      issues.push({
        rowNumber: row.rowNumber,
        code: "missing_status",
        message: "Employment status is required",
        field: "status",
      });
    }
    const operational =
      row.status !== "resigned" &&
      row.status !== "terminated" &&
      row.status !== "released" &&
      row.status !== "inactive";
    if (operational && !row.locationCode && !row.locationLabel?.trim()) {
      issues.push({
        rowNumber: row.rowNumber,
        code: "missing_location",
        message: "Location of work is required for operational employees",
        field: "location",
      });
    }

    if (row.employeeCode) {
      const k = normKey(row.employeeCode)!;
      const list = codeHits.get(k) ?? [];
      list.push(row.rowNumber);
      codeHits.set(k, list);
    }
    if (row.qid) {
      const k = normKey(row.qid)!;
      const list = qidHits.get(k) ?? [];
      list.push(row.rowNumber);
      qidHits.set(k, list);
    }
    if (row.passportNumber) {
      const k = normKey(row.passportNumber)!;
      const list = passportHits.get(k) ?? [];
      list.push(row.rowNumber);
      passportHits.set(k, list);
    }

    if (row.passportIssueDate || row.passportExpiry) {
      if (!passportDatesValid(row.passportIssueDate, row.passportExpiry)) {
        issues.push({
          rowNumber: row.rowNumber,
          code: "passport_expiry_before_issue",
          message: "Passport expiry is before issue date",
          field: "passport_expiry",
        });
      }
    }

    for (const [field, iso, raw] of [
      ["hire_date", row.hireDate, row.joiningDateRaw],
      ["date_of_birth", row.dateOfBirth, row.dateOfBirthRaw],
      ["qid_expiry", row.qidExpiry, row.qidExpiryRaw],
      ["passport_expiry", row.passportExpiry, row.passportExpiryRaw],
    ] as const) {
      if (raw?.trim() && !iso) {
        issues.push({
          rowNumber: row.rowNumber,
          code: "invalid_date",
          message: `Invalid ${field.replace(/_/g, " ")} "${raw}"`,
          field,
        });
      }
    }
  }

  for (const [key, nums] of codeHits) {
    if (nums.length < 2) continue;
    for (const rowNumber of nums) {
      issues.push({
        rowNumber,
        code: "duplicate_code",
        message: `Duplicate employee code "${key}" in file (rows ${nums.join(", ")})`,
        field: "employee_code",
      });
    }
  }
  for (const [key, nums] of qidHits) {
    if (nums.length < 2) continue;
    for (const rowNumber of nums) {
      issues.push({
        rowNumber,
        code: "duplicate_qid",
        message: `Duplicate QID "${key}" in file (rows ${nums.join(", ")})`,
        field: "qid",
      });
    }
  }
  for (const [key, nums] of passportHits) {
    if (nums.length < 2) continue;
    for (const rowNumber of nums) {
      issues.push({
        rowNumber,
        code: "duplicate_passport",
        message: `Duplicate passport "${key}" in file (rows ${nums.join(", ")})`,
        field: "passport_number",
      });
    }
  }

  return issues;
}

export function bucketE3Issue(code: E3ValidationIssue["code"]): E3AuditBucket {
  if (
    code === "duplicate_code" ||
    code === "duplicate_qid" ||
    code === "duplicate_passport" ||
    code === "conflict"
  ) {
    return "duplicates_conflicts";
  }
  if (
    code === "missing_name" ||
    code === "missing_position" ||
    code === "missing_status" ||
    code === "missing_location"
  ) {
    return "missing_mandatory";
  }
  return "invalid";
}
