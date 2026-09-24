/**
 * Match imported payroll rows to Employee Master without creating duplicates.
 * Priority: Employee Code → QID → exact name → fuzzy name (review if ambiguous).
 */

import { normalizePayrollName, type ParsedPayrollImportRow } from "@/lib/hr-payroll-import";
import { namesAreFuzzyMatch, normalizeQid } from "@/lib/staff-roster/values";

export type PayrollMatchStaff = {
  id: string;
  employee_code: string | null;
  full_name: string;
  qid: string | null;
  deleted_at?: string | null;
};

export type PayrollMatchRule =
  | "employee_code"
  | "qid"
  | "name_exact"
  | "name_fuzzy"
  | "unmatched"
  | "ambiguous";

export type PayrollMatchResult = {
  staffId: string | null;
  matchRule: PayrollMatchRule;
  confidence: "high" | "medium" | "low" | "none";
  candidates: PayrollMatchStaff[];
  warnings: string[];
};

function active(staff: PayrollMatchStaff[]): PayrollMatchStaff[] {
  return staff.filter((s) => !s.deleted_at);
}

function normCode(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s || null;
}

/**
 * Match one import row to staff. Does not create employees.
 * Numeric Excel "codes" (legacy Sr) only match when employee_code is that exact string.
 */
export function matchPayrollImportRow(
  row: Pick<ParsedPayrollImportRow, "employeeCode" | "employeeName" | "qid">,
  staff: PayrollMatchStaff[],
): PayrollMatchResult {
  const warnings: string[] = [];
  const pool = active(staff);

  const code = normCode(row.employeeCode);
  if (code) {
    const hits = pool.filter((s) => normCode(s.employee_code) === code);
    if (hits.length === 1) {
      return {
        staffId: hits[0]!.id,
        matchRule: "employee_code",
        confidence: "high",
        candidates: hits,
        warnings,
      };
    }
    if (hits.length > 1) {
      return {
        staffId: null,
        matchRule: "ambiguous",
        confidence: "none",
        candidates: hits,
        warnings: [...warnings, "Multiple staff share this employee code"],
      };
    }
  }

  const qid = normalizeQid(row.qid);
  if (qid) {
    const hits = pool.filter((s) => normalizeQid(s.qid) === qid);
    if (hits.length === 1) {
      return {
        staffId: hits[0]!.id,
        matchRule: "qid",
        confidence: "high",
        candidates: hits,
        warnings,
      };
    }
    if (hits.length > 1) {
      return {
        staffId: null,
        matchRule: "ambiguous",
        confidence: "none",
        candidates: hits,
        warnings: [...warnings, "Multiple staff share this QID"],
      };
    }
  }

  const target = normalizePayrollName(row.employeeName);
  if (target) {
    const exact = pool.filter((s) => normalizePayrollName(s.full_name) === target);
    if (exact.length === 1) {
      return {
        staffId: exact[0]!.id,
        matchRule: "name_exact",
        confidence: "high",
        candidates: exact,
        warnings,
      };
    }
    if (exact.length > 1) {
      return {
        staffId: null,
        matchRule: "ambiguous",
        confidence: "none",
        candidates: exact,
        warnings: [...warnings, "Multiple staff share this exact name"],
      };
    }

    const fuzzy = pool.filter((s) => namesAreFuzzyMatch(row.employeeName, s.full_name));
    if (fuzzy.length === 1) {
      return {
        staffId: fuzzy[0]!.id,
        matchRule: "name_fuzzy",
        confidence: "medium",
        candidates: fuzzy,
        warnings: [...warnings, "Matched by fuzzy name — confirm before commit"],
      };
    }
    if (fuzzy.length > 1) {
      return {
        staffId: null,
        matchRule: "ambiguous",
        confidence: "none",
        candidates: fuzzy.slice(0, 8),
        warnings: [...warnings, "Ambiguous fuzzy name match"],
      };
    }
  }

  return {
    staffId: null,
    matchRule: "unmatched",
    confidence: "none",
    candidates: [],
    warnings: [...warnings, "No Employee Master match — will not create a duplicate"],
  };
}

export function matchAllPayrollImportRows(
  rows: ParsedPayrollImportRow[],
  staff: PayrollMatchStaff[],
): Array<ParsedPayrollImportRow & { match: PayrollMatchResult }> {
  const used = new Set<string>();
  const out: Array<ParsedPayrollImportRow & { match: PayrollMatchResult }> = [];
  for (const row of rows) {
    let match = matchPayrollImportRow(row, staff);
    // Prefer unused staff when fuzzy produces a duplicate pick
    if (match.staffId && used.has(match.staffId) && match.matchRule !== "employee_code" && match.matchRule !== "qid") {
      const alt = match.candidates.find((c) => !used.has(c.id));
      if (alt) {
        match = { ...match, staffId: alt.id, warnings: [...match.warnings, "Reassigned to unused fuzzy candidate"] };
      } else {
        match = {
          staffId: null,
          matchRule: "ambiguous",
          confidence: "none",
          candidates: match.candidates,
          warnings: [...match.warnings, "Staff already matched to another import row"],
        };
      }
    }
    if (match.staffId) used.add(match.staffId);
    out.push({ ...row, match });
  }
  return out;
}
