/**
 * E3 Employee Masterfile 2026 multi-sheet parser.
 * Real Excel tabs (2026): "E3 -Active Employee", "Secondment_contract",
 * "Resigned-Terminated", "Remote staff" (+ ignore Sheet1/Sheet2 scratch tabs).
 * Canonical titles below drive status via statusFromE3Sheet; matchE3SheetName is fuzzy.
 */

import {
  E3_MASTERFILE_SHEETS,
  type E3MasterfileSheet,
  type ParsedRosterRow,
  type RosterParseResult,
} from "./types";
import { mapRosterColumns, parseRosterWorkbook, parseSheetFromMatrix, type RosterParseOptions } from "./parse-workbook";
import { validateE3ImportRows } from "./e3-validate";

function normSheet(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchE3SheetName(name: string): E3MasterfileSheet | null {
  const n = normSheet(name);
  for (const title of E3_MASTERFILE_SHEETS) {
    if (n === normSheet(title) || n.includes(normSheet(title))) return title;
  }
  if (n.includes("active") && n.includes("employee")) return "E3 - Active Employee";
  if (n.includes("secondment")) return "Secondment Contract";
  if (n.includes("resign") || n.includes("terminat")) return "Resigned-Terminated";
  if (n.includes("remote")) return "Remote Staff";
  return null;
}

export function workbookHasE3Sheets(sheetNames: string[]): boolean {
  return sheetNames.some((n) => matchE3SheetName(n) != null);
}

export type E3MasterfileParseResult = RosterParseResult & {
  sheetsParsed: string[];
  validationIssues: ReturnType<typeof validateE3ImportRows>;
  kind: "e3_masterfile" | "employee_roster" | "e3_pdf";
};

export async function parseE3Masterfile(
  buffer: Buffer,
  options?: RosterParseOptions,
): Promise<E3MasterfileParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });

  if (!workbookHasE3Sheets(wb.SheetNames)) {
    const fallback = await parseRosterWorkbook("Employee Roster.xlsx", buffer, options);
    return {
      ...fallback,
      sheetsParsed: fallback.worksheetName ? [fallback.worksheetName] : [],
      validationIssues: validateE3ImportRows(fallback.rows),
      kind: "employee_roster",
    };
  }

  const allRows: ParsedRosterRow[] = [];
  const sheetsParsed: string[] = [];
  const errors: RosterParseResult["errors"] = [];
  let skippedEmpty = 0;
  let headers: string[] = [];
  let mapping: RosterParseResult["mapping"] = {};

  for (const name of wb.SheetNames) {
    const e3Title = matchE3SheetName(name);
    if (!e3Title) continue;
    const sheet = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    const asStrings = matrix.map((r) => (r ?? []).map((c) => String(c ?? "").trim()));

    let headerIdx = -1;
    let bestCount = 0;
    asStrings.forEach((r, i) => {
      const m = mapRosterColumns(r, options?.columnMap, options?.preferHint);
      const count = Object.keys(m).length;
      if (m.full_name && count >= bestCount) {
        bestCount = count;
        headerIdx = i;
      }
    });
    if (headerIdx < 0) {
      errors.push({ rowNumber: 0, code: "missing_headers", message: `No headers on "${name}".` });
      continue;
    }
    const sheetHeaders = asStrings[headerIdx] ?? [];
    const sheetMapping = mapRosterColumns(sheetHeaders, options?.columnMap, options?.preferHint);
    const part = parseSheetFromMatrix(asStrings, headerIdx, sheetHeaders, sheetMapping, e3Title);
    sheetsParsed.push(name);
    headers = sheetHeaders;
    mapping = { ...mapping, ...part.mapping };
    skippedEmpty += part.skippedEmpty;
    const base = allRows.length * 10_000;
    for (const row of part.rows) {
      allRows.push({ ...row, rowNumber: base + row.rowNumber });
    }
    errors.push(...part.errors);
  }

  if (!allRows.length && !errors.length) {
    errors.push({
      rowNumber: 0,
      code: "empty",
      message: "E3 masterfile sheets found but no employee rows parsed.",
    });
  }

  return {
    worksheetName: sheetsParsed.join(" + ") || "E3 Masterfile",
    headers,
    mapping,
    rows: allRows,
    skippedEmpty,
    errors,
    sheetsParsed,
    validationIssues: validateE3ImportRows(allRows),
    kind: "e3_masterfile",
  };
}

/** Detect E3 vs Employee Roster and parse accordingly (xlsx / csv / html / pdf). */
export async function parseDirectoryWorkbook(
  filename: string,
  buffer: Buffer,
  options?: RosterParseOptions,
): Promise<E3MasterfileParseResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { parseE3MasterfilePdf } = await import("./e3-pdf");
    const pdf = await parseE3MasterfilePdf(buffer);
    return {
      worksheetName: pdf.sheetsParsed.join(" + ") || "E3 Masterfile PDF",
      headers: [
        "Department",
        "Employee Code",
        "Employee Name",
        "Position",
        "Location",
        "QID",
        "Status",
      ],
      mapping: {
        activity: "Department",
        employee_code: "Employee Code",
        full_name: "Employee Name",
        position: "Position",
        location: "Location",
        qid: "QID",
        status: "Status",
      },
      rows: pdf.rows,
      skippedEmpty: pdf.skippedEmpty,
      errors:
        pdf.rows.length === 0
          ? [
              {
                rowNumber: 0,
                code: "empty",
                message: `PDF had ${pdf.pageCount} pages (${pdf.nonemptyPages} with text) but no employee rows could be parsed.`,
              },
            ]
          : [],
      sheetsParsed: pdf.sheetsParsed,
      validationIssues: validateE3ImportRows(pdf.rows),
      kind: "e3_pdf",
    };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer", bookSheets: true });
      if (workbookHasE3Sheets(wb.SheetNames)) {
        return parseE3Masterfile(buffer, options);
      }
    } catch {
      /* fall through to single-sheet roster parser */
    }
  }
  const fallback = await parseRosterWorkbook(filename, buffer, options);
  return {
    ...fallback,
    sheetsParsed: fallback.worksheetName ? [fallback.worksheetName] : [],
    validationIssues: validateE3ImportRows(fallback.rows),
    kind: "employee_roster",
  };
}
