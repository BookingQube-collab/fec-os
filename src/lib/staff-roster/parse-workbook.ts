import { parseCsv } from "@/lib/csv-parse";
import { resolveLocationCode } from "@/lib/locations/normalize";

import {
  ROSTER_WORKSHEET_TITLE,
  type ParsedRosterRow,
  type RosterColumnKey,
  type RosterParseResult,
} from "./types";
import {
  decodeHtmlEntities,
  formatPhoneDisplay,
  mapPositionToStaffRole,
  normalizePhoneMatch,
  normalizeQid,
  parseE3Flag,
  parseEmploymentType,
  parseHireDate,
  parseRosterStatus,
  parseSalaryQar,
} from "./values";

const HEADER_ALIASES: Record<RosterColumnKey, string[]> = {
  source_row_no: ["#", "no", "row", "row no", "source row"],
  location: ["location", "location_code", "branch", "venue", "site", "location name", "branch name", "venue name"],
  full_name: ["employee name", "emp name", "staff name", "staff member", "full name", "name", "employee"],
  e3: ["e3", "e3 enrolled"],
  employment_type: ["employee type", "employment type", "type"],
  salary: ["salary", "monthly salary", "salary qar"],
  qid: ["qid", "qatar id", "qid no", "qid number", "national id", "civil id"],
  activity: ["activity", "department", "dept"],
  position: ["position", "job title", "title", "role"],
  contact: ["contact number", "contact no", "contact", "phone number", "phone", "mobile number", "mobile"],
  joining_date: ["joining date", "hire date", "joined", "start date"],
  status: ["status"],
};

export const ROSTER_COLUMN_KEYS: RosterColumnKey[] = [
  "source_row_no",
  "location",
  "full_name",
  "e3",
  "employment_type",
  "salary",
  "qid",
  "activity",
  "position",
  "contact",
  "joining_date",
  "status",
];

export type RosterParseOptions = {
  columnMap?: Partial<Record<RosterColumnKey, string>> | null;
  preferHint?: boolean;
};

function normHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
}

function findHeader(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({
    raw: h,
    n: normHeader(h),
    compact: normHeader(h).replace(/\s/g, ""),
  }));
  for (const alias of aliases) {
    const target = normHeader(alias);
    const compact = target.replace(/\s/g, "");
    const hit = normalized.find((h) => h.n === target || h.compact === compact);
    if (hit) return hit.raw;
  }
  for (const alias of aliases) {
    const target = normHeader(alias);
    if (!target.includes(" ")) continue;
    const hit = normalized.find((h) => h.n.includes(target));
    if (hit) return hit.raw;
  }
  return null;
}

function resolveHeaderName(headers: string[], wanted: string): string | null {
  const target = normHeader(wanted);
  const compact = target.replace(/\s/g, "");
  return (
    headers.find((h) => {
      const n = normHeader(h);
      return n === target || n.replace(/\s/g, "") === compact;
    }) ?? null
  );
}

function mapColumns(headers: string[]): Partial<Record<RosterColumnKey, string>> {
  const mapping: Partial<Record<RosterColumnKey, string>> = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<[RosterColumnKey, string[]]>) {
    const found = findHeader(headers, aliases);
    if (found) mapping[key] = found;
  }
  return mapping;
}

/** Auto-map by aliases, then fill gaps (or override) from a remembered column map. */
export function mapRosterColumns(
  headers: string[],
  hint?: Partial<Record<RosterColumnKey, string>> | null,
  preferHint = false,
): Partial<Record<RosterColumnKey, string>> {
  const mapping = mapColumns(headers);
  if (!hint) return mapping;
  for (const key of ROSTER_COLUMN_KEYS) {
    const hinted = hint[key];
    if (!hinted) continue;
    const hit = resolveHeaderName(headers, hinted);
    if (!hit) continue;
    if (preferHint || !mapping[key]) mapping[key] = hit;
  }
  return mapping;
}

function incompleteMappingResult(
  worksheetName: string | null,
  headers: string[],
  mapping: Partial<Record<RosterColumnKey, string>>,
): RosterParseResult {
  return {
    worksheetName,
    headers,
    mapping,
    rows: [],
    skippedEmpty: 0,
    errors: [
      {
        rowNumber: 0,
        code: "missing_headers",
        message: "Employee Roster is missing Location or Employee Name columns.",
      },
    ],
  };
}

function cell(row: Record<string, string>, key: string | null): string {
  if (!key) return "";
  return String(row[key] ?? "").trim();
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function isEmployeeRosterTitle(value: string): boolean {
  return normHeader(value).includes(normHeader(ROSTER_WORKSHEET_TITLE));
}

function locationLabelFromRaw(
  raw: Record<string, string>,
  mapping: Partial<Record<RosterColumnKey, string>>,
): string {
  const primary = cell(raw, mapping.location ?? null);
  if (primary) return primary;
  const nameHeader = findHeader(Object.keys(raw), ["location_name", "location name"]);
  if (nameHeader && nameHeader !== mapping.location) return cell(raw, nameHeader);
  return "";
}

function toRosterRow(
  raw: Record<string, string>,
  mapping: Partial<Record<RosterColumnKey, string>>,
  rowNumber: number,
): ParsedRosterRow {
  const locationLabel = locationLabelFromRaw(raw, mapping);
  const fullName = cell(raw, mapping.full_name ?? null);
  const e3Raw = cell(raw, mapping.e3 ?? null);
  const typeRaw = cell(raw, mapping.employment_type ?? null);
  const salaryRaw = cell(raw, mapping.salary ?? null);
  const qidRaw = cell(raw, mapping.qid ?? null);
  const activity = cell(raw, mapping.activity ?? null) || null;
  const position = cell(raw, mapping.position ?? null) || null;
  const contactRaw = cell(raw, mapping.contact ?? null);
  const joiningRaw = cell(raw, mapping.joining_date ?? null);
  const statusRaw = cell(raw, mapping.status ?? null);
  const sourceRaw = cell(raw, mapping.source_row_no ?? null);

  const emptyTemplate = !fullName && !qidRaw && !contactRaw && !locationLabel;
  const warnings: string[] = [];
  const errors: string[] = [];

  const qid = normalizeQid(qidRaw);
  const locationCode = resolveLocationCode(locationLabel);
  if (locationLabel && !locationCode) {
    warnings.push(`Unmapped location "${locationLabel}"`);
  }

  const typeParsed = parseEmploymentType(typeRaw);
  if (typeParsed.unknown) {
    warnings.push(`Unknown employee type "${typeRaw}"`);
  }

  const dateParsed = parseHireDate(joiningRaw);
  if (dateParsed.warning) warnings.push(dateParsed.warning);

  const statusParsed = parseRosterStatus(statusRaw);
  if (statusParsed.blank && fullName) {
    warnings.push("Status is blank");
  } else if (!statusParsed.blank && !statusParsed.status && statusRaw) {
    warnings.push(`Unknown status "${statusRaw}"`);
  }

  const sourceRowNo = sourceRaw && /^\d+$/.test(sourceRaw) ? Number(sourceRaw) : null;

  return {
    rowNumber,
    sourceRowNo,
    locationLabel,
    locationCode,
    fullName,
    e3Raw,
    e3Enrolled: parseE3Flag(e3Raw),
    employmentTypeRaw: typeRaw,
    employmentType: typeParsed.type,
    salaryRaw,
    monthlySalaryQar: parseSalaryQar(salaryRaw),
    qidRaw,
    qid,
    activity,
    position,
    staffRole: mapPositionToStaffRole(position),
    contactRaw,
    contactDisplay: formatPhoneDisplay(contactRaw),
    contactMatch: normalizePhoneMatch(contactRaw),
    joiningDateRaw: joiningRaw,
    hireDate: dateParsed.iso,
    statusRaw,
    status: statusParsed.status,
    warnings,
    errors,
    emptyTemplate,
  };
}

function findHeaderRowIndex(matrix: string[][], options?: RosterParseOptions): number {
  const exact = matrix.findIndex((r) => {
    const mapping = mapRosterColumns(r, options?.columnMap, options?.preferHint);
    return Boolean(mapping.full_name && mapping.location);
  });
  if (exact >= 0) return exact;
  let best = -1;
  let bestCount = 0;
  matrix.forEach((r, i) => {
    const count = Object.keys(mapRosterColumns(r, options?.columnMap, options?.preferHint)).length;
    if (count > bestCount) {
      bestCount = count;
      best = i;
    }
  });
  return bestCount >= 2 ? best : -1;
}

function parseObjectRows(
  rows: Record<string, string>[],
  worksheetName: string | null,
  headerOffset = 1,
  options?: RosterParseOptions,
): RosterParseResult {
  if (!rows.length) {
    return {
      worksheetName,
      headers: [],
      mapping: {},
      rows: [],
      skippedEmpty: 0,
      errors: [{ rowNumber: 0, code: "empty", message: "No data rows found on Employee Roster." }],
    };
  }
  const headers = Object.keys(rows[0] ?? {});
  const mapping = mapRosterColumns(headers, options?.columnMap, options?.preferHint);
  if (!mapping.full_name || !mapping.location) {
    return incompleteMappingResult(worksheetName, headers, mapping);
  }

  const parsed: ParsedRosterRow[] = [];
  let skippedEmpty = 0;
  rows.forEach((raw, i) => {
    const row = toRosterRow(raw, mapping, i + headerOffset + 1);
    if (row.emptyTemplate) {
      skippedEmpty += 1;
      return;
    }
    if (!row.fullName) {
      skippedEmpty += 1;
      return;
    }
    parsed.push(row);
  });

  return { worksheetName, headers, mapping, rows: parsed, skippedEmpty, errors: [] };
}

function htmlTableRows(html: string): string[][] {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  for (const table of tables) {
    const trs = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    const rows = trs.map((tr) =>
      [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripHtml(m[1])),
    );
    const flat = rows.flat().join(" ");
    if (isEmployeeRosterTitle(flat) || rows.some((r) => r.some((c) => isEmployeeRosterTitle(c)))) {
      return rows;
    }
  }
  return [];
}

export function parseHtmlRoster(html: string, options?: RosterParseOptions): RosterParseResult {
  const matrix = htmlTableRows(html);
  if (!matrix.length) {
    return {
      worksheetName: null,
      headers: [],
      mapping: {},
      rows: [],
      skippedEmpty: 0,
      errors: [
        {
          rowNumber: 0,
          code: "worksheet_missing",
          message: `No "${ROSTER_WORKSHEET_TITLE}" table found.`,
        },
      ],
    };
  }

  let headerIdx = findHeaderRowIndex(matrix, options);
  if (headerIdx < 0) {
    return {
      worksheetName: ROSTER_WORKSHEET_TITLE,
      headers: [],
      mapping: {},
      rows: [],
      skippedEmpty: 0,
      errors: [{ rowNumber: 0, code: "missing_headers", message: "Could not find Employee Roster header row." }],
    };
  }

  let headers = matrix[headerIdx] ?? [];
  if (headers[0] && /^\d+$/.test(headers[0]) && headers.some((h) => normHeader(h) === "location")) {
    headers = headers.slice(1);
  }
  const mapping = mapRosterColumns(headers, options?.columnMap, options?.preferHint);
  if (!mapping.full_name || !mapping.location) {
    return incompleteMappingResult(ROSTER_WORKSHEET_TITLE, headers, mapping);
  }
  const parsed: ParsedRosterRow[] = [];
  let skippedEmpty = 0;

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    let cells = matrix[i] ?? [];
    if (cells[0] && /^\d+$/.test(cells[0]) && cells.length === headers.length + 1) {
      cells = cells.slice(1);
    }
    const raw: Record<string, string> = {};
    headers.forEach((h, col) => {
      raw[h] = cells[col] ?? "";
    });
    const row = toRosterRow(raw, mapping, i + 1);
    if (row.emptyTemplate || !row.fullName) {
      skippedEmpty += 1;
      continue;
    }
    parsed.push(row);
  }

  return {
    worksheetName: ROSTER_WORKSHEET_TITLE,
    headers,
    mapping,
    rows: parsed,
    skippedEmpty,
    errors: [],
  };
}

export function parseCsvRoster(text: string, options?: RosterParseOptions): RosterParseResult {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length && Object.values(rows[0] ?? {}).some((v) => isEmployeeRosterTitle(String(v)))) {
    return parseObjectRows(rows.slice(1), ROSTER_WORKSHEET_TITLE, 2, options);
  }
  return parseObjectRows(rows, ROSTER_WORKSHEET_TITLE, 1, options);
}

export async function parseXlsxRoster(buffer: Buffer, options?: RosterParseOptions): Promise<RosterParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheetName = wb.SheetNames.find((n) => isEmployeeRosterTitle(n));
  if (!sheetName) {
    return {
      worksheetName: null,
      headers: [],
      mapping: {},
      rows: [],
      skippedEmpty: 0,
      errors: [
        {
          rowNumber: 0,
          code: "worksheet_missing",
          message: `Workbook has no "${ROSTER_WORKSHEET_TITLE}" worksheet.`,
        },
      ],
    };
  }
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const asStrings = matrix.map((r) => (r ?? []).map((c) => String(c ?? "").trim()));
  let headerIdx = findHeaderRowIndex(asStrings, options);
  if (headerIdx < 0) {
    return {
      worksheetName: sheetName,
      headers: [],
      mapping: {},
      rows: [],
      skippedEmpty: 0,
      errors: [{ rowNumber: 0, code: "missing_headers", message: "Employee Roster sheet is missing headers." }],
    };
  }
  const headers = asStrings[headerIdx] ?? [];
  const mapping = mapRosterColumns(headers, options?.columnMap, options?.preferHint);
  if (!mapping.full_name || !mapping.location) {
    return incompleteMappingResult(sheetName, headers, mapping);
  }
  const parsed: ParsedRosterRow[] = [];
  let skippedEmpty = 0;
  for (let i = headerIdx + 1; i < asStrings.length; i++) {
    const cells = asStrings[i] ?? [];
    const raw: Record<string, string> = {};
    headers.forEach((h, col) => {
      raw[h] = cells[col] ?? "";
    });
    const row = toRosterRow(raw, mapping, i + 1);
    if (row.emptyTemplate || !row.fullName) {
      skippedEmpty += 1;
      continue;
    }
    parsed.push(row);
  }
  return { worksheetName: sheetName, headers, mapping, rows: parsed, skippedEmpty, errors: [] };
}

export function detectRosterFileType(filename: string): "xlsx" | "xls" | "csv" | "html" | "unknown" {
  const base = filename.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  if (base.endsWith(".xlsx")) return "xlsx";
  if (base.endsWith(".xls")) return "xls";
  if (base.endsWith(".csv")) return "csv";
  if (base.endsWith(".html") || base.endsWith(".htm")) return "html";
  return "unknown";
}

export async function parseRosterWorkbook(
  filename: string,
  buffer: Buffer,
  options?: RosterParseOptions,
): Promise<RosterParseResult> {
  const kind = detectRosterFileType(filename);
  if (kind === "html") return parseHtmlRoster(buffer.toString("utf8"), options);
  if (kind === "csv") return parseCsvRoster(buffer.toString("utf8"), options);
  if (kind === "xlsx" || kind === "xls") return parseXlsxRoster(buffer, options);

  const text = buffer.toString("utf8");
  if (/<table[\s>]/i.test(text) && /waffle|employee roster/i.test(text)) {
    return parseHtmlRoster(text, options);
  }
  if (text.includes(",") && /location/i.test(text)) {
    return parseCsvRoster(text, options);
  }
  return parseXlsxRoster(buffer, options);
}
