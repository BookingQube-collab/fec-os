import { parseCsv, parseCsvMatrix } from "@/lib/csv-parse";
import { isQidShapedCode } from "@/lib/staff-employee-code";
import { resolveLocationCode, type LocationLookup } from "@/lib/locations/normalize";
import { decodeHtmlEntities, normalizeName, normalizeQid } from "@/lib/staff-roster/values";
import type { AttendanceRosterPeriodMode } from "./roster-period";

export {
  ATTENDANCE_ROSTER_ACCEPT,
  ATTENDANCE_ROSTER_TEMPLATE_HEADERS,
  attendanceRosterPeriod,
  buildAttendanceRosterTemplateCsv,
  canUploadAttendanceRoster,
  qatarWeekBounds,
  type AttendanceRosterPeriodMode,
} from "./roster-period";

export const ATTENDANCE_TALLY_UPLOAD_NOTE = "attendance_tally";
export const ATTENDANCE_ROSTER_MAX_BYTES = 15 * 1024 * 1024;
export const ATTENDANCE_ROSTER_MAX_ROWS = 10_000;

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  tues: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const NAME_HEADERS = ["staff name", "staff_name", "employee name", "full name", "name", "staff", "employee"];
const QID_HEADERS = ["qid", "qatar id", "national id"];
const CODE_HEADERS = ["employee code", "employee_code", "staff code", "code", "emp code"];
const LOCATION_HEADERS = ["location", "location_code", "branch", "venue", "site"];
const LOCATION_NAME_HEADERS = ["location_name", "location name"];
const DATE_HEADERS = ["date", "work date", "shift date", "day"];
const START_HEADERS = ["shift start", "start_time", "start", "from", "in"];
const END_HEADERS = ["shift end", "end_time", "end", "to", "out"];
const SHIFT_HEADERS = ["shift", "shift time", "shift hours", "duty time", "hours"];
const DUTY_HEADERS = ["duty", "status", "scheduled", "off", "week off"];
const WEEKDAY_HEADERS = ["weekday", "day name", "dow", "day"];

const IDENTITY_HEADER_SET = new Set(
  [
    ...NAME_HEADERS,
    ...QID_HEADERS,
    ...CODE_HEADERS,
    ...LOCATION_HEADERS,
    ...LOCATION_NAME_HEADERS,
    ...DATE_HEADERS,
    ...WEEKDAY_HEADERS,
    ...START_HEADERS,
    ...END_HEADERS,
    ...SHIFT_HEADERS,
    ...DUTY_HEADERS,
  ].map((h) => normHeader(h)),
);

export type AttendanceRosterStaff = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  qid: string | null;
  location_id: string;
  work_location_ids?: string[];
};

export type AttendanceRosterShift = {
  id: string;
  location_id: string | null;
  start_time: string;
  end_time: string;
};

export type MatchedRosterRow = {
  rowNumber: number;
  workDate: string;
  locationCode: string | null;
  locationId: string | null;
  staffId: string | null;
  staffLabel: string;
  qid: string | null;
  employeeCode: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftTemplateId: string | null;
  isWeekOff: boolean;
  matchRule: string;
  status: "matched" | "unmatched" | "skipped";
  message: string | null;
};

export type AttendanceRosterPreview = {
  periodMode: AttendanceRosterPeriodMode;
  dateFrom: string;
  dateTo: string;
  locationId: string | null;
  rows: MatchedRosterRow[];
  matched: number;
  unmatched: number;
  skipped: number;
  warnings: string[];
  errors: string[];
};

function normHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compactHeader(value: string): string {
  return normHeader(value).replace(/\s/g, "");
}

function findHeader(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, n: normHeader(h), c: compactHeader(h) }));
  for (const alias of aliases) {
    const n = normHeader(alias);
    const c = compactHeader(alias);
    const hit = normalized.find((h) => h.n === n || h.c === c);
    if (hit) return hit.raw;
  }
  return null;
}

function cell(row: Record<string, string>, key: string | null): string {
  if (!key) return "";
  return String(row[key] ?? "").trim();
}

export function parseDutyCell(raw: string | null | undefined): { isWeekOff: boolean; known: boolean } {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!s) return { isWeekOff: false, known: false };
  if (/^\d{1,2}:\d{2}/.test(s)) return { isWeekOff: false, known: true };
  if (["off", "week off", "weekly off", "day off", "rest", "no", "n", "0", "false", "wo", "off day", "offday", "leave"].includes(s)) {
    return { isWeekOff: true, known: true };
  }
  if (["yes", "y", "duty", "on", "scheduled", "work", "working", "1", "true", "present"].includes(s)) {
    return { isWeekOff: false, known: true };
  }
  return { isWeekOff: false, known: false };
}

export function parseTimeCell(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? 0);
    const ap = ampm[3].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) return `${String(Number(hm[1])).padStart(2, "0")}:${hm[2]}`;
  const compact = s.match(/^(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}:${compact[2]}`;
  return null;
}

export function parseShiftRange(raw: string | null | undefined): { start: string | null; end: string | null } {
  const s = String(raw ?? "").trim();
  if (!s) return { start: null, end: null };
  const parts = s.split(/\s*[-–—to]+\s*/i).filter(Boolean);
  if (parts.length >= 2) {
    return { start: parseTimeCell(parts[0]), end: parseTimeCell(parts[1]) };
  }
  return { start: parseTimeCell(s), end: null };
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function parseRosterDateCell(raw: string | number | Date | null | undefined): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(raw.getTime() - raw.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 20000 || raw > 80000) return null;
    const utc = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000;
    return new Date(utc).toISOString().slice(0, 10);
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : a;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/) || s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const dayFirst = /^\d/.test(s);
    const day = Number(dayFirst ? named[1] : named[2]);
    const month = MONTHS[(dayFirst ? named[2] : named[1]).toLowerCase()] ?? 0;
    const year = Number(named[3]);
    if (!month || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const namedHyphen = s.match(/^(\d{1,2})[\/.\-]([A-Za-z]+)[\/.\-](\d{2,4})$/);
  if (namedHyphen) {
    const day = Number(namedHyphen[1]);
    const month = MONTHS[namedHyphen[2].toLowerCase()] ?? 0;
    let year = Number(namedHyphen[3]);
    if (year < 100) year += 2000;
    if (!month || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (/^\d{5}$/.test(s)) return parseRosterDateCell(Number(s));
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(s)) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function parseWeekdayCell(raw: string | null | undefined): number | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;
  const n = WEEKDAYS[key];
  return n == null ? null : n;
}

function headerLooksShiftish(header: string): boolean {
  const n = normHeader(header);
  if (n.includes("shift") || n === "duty" || n === "weekday" || n === "date" || n === "work date") return true;
  if (parseWeekdayCell(header) != null) return true;
  return Boolean(parseRosterDateCell(header));
}

export function looksLikeEmployeeRosterHeaders(headers: string[]): boolean {
  const n = headers.map(normHeader);
  const hasQid = n.some((h) => h === "qid" || h.includes("qatar id"));
  const hrish = n.some((h) => h.includes("salary") || h === "e3" || h.includes("joining") || h.includes("employment type"));
  const shiftish = headers.some((h) => headerLooksShiftish(h));
  return hasQid && hrish && !shiftish;
}

export function looksLikeShiftRosterHeaders(headers: string[]): boolean {
  if (!headers.length || looksLikeEmployeeRosterHeaders(headers)) return false;
  return headers.some((h) => headerLooksShiftish(h));
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function htmlTablesToMatrices(html: string): string[][][] {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  return tables.map((table) => {
    const trs = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    return trs.map((tr) => [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripHtml(m[1])));
  });
}

function findShiftHeaderRowIndex(matrix: string[][]): number {
  const shiftIdx = matrix.findIndex((row) => looksLikeShiftRosterHeaders(row.map((c) => String(c ?? "").trim())));
  if (shiftIdx >= 0) return shiftIdx;
  return matrix.findIndex((row) => row.some((c) => String(c ?? "").trim()));
}

function matrixToRecords(matrix: string[][]): Record<string, string>[] {
  const headerIdx = findShiftHeaderRowIndex(matrix);
  if (headerIdx < 0) return [];
  const headers = matrix[headerIdx].map((h, i) => (h.trim() ? h.trim() : `col_${i}`));
  const rows: Record<string, string>[] = [];
  for (const line of matrix.slice(headerIdx + 1)) {
    if (!line.some((c) => String(c ?? "").trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = String(line[i] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function recordsFromCsv(text: string): Record<string, string>[] {
  const matrix = parseCsvMatrix(text.replace(/^\uFEFF/, ""));
  if (findShiftHeaderRowIndex(matrix) >= 0) return matrixToRecords(matrix);
  return parseCsv(text.replace(/^\uFEFF/, ""));
}

function pickShiftRosterSheetName(names: string[]): string | undefined {
  return names.find((n) => /date\s*wise/i.test(n)) ?? names.find((n) => /^roster$/i.test(n)) ?? names[0];
}

type DraftRow = {
  rowNumber: number;
  date: string | null;
  weekday: number | null;
  staffName: string;
  qid: string;
  employeeCode: string;
  staffRaw: string;
  locationRaw: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  dutyRaw: string;
};

function locationRawFromRow(row: Record<string, string>, locKey: string | null): string {
  const code = cell(row, locKey);
  if (code) return code;
  return cell(row, findHeader(Object.keys(row), LOCATION_NAME_HEADERS));
}

function pickIdentity(row: Record<string, string>) {
  const keys = Object.keys(row);
  const nameKey = findHeader(keys, NAME_HEADERS);
  const qidKey = findHeader(keys, QID_HEADERS);
  const codeKey = findHeader(keys, CODE_HEADERS);
  const locKey = findHeader(keys, LOCATION_HEADERS);
  const dateKey = findHeader(keys, DATE_HEADERS);
  const weekdayKey = findHeader(keys, WEEKDAY_HEADERS);
  const startKey = findHeader(keys, START_HEADERS);
  const endKey = findHeader(keys, END_HEADERS);
  const shiftKey = findHeader(keys, SHIFT_HEADERS);
  const dutyKey = findHeader(keys, DUTY_HEADERS);
  return { nameKey, qidKey, codeKey, locKey, dateKey, weekdayKey, startKey, endKey, shiftKey, dutyKey, keys };
}

function isGridRecords(rows: Record<string, string>[]): boolean {
  if (!rows.length) return false;
  const keys = Object.keys(rows[0]);
  const dateOrDay = keys.filter((k) => {
    const n = normHeader(k);
    if (IDENTITY_HEADER_SET.has(n)) return false;
    return Boolean(parseRosterDateCell(k) || parseWeekdayCell(k));
  });
  return dateOrDay.length >= 3;
}

function draftFromLongRow(row: Record<string, string>, rowNumber: number): DraftRow | null {
  const id = pickIdentity(row);
  const staffName = cell(row, id.nameKey);
  const qid = cell(row, id.qidKey);
  const employeeCode = cell(row, id.codeKey);
  const combined = staffName || qid || employeeCode;
  if (!combined) return null;
  const shiftRaw = cell(row, id.shiftKey);
  const dutyRaw = cell(row, id.dutyKey) || cell(row, findHeader(Object.keys(row), ["status"])) || shiftRaw;
  const range = parseShiftRange(shiftRaw || dutyRaw);
  const start = parseTimeCell(cell(row, id.startKey)) ?? range.start;
  const end = parseTimeCell(cell(row, id.endKey)) ?? range.end;
  return {
    rowNumber,
    date: parseRosterDateCell(cell(row, id.dateKey)),
    weekday: parseWeekdayCell(cell(row, id.weekdayKey)),
    staffName,
    qid,
    employeeCode,
    staffRaw: combined,
    locationRaw: locationRawFromRow(row, id.locKey),
    shiftStart: start,
    shiftEnd: end,
    dutyRaw,
  };
}

function draftsFromGrid(rows: Record<string, string>[]): DraftRow[] {
  const out: DraftRow[] = [];
  if (!rows.length) return out;
  const keys = Object.keys(rows[0]);
  const id = pickIdentity(rows[0]);
  const dayKeys = keys.filter((k) => {
    const n = normHeader(k);
    if (IDENTITY_HEADER_SET.has(n)) return false;
    return Boolean(parseRosterDateCell(k) || parseWeekdayCell(k));
  });
  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const staffName = cell(row, id.nameKey);
    const qid = cell(row, id.qidKey);
    const employeeCode = cell(row, id.codeKey);
    const combined = staffName || qid || employeeCode;
    if (!combined) return;
    for (const key of dayKeys) {
      const value = String(row[key] ?? "").trim();
      if (!value) continue;
      const duty = parseDutyCell(value);
      const range = parseShiftRange(value);
      out.push({
        rowNumber,
        date: parseRosterDateCell(key),
        weekday: parseWeekdayCell(key),
        staffName,
        qid,
        employeeCode,
        staffRaw: combined,
        locationRaw: locationRawFromRow(row, id.locKey),
        shiftStart: range.start,
        shiftEnd: range.end,
        dutyRaw: duty.known ? (duty.isWeekOff ? "Off" : "Yes") : value,
      });
    }
  });
  return out;
}

function expandDrafts(drafts: DraftRow[], dateFrom: string, dateTo: string, mode: AttendanceRosterPeriodMode): DraftRow[] {
  const out: DraftRow[] = [];
  for (const row of drafts) {
    if (row.date) {
      out.push(row);
      continue;
    }
    if (row.weekday == null) {
      out.push(row);
      continue;
    }
    const start = new Date(`${dateFrom}T12:00:00.000Z`);
    const end = new Date(`${dateTo}T12:00:00.000Z`);
    if (mode === "week") {
      for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
        const d = new Date(t);
        if (d.getUTCDay() === row.weekday) {
          out.push({ ...row, date: d.toISOString().slice(0, 10) });
        }
      }
      continue;
    }
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const d = new Date(t);
      if (d.getUTCDay() === row.weekday) {
        out.push({ ...row, date: d.toISOString().slice(0, 10) });
      }
    }
  }
  return out;
}

function splitStaffRaw(row: DraftRow): { name: string; qid: string; code: string } {
  let qid = normalizeQid(row.qid) ?? "";
  let code = row.employeeCode.trim();
  let name = row.staffName.trim();
  const raw = (row.staffRaw || name || code || qid).trim();
  if (!qid && isQidShapedCode(raw)) {
    qid = normalizeQid(raw) ?? "";
    if (name === raw) name = "";
  } else if (!code && !qid && /^[A-Za-z0-9]+-[A-Za-z0-9-]+$/.test(raw)) {
    code = raw;
    if (name === raw) name = "";
  } else if (!name && raw && !qid && !code) {
    name = raw;
  }
  return { name, qid, code };
}

export function matchAttendanceRosterStaff(
  input: {
    qid: string;
    employeeCode: string;
    name: string;
    locationId: string | null;
  },
  staff: AttendanceRosterStaff[],
): { staffId: string | null; matchRule: string; message: string | null; label: string } {
  const active = staff.filter((s) => s.id);
  if (input.qid) {
    const hits = active.filter((s) => normalizeQid(s.qid) === input.qid || (isQidShapedCode(s.employee_code) && normalizeQid(s.employee_code) === input.qid));
    if (hits.length === 1) {
      return { staffId: hits[0].id, matchRule: "qid", message: null, label: hits[0].full_name || input.qid };
    }
    if (hits.length > 1) {
      return { staffId: null, matchRule: "qid_ambiguous", message: "QID matches more than one staff record.", label: input.qid };
    }
    return { staffId: null, matchRule: "qid_unmatched", message: "No staff with this QID.", label: input.qid };
  }
  if (input.employeeCode) {
    const code = input.employeeCode.trim().toUpperCase();
    const hits = active.filter((s) => String(s.employee_code ?? "").trim().toUpperCase() === code);
    if (hits.length === 1) {
      return { staffId: hits[0].id, matchRule: "employee_code", message: null, label: hits[0].full_name || code };
    }
    if (hits.length > 1) {
      return { staffId: null, matchRule: "code_ambiguous", message: "Employee code matches more than one staff record.", label: code };
    }
    return { staffId: null, matchRule: "code_unmatched", message: "No staff with this employee code.", label: code };
  }
  const name = normalizeName(input.name);
  const locationId = input.locationId;
  if (name && locationId) {
    const hits = active.filter((s) => {
      if (normalizeName(s.full_name) !== name) return false;
      if (s.location_id === locationId) return true;
      return (s.work_location_ids ?? []).includes(locationId);
    });
    if (hits.length === 1) {
      return { staffId: hits[0].id, matchRule: "name_location", message: null, label: hits[0].full_name || input.name };
    }
    if (hits.length > 1) {
      return { staffId: null, matchRule: "name_ambiguous", message: "Same name at this location — use QID or employee code.", label: input.name };
    }
    return { staffId: null, matchRule: "name_unmatched", message: "No exact name match at this location.", label: input.name };
  }
  if (name && !input.locationId) {
    return { staffId: null, matchRule: "name_needs_location", message: "Name match needs a location. Add Location or pick a site.", label: input.name };
  }
  return { staffId: null, matchRule: "missing_id", message: "Provide QID, employee code, or name + location.", label: input.name || "—" };
}

export function matchShiftTemplate(
  start: string | null,
  end: string | null,
  locationId: string | null,
  shifts: AttendanceRosterShift[],
): string | null {
  if (!start || !end) return null;
  const startHm = start.slice(0, 5);
  const endHm = end.slice(0, 5);
  const same = shifts.filter((s) => String(s.start_time).slice(0, 5) === startHm && String(s.end_time).slice(0, 5) === endHm);
  const local = same.find((s) => s.location_id === locationId);
  if (local) return local.id;
  const global = same.find((s) => !s.location_id);
  return global?.id ?? same[0]?.id ?? null;
}

function recordsFromUnknown(text: string): { records: Record<string, string>[]; error?: string } {
  const trimmed = text.trim();
  if (/<table[\s>]/i.test(trimmed)) {
    if (/employee\s+roster/i.test(trimmed) || /e3\s+enrolled/i.test(trimmed)) {
      return { records: [], error: "This looks like the Employee Roster HTML. Use People → Import for that file. This page is the weekly/monthly shift roster for attendance tally." };
    }
    const matrices = htmlTablesToMatrices(trimmed);
    for (const matrix of matrices) {
      if (!matrix.length) continue;
      const headers = matrix.find((r) => r.some((c) => c.trim())) ?? [];
      if (looksLikeEmployeeRosterHeaders(headers)) {
        return { records: [], error: "This looks like the Employee Roster HTML. Use People → Import for that file." };
      }
      const records = matrixToRecords(matrix);
      if (records.length) return { records };
    }
    return { records: [], error: "No roster table found in the HTML file." };
  }
  return { records: recordsFromCsv(trimmed) };
}

export async function parseAttendanceRosterFile(
  filename: string,
  buffer: Buffer,
): Promise<{ records: Record<string, string>[]; error?: string; sheetName?: string }> {
  const base = filename.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  if (base.endsWith(".html") || base.endsWith(".htm")) {
    return recordsFromUnknown(buffer.toString("utf8"));
  }
  if (base.endsWith(".xlsx") || base.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
    const sheetName = pickShiftRosterSheetName(wb.SheetNames);
    if (!sheetName) return { records: [], error: "Workbook has no sheets." };
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    const asStrings = matrix.map((r) => (r ?? []).map((c) => String(c ?? "").trim()));
    return { records: matrixToRecords(asStrings), sheetName };
  }
  const text = buffer.toString("utf8");
  if (/<table[\s>]/i.test(text) || /<html/i.test(text)) return recordsFromUnknown(text);
  return { records: recordsFromCsv(text) };
}

export function guardAttendanceRosterUpload(filename: string, byteSize: number): { ok: true } | { ok: false; message: string } {
  const name = filename.replace(/\\/g, "/").split("/").pop()?.trim() || filename;
  if (!name) return { ok: false, message: "File name is required." };
  if (byteSize <= 0) return { ok: false, message: "The uploaded file is empty." };
  if (byteSize > ATTENDANCE_ROSTER_MAX_BYTES) {
    return { ok: false, message: `File exceeds the ${Math.round(ATTENDANCE_ROSTER_MAX_BYTES / (1024 * 1024))} MB upload limit.` };
  }
  const base = name.toLowerCase();
  if (!/\.(xlsx|xls|csv|html|htm)$/.test(base)) {
    return { ok: false, message: "Upload .xlsx, .xls, .csv, or HTML." };
  }
  return { ok: true };
}

export function buildAttendanceRosterPreview(input: {
  records: Record<string, string>[];
  periodMode: AttendanceRosterPeriodMode;
  dateFrom: string;
  dateTo: string;
  selectedLocationId: string | null;
  staff: AttendanceRosterStaff[];
  locations: LocationLookup[];
  shifts: AttendanceRosterShift[];
}): AttendanceRosterPreview {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!input.records.length) {
    return {
      periodMode: input.periodMode,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      locationId: input.selectedLocationId,
      rows: [],
      matched: 0,
      unmatched: 0,
      skipped: 0,
      warnings,
      errors: ["No data rows found."],
    };
  }
  if (looksLikeEmployeeRosterHeaders(Object.keys(input.records[0] ?? {}))) {
    return {
      periodMode: input.periodMode,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      locationId: input.selectedLocationId,
      rows: [],
      matched: 0,
      unmatched: 0,
      skipped: 0,
      warnings,
      errors: ["This looks like the Employee Roster (people directory), not a shift roster. Use People → Import."],
    };
  }

  const drafts = isGridRecords(input.records)
    ? draftsFromGrid(input.records)
    : input.records.map((row, idx) => draftFromLongRow(row, idx + 2)).filter((r): r is DraftRow => r != null);

  const expanded = expandDrafts(drafts, input.dateFrom, input.dateTo, input.periodMode);
  const locByCode = new Map(input.locations.map((l) => [l.code.toUpperCase(), l]));
  const rows: MatchedRosterRow[] = [];

  for (const draft of expanded) {
    if (expanded.length > ATTENDANCE_ROSTER_MAX_ROWS) break;
    const ids = splitStaffRaw(draft);
    const workDate = draft.date;
    if (!workDate) {
      rows.push({
        rowNumber: draft.rowNumber,
        workDate: "",
        locationCode: null,
        locationId: null,
        staffId: null,
        staffLabel: ids.name || ids.code || ids.qid || "—",
        qid: ids.qid || null,
        employeeCode: ids.code || null,
        shiftStart: draft.shiftStart,
        shiftEnd: draft.shiftEnd,
        shiftTemplateId: null,
        isWeekOff: parseDutyCell(draft.dutyRaw).isWeekOff,
        matchRule: "missing_date",
        status: "unmatched",
        message: "Missing date (or weekday that does not fall in the selected period).",
      });
      continue;
    }
    if (workDate < input.dateFrom || workDate > input.dateTo) {
      rows.push({
        rowNumber: draft.rowNumber,
        workDate,
        locationCode: null,
        locationId: null,
        staffId: null,
        staffLabel: ids.name || ids.code || ids.qid || "—",
        qid: ids.qid || null,
        employeeCode: ids.code || null,
        shiftStart: draft.shiftStart,
        shiftEnd: draft.shiftEnd,
        shiftTemplateId: null,
        isWeekOff: false,
        matchRule: "outside_period",
        status: "skipped",
        message: `Outside selected period ${input.dateFrom} – ${input.dateTo}.`,
      });
      continue;
    }

    const locationCode = resolveLocationCode(draft.locationRaw, input.locations);
    let locationId = input.selectedLocationId;
    if (locationCode) {
      locationId = locByCode.get(locationCode)?.id ?? locationId;
    }
    if (input.selectedLocationId && locationId && locationId !== input.selectedLocationId) {
      rows.push({
        rowNumber: draft.rowNumber,
        workDate,
        locationCode,
        locationId,
        staffId: null,
        staffLabel: ids.name || ids.code || ids.qid || "—",
        qid: ids.qid || null,
        employeeCode: ids.code || null,
        shiftStart: draft.shiftStart,
        shiftEnd: draft.shiftEnd,
        shiftTemplateId: null,
        isWeekOff: false,
        matchRule: "location_mismatch",
        status: "unmatched",
        message: "Row location does not match the selected site.",
      });
      continue;
    }
    if (!locationId) {
      rows.push({
        rowNumber: draft.rowNumber,
        workDate,
        locationCode,
        locationId: null,
        staffId: null,
        staffLabel: ids.name || ids.code || ids.qid || "—",
        qid: ids.qid || null,
        employeeCode: ids.code || null,
        shiftStart: draft.shiftStart,
        shiftEnd: draft.shiftEnd,
        shiftTemplateId: null,
        isWeekOff: false,
        matchRule: "missing_location",
        status: "unmatched",
        message: "Pick a site or add a Location column.",
      });
      continue;
    }

    const duty = parseDutyCell(draft.dutyRaw);
    const isWeekOff = duty.isWeekOff;
    const matched = matchAttendanceRosterStaff(
      { qid: ids.qid, employeeCode: ids.code, name: ids.name, locationId },
      input.staff,
    );
    const loc = input.locations.find((l) => l.id === locationId);
    rows.push({
      rowNumber: draft.rowNumber,
      workDate,
      locationCode: loc?.code ?? locationCode,
      locationId,
      staffId: matched.staffId,
      staffLabel: matched.label,
      qid: ids.qid || null,
      employeeCode: ids.code || null,
      shiftStart: isWeekOff ? null : draft.shiftStart,
      shiftEnd: isWeekOff ? null : draft.shiftEnd,
      shiftTemplateId: isWeekOff ? null : matchShiftTemplate(draft.shiftStart, draft.shiftEnd, locationId, input.shifts),
      isWeekOff,
      matchRule: matched.matchRule,
      status: matched.staffId ? "matched" : "unmatched",
      message: matched.message,
    });
  }

  if (expanded.length > ATTENDANCE_ROSTER_MAX_ROWS) {
    errors.push(`File has more than ${ATTENDANCE_ROSTER_MAX_ROWS} rows.`);
  }

  const matched = rows.filter((r) => r.status === "matched").length;
  const unmatched = rows.filter((r) => r.status === "unmatched").length;
  const skipped = rows.filter((r) => r.status === "skipped").length;
  if (skipped) warnings.push(`${skipped} row(s) sit outside the selected week/month and will not be written.`);
  if (unmatched) warnings.push(`${unmatched} row(s) could not be matched. Confirm writes matched rows only.`);
  if (!matched) errors.push("No staff could be matched. Fix QID / employee code / name + location, then preview again.");

  return {
    periodMode: input.periodMode,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    locationId: input.selectedLocationId,
    rows: rows.slice(0, 2000),
    matched,
    unmatched,
    skipped,
    warnings,
    errors,
  };
}

export function assignmentsFromPreview(rows: MatchedRosterRow[]): Map<string, MatchedRosterRow> {
  const byKey = new Map<string, MatchedRosterRow>();
  for (const row of rows) {
    if (row.status !== "matched" || !row.staffId || !row.locationId || !row.workDate) continue;
    byKey.set(`${row.staffId}|${row.workDate}`, row);
  }
  return byKey;
}

