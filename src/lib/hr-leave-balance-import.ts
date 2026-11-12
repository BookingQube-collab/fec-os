/**
 * Phase 4 skeleton — verified leave-balance CSV import (dry-run / upsert).
 *
 * Follow-up when HR delivers the consolidated tracker spreadsheet:
 * - Map employee_code (or QID) → staff_id
 * - Upsert hr_leave_balances with source stamp in notes / policy
 * - Optionally freeze auto-accrual overwrite when source=external_verified
 *
 * Do not invent balance rows. This module only parses/validates and can call
 * the existing upsertLeaveBalance action once staff resolves.
 */

export const LEAVE_BALANCE_IMPORT_COLUMNS = [
  "employee_code",
  "qid",
  "year",
  "leave_type",
  "allotted_days",
  "carried_forward",
  "used_days",
  "pending_days",
  "expired_days",
  "notes",
] as const;

export type LeaveBalanceImportColumn = (typeof LEAVE_BALANCE_IMPORT_COLUMNS)[number];

export type LeaveBalanceImportRow = {
  line: number;
  employeeCode: string | null;
  qid: string | null;
  year: number;
  leaveType: string;
  allottedDays: number;
  carriedForward: number;
  usedDays: number | null;
  pendingDays: number;
  expiredDays: number;
  notes: string | null;
};

export type LeaveBalanceImportIssue = {
  line: number;
  code: "missing_identity" | "bad_year" | "bad_type" | "bad_number" | "empty_row";
  message: string;
};

export type LeaveBalanceImportDryRun = {
  rows: LeaveBalanceImportRow[];
  issues: LeaveBalanceImportIssue[];
  okCount: number;
  issueCount: number;
};

const ALLOWED_TYPES = new Set([
  "annual",
  "sick",
  "unpaid",
  "emergency",
  "maternity",
  "hajj",
  "compassionate",
  "comp_off",
  "other",
]);

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function numOrNull(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dry-run parse of a CSV body. Does not touch the database.
 * Header row must include employee_code or qid, year, leave_type, allotted_days.
 */
export function dryRunLeaveBalanceCsv(csvText: string): LeaveBalanceImportDryRun {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], issues: [{ line: 0, code: "empty_row", message: "CSV is empty" }], okCount: 0, issueCount: 1 };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (name: string) => header.indexOf(name);

  const rows: LeaveBalanceImportRow[] = [];
  const issues: LeaveBalanceImportIssue[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    const employeeCode = idx("employee_code") >= 0 ? cells[idx("employee_code")] || null : null;
    const qid = idx("qid") >= 0 ? cells[idx("qid")] || null : null;
    const yearRaw = idx("year") >= 0 ? cells[idx("year")] : "";
    const leaveType = (idx("leave_type") >= 0 ? cells[idx("leave_type")] : "").trim().toLowerCase();
    const allotted = numOrNull(idx("allotted_days") >= 0 ? cells[idx("allotted_days")] : undefined);
    const carried = numOrNull(idx("carried_forward") >= 0 ? cells[idx("carried_forward")] : undefined) ?? 0;
    const used = numOrNull(idx("used_days") >= 0 ? cells[idx("used_days")] : undefined);
    const pending = numOrNull(idx("pending_days") >= 0 ? cells[idx("pending_days")] : undefined) ?? 0;
    const expired = numOrNull(idx("expired_days") >= 0 ? cells[idx("expired_days")] : undefined) ?? 0;
    const notes = idx("notes") >= 0 ? cells[idx("notes")] || null : null;

    if (!employeeCode && !qid) {
      issues.push({
        line: lineNo,
        code: "missing_identity",
        message: "Need employee_code or qid",
      });
      continue;
    }
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      issues.push({ line: lineNo, code: "bad_year", message: `Invalid year: ${yearRaw}` });
      continue;
    }
    if (!ALLOWED_TYPES.has(leaveType)) {
      issues.push({ line: lineNo, code: "bad_type", message: `Invalid leave_type: ${leaveType}` });
      continue;
    }
    if (allotted == null || allotted < 0) {
      issues.push({ line: lineNo, code: "bad_number", message: "allotted_days must be a non-negative number" });
      continue;
    }

    rows.push({
      line: lineNo,
      employeeCode,
      qid,
      year,
      leaveType,
      allottedDays: allotted,
      carriedForward: carried,
      usedDays: used,
      pendingDays: pending,
      expiredDays: expired,
      notes: notes ? `external_verified: ${notes}` : "external_verified",
    });
  }

  return {
    rows,
    issues,
    okCount: rows.length,
    issueCount: issues.length,
  };
}

/** CSV template header for HR to fill (no sample balance data). */
export function leaveBalanceImportTemplateCsv(): string {
  return `${LEAVE_BALANCE_IMPORT_COLUMNS.join(",")}\n`;
}
