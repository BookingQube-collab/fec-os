/**
 * Monthly roster register export — staff × date grid matching the on-screen view.
 * Excel uses the E3 theme; PDF is landscape printable summary (title + filters + table).
 */

import { EXCEL_THEME } from "@/lib/attendance-hr/excel-theme";
import type { ExcelSheetSpec } from "@/lib/attendance-hr/export-workbook";
import {
  buildRosterMatrix,
  isWeekendYmd,
  rosterDayStatusFromRow,
  rosterMatrixCellKey,
  rosterTeamStaffForLocationCode,
  rosterTeamStaffForMatrix,
  type RosterDayStatus,
  type RosterMatrixStaff,
} from "@/lib/attendance-hr/roster-register-scope";

export type RosterExportRow = {
  id: string;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  qid: string | null;
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
  leaveType: string | null;
};

export type RosterExportFilterMeta = {
  locationLabel?: string;
  staffLabel?: string;
  departmentLabel?: string;
  groupLabel?: string;
  sourceLabel?: string;
  search?: string;
};

const LEFT_COLS = 3;

/** Compact duty codes matching the grid cells (OFF / AL / SL / CO / times). */
export function rosterExportCellCode(row: Pick<RosterExportRow, "isWeekOff" | "leaveType" | "shiftStart" | "shiftEnd">): string {
  const status = rosterDayStatusFromRow(row);
  if (status === "weekly_off") return "OFF";
  if (status === "annual_leave") return "AL";
  if (status === "sick_leave") return "SL";
  if (status === "comp_off") return "CO";
  const start = (row.shiftStart ?? "").trim();
  const end = (row.shiftEnd ?? "").trim();
  if (start && end) return `${start}\n${end}`;
  if (start || end) return start || end;
  return "+";
}

export function rosterExportCellText(entries: RosterExportRow[]): string {
  if (!entries.length) return "";
  return entries
    .map((entry) => {
      const body = rosterExportCellCode(entry);
      const loc = (entry.locationCode ?? "").trim();
      return loc ? `${body}\n${loc}` : body;
    })
    .join("\n\n");
}

export function rosterExportCellFillRgb(entries: RosterExportRow[], ymd: string): string | null {
  if (isWeekendYmd(ymd) && !entries.length) return EXCEL_THEME.altRow;
  if (!entries.length) return null;
  const status = rosterDayStatusFromRow(entries[0]!);
  if (status === "weekly_off") return EXCEL_THEME.weeklyOff;
  if (status === "annual_leave" || status === "sick_leave") return EXCEL_THEME.leave;
  if (status === "comp_off") return EXCEL_THEME.publicHoliday;
  if (isWeekendYmd(ymd)) return EXCEL_THEME.altRow;
  return EXCEL_THEME.present;
}

function dayHeaderLabel(ymd: string): string {
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`),
  );
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`),
  );
  return `${weekday}\n${day}`;
}

function pdfDayHeader(ymd: string): string {
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" }).format(
    new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`),
  );
  return `${weekday}${Number(ymd.slice(8, 10))}`;
}

export function e3RosterRegisterExportFilename(
  dateFrom: string,
  dateTo: string,
  kind: "xlsx" | "pdf",
  locationToken?: string | null,
): string {
  const from = dateFrom.slice(0, 10);
  const to = dateTo.slice(0, 10);
  const loc = (locationToken ?? "").trim().replace(/[^\w.-]+/g, "_").slice(0, 24);
  const mid = loc ? `_${loc}` : "";
  return `E3_Monthly_Roster${mid}_${from}_to_${to}.${kind === "pdf" ? "pdf" : "xlsx"}`;
}

function titleRows(
  dateFrom: string,
  dateTo: string,
  filters: RosterExportFilterMeta | undefined,
  generatedAt: Date,
): (string | number)[][] {
  const filterBits = [
    filters?.locationLabel ? `Location: ${filters.locationLabel}` : "Location: All locations",
    filters?.staffLabel ? `Staff: ${filters.staffLabel}` : null,
    filters?.departmentLabel ? `Department: ${filters.departmentLabel}` : null,
    filters?.groupLabel ? `Group: ${filters.groupLabel}` : null,
    filters?.sourceLabel ? `Source: ${filters.sourceLabel}` : null,
    filters?.search ? `Search: ${filters.search}` : null,
  ].filter(Boolean);
  return [
    ["E3 Entertainment — Monthly Shift Roster"],
    [`Period: ${dateFrom} – ${dateTo}`],
    filterBits.length ? [filterBits.join("  |  ")] : [],
    [`Generated: ${generatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`],
    [],
    ["Legend: times = on duty  |  OFF = weekly off  |  AL = annual leave  |  SL = sick leave  |  CO = comp off"],
  ].filter((row) => row.length > 0) as (string | number)[][];
}

export type RosterRegisterExcelSheet = {
  sheet: ExcelSheetSpec;
  staffCount: number;
  dateCount: number;
};

/** Build the staff × date Excel sheet for the filtered monthly roster. */
export function buildRosterRegisterExcelSheet(
  rows: RosterExportRow[],
  dateFrom: string,
  dateTo: string,
  options?: {
    teamStaff?: readonly RosterMatrixStaff[] | null;
    locationCode?: string | null;
    staffId?: string | null;
    search?: string | null;
    filters?: RosterExportFilterMeta;
    generatedAt?: Date;
  },
): RosterRegisterExcelSheet {
  const rowStaffIds = new Set(rows.map((row) => row.staffId));
  const scopedTeam = rosterTeamStaffForLocationCode(
    rosterTeamStaffForMatrix(options?.teamStaff, {
      staffId: options?.staffId ?? null,
      search: options?.search ?? null,
    }),
    options?.locationCode ?? null,
    rowStaffIds,
  );
  const matrix = buildRosterMatrix(rows, dateFrom, dateTo, scopedTeam);
  const { dates, staff, byStaffDate } = matrix;
  const titles = titleRows(dateFrom, dateTo, options?.filters, options?.generatedAt ?? new Date());
  const titleRowCount = titles.length;
  const headerRowIndex = titleRowCount;
  const header: (string | number)[] = ["No.", "Employee Code", "Staff", ...dates.map(dayHeaderLabel)];
  const cellFills: Record<string, string> = {};
  const dataRows = staff.map((person, index) => {
    const dayCells = dates.map((ymd, dayIdx) => {
      const entries = byStaffDate.get(rosterMatrixCellKey(person.staffId, ymd)) ?? [];
      const fill = rosterExportCellFillRgb(entries, ymd);
      if (fill) {
        cellFills[`${headerRowIndex + 1 + index},${LEFT_COLS + dayIdx}`] = fill;
      }
      return rosterExportCellText(entries);
    });
    return [index + 1, person.employeeCode || person.qid || "", person.staffName || "", ...dayCells];
  });

  const lastCol = Math.max(LEFT_COLS - 1, LEFT_COLS + dates.length - 1);
  const merges = titles.map((_, i) => ({
    s: { r: i, c: 0 },
    e: { r: i, c: lastCol },
  }));

  return {
    sheet: {
      name: "Monthly Roster",
      aoa: [...titles, header, ...dataRows],
      merges,
      freeze: { xSplit: LEFT_COLS, ySplit: headerRowIndex + 1 },
      cols: [
        { wch: 5 },
        { wch: 14 },
        { wch: 22 },
        ...dates.map(() => ({ wch: 9 })),
      ],
      filterHeaderRow: headerRowIndex,
      titleRowCount,
      cellFills,
      tabColor: EXCEL_THEME.present,
    },
    staffCount: staff.length,
    dateCount: dates.length,
  };
}

export async function writeRosterRegisterXlsxBuffer(sheet: ExcelSheetSpec): Promise<Buffer> {
  const XLSX = await import("xlsx-js-style");
  const { appendExcelSheets } = await import("@/lib/attendance-hr/export-workbook");
  const wb = XLSX.utils.book_new();
  appendExcelSheets(XLSX, wb, [sheet]);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Compact PDF cell — single line so many day columns fit on landscape A4. */
export function rosterExportPdfCellText(entries: RosterExportRow[]): string {
  if (!entries.length) return "";
  return entries
    .map((entry) => {
      const status = rosterDayStatusFromRow(entry) as RosterDayStatus;
      if (status === "weekly_off") return "OFF";
      if (status === "annual_leave") return "AL";
      if (status === "sick_leave") return "SL";
      if (status === "comp_off") return "CO";
      const start = (entry.shiftStart ?? "").trim();
      const end = (entry.shiftEnd ?? "").trim();
      if (start && end) return `${start}-${end}`;
      return start || end || "+";
    })
    .join(" / ");
}

export async function buildRosterRegisterPdfBuffer(
  rows: RosterExportRow[],
  dateFrom: string,
  dateTo: string,
  options?: {
    teamStaff?: readonly RosterMatrixStaff[] | null;
    locationCode?: string | null;
    staffId?: string | null;
    search?: string | null;
    filters?: RosterExportFilterMeta;
  },
): Promise<Buffer> {
  const rowStaffIds = new Set(rows.map((row) => row.staffId));
  const scopedTeam = rosterTeamStaffForLocationCode(
    rosterTeamStaffForMatrix(options?.teamStaff, {
      staffId: options?.staffId ?? null,
      search: options?.search ?? null,
    }),
    options?.locationCode ?? null,
    rowStaffIds,
  );
  const matrix = buildRosterMatrix(rows, dateFrom, dateTo, scopedTeam);
  const { dates, staff, byStaffDate } = matrix;

  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(13);
  doc.text("E3 Entertainment — Monthly Shift Roster", 36, 32);
  doc.setFontSize(9);
  doc.text(`Period: ${dateFrom} – ${dateTo}`, 36, 46);

  const filterLine = [
    options?.filters?.locationLabel ? `Location: ${options.filters.locationLabel}` : "Location: All locations",
    options?.filters?.staffLabel ? `Staff: ${options.filters.staffLabel}` : null,
    options?.filters?.departmentLabel ? `Department: ${options.filters.departmentLabel}` : null,
    options?.filters?.groupLabel ? `Group: ${options.filters.groupLabel}` : null,
    options?.filters?.sourceLabel ? `Source: ${options.filters.sourceLabel}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (filterLine) {
    doc.setFontSize(8);
    doc.text(filterLine, 36, 58);
  }
  doc.setFontSize(7);
  doc.text("Legend: times = on duty | OFF | AL | SL | CO", 36, filterLine ? 70 : 58);

  const head = [["No.", "Code", "Staff", ...dates.map(pdfDayHeader)]];
  const body = staff.map((person, index) => [
    String(index + 1),
    person.employeeCode || person.qid || "",
    person.staffName || "",
    ...dates.map((ymd) => {
      const entries = byStaffDate.get(rosterMatrixCellKey(person.staffId, ymd)) ?? [];
      return rosterExportPdfCellText(entries);
    }),
  ]);

  autoTable(doc, {
    startY: filterLine ? 78 : 66,
    head,
    body,
    styles: { fontSize: dates.length > 20 ? 5.5 : 7, cellPadding: 1.5, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: dates.length > 20 ? 5.5 : 7 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 48 },
      2: { cellWidth: 72 },
    },
    didParseCell(data) {
      if (data.section !== "body" || data.column.index < 3) return;
      const ymd = dates[data.column.index - 3];
      if (!ymd || !isWeekendYmd(ymd)) return;
      data.cell.styles.fillColor = [248, 250, 252];
    },
  });

  return Buffer.from(doc.output("arraybuffer"));
}
