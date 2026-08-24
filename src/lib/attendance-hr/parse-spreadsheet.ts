import { parseCsv } from "@/lib/csv-parse";

import { MAX_IMPORT_ROWS, type ParsedBiometricUser, type ParsedPunch, type ParseIssue } from "./constants";
import { parsePunchTimestamp } from "./parse-attlog";

export type SpreadsheetKind = "users" | "punches" | "mixed" | "unknown";

export type SpreadsheetParseResult = {
  kind: SpreadsheetKind;
  users: ParsedBiometricUser[];
  punches: ParsedPunch[];
  errors: ParseIssue[];
  headers: string[];
  mapping: Record<string, string>;
};

const USER_ID_HEADERS = ["user id", "userid", "user_id", "pin", "badge", "enrollnumber", "enroll id", "ac-no", "acno"];
const NAME_HEADERS = ["name", "employee name", "full name", "username", "user name"];
const TS_HEADERS = ["timestamp", "punch time", "datetime", "date time", "punch_at", "time"];
const DATE_HEADERS = ["date", "work date", "attendance date"];
const TIME_HEADERS = ["time", "clock time", "punch"];
const VERIFY_HEADERS = ["verify", "verification", "verification method"];
const STATUS_HEADERS = ["status", "in out", "in/out", "punch status", "state"];
const WORK_HEADERS = ["work code", "workcode", "work"];

function normHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findHeader(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.n === alias || h.n.replace(/\s/g, "") === alias.replace(/\s/g, ""));
    if (hit) return hit.raw;
  }
  return null;
}

function cell(row: Record<string, string>, key: string | null): string {
  if (!key) return "";
  return String(row[key] ?? "").trim();
}

export function parseDelimitedAttendance(text: string, delimiter?: "," | "\t"): SpreadsheetParseResult {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const useTab = delimiter === "\t" || (delimiter == null && firstLine.includes("\t") && !firstLine.includes(","));
  let rows: Record<string, string>[];
  if (useTab) {
    const lines = src.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) {
      return { kind: "unknown", users: [], punches: [], errors: [{ rowNumber: 0, code: "empty", message: "File is empty" }], headers: [], mapping: {} };
    }
    const headers = lines[0].split("\t").map((h) => h.trim());
    rows = lines.slice(1).map((line) => {
      const parts = line.split("\t");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (parts[i] ?? "").trim();
      });
      return obj;
    });
  } else {
    rows = parseCsv(src);
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      kind: "unknown",
      users: [],
      punches: [],
      errors: [
        {
          rowNumber: 0,
          code: "too_many_rows",
          message: `File has more than ${MAX_IMPORT_ROWS} data rows.`,
        },
      ],
      headers: [],
      mapping: {},
    };
  }

  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const userCol = findHeader(headers, USER_ID_HEADERS);
  const nameCol = findHeader(headers, NAME_HEADERS);
  const tsCol = findHeader(headers, TS_HEADERS);
  const dateCol = findHeader(headers, DATE_HEADERS);
  const timeCol = findHeader(headers, TIME_HEADERS);
  const verifyCol = findHeader(headers, VERIFY_HEADERS);
  const statusCol = findHeader(headers, STATUS_HEADERS);
  const workCol = findHeader(headers, WORK_HEADERS);

  const mapping: Record<string, string> = {};
  if (userCol) mapping.userId = userCol;
  if (nameCol) mapping.name = nameCol;
  if (tsCol) mapping.timestamp = tsCol;
  if (dateCol) mapping.date = dateCol;
  if (timeCol) mapping.time = timeCol;

  const users: ParsedBiometricUser[] = [];
  const punches: ParsedPunch[] = [];
  const errors: ParseIssue[] = [];
  const seenUsers = new Set<string>();

  const hasPunchCols = Boolean(tsCol || (dateCol && timeCol));
  const hasUserMaster = Boolean(userCol && nameCol && !hasPunchCols);
  const kind: SpreadsheetKind = hasPunchCols && nameCol ? "mixed" : hasPunchCols ? "punches" : hasUserMaster ? "users" : "unknown";

  if (!userCol) {
    errors.push({ rowNumber: 1, code: "missing_user_id", message: "Could not detect a User ID column." });
  }

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const biometricUserId = cell(row, userCol).replace(/\s+/g, "");
    const name = cell(row, nameCol);
    if (!biometricUserId) {
      if (Object.values(row).some((v) => v)) {
        errors.push({ rowNumber, code: "missing_user_id", message: "Missing User ID.", raw: JSON.stringify(row) });
      }
      return;
    }

    if (name && !seenUsers.has(biometricUserId)) {
      seenUsers.add(biometricUserId);
      users.push({ biometricUserId, name, recordOffset: rowNumber });
    }

    if (!hasPunchCols) return;

    let tsRaw = cell(row, tsCol);
    if (!tsRaw && dateCol) {
      const d = cell(row, dateCol);
      const t = cell(row, timeCol) || "00:00:00";
      tsRaw = `${d} ${t}`.trim();
    }
    if (!tsRaw) {
      errors.push({ rowNumber, code: "invalid_timestamp", message: "Missing punch timestamp.", raw: JSON.stringify(row) });
      return;
    }

    let punchAt = parsePunchTimestamp(tsRaw);
    if (!punchAt) {
      const parsed = new Date(tsRaw);
      punchAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    if (!punchAt) {
      errors.push({
        rowNumber,
        code: "invalid_timestamp",
        message: `Invalid timestamp "${tsRaw}".`,
        raw: JSON.stringify(row),
      });
      return;
    }

    punches.push({
      biometricUserId,
      punchAt,
      verifyMethod: toOptionalInt(cell(row, verifyCol)),
      inOutStatus: toOptionalInt(cell(row, statusCol)),
      workCode: toOptionalInt(cell(row, workCol)),
      reservedField: null,
      raw: JSON.stringify(row),
      rowNumber,
    });
  });

  if (kind === "unknown" && (users.length || punches.length)) {
    return { kind: punches.length ? "punches" : "users", users, punches, errors, headers, mapping };
  }

  return { kind, users, punches, errors, headers, mapping };
}

function toOptionalInt(value: string): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export async function parseWorkbookAttendance(buffer: Buffer): Promise<SpreadsheetParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { kind: "unknown", users: [], punches: [], errors: [{ rowNumber: 0, code: "empty", message: "Workbook has no sheets." }], headers: [], mapping: {} };
  }
  const sheet = wb.Sheets[sheetName];
  const ref = sheet["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    const rows = range.e.r - range.s.r;
    if (rows > MAX_IMPORT_ROWS + 5) {
      return {
        kind: "unknown",
        users: [],
        punches: [],
        errors: [{ rowNumber: 0, code: "too_many_rows", message: `Spreadsheet has more than ${MAX_IMPORT_ROWS} rows.` }],
        headers: [],
        mapping: {},
      };
    }
  }
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ",", RS: "\n" });
  return parseDelimitedAttendance(csv, ",");
}
