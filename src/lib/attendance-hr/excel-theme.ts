/**
 * Fixed E3 HR Excel color system — never randomize.
 * RGB hex without `#` (SheetJS / xlsx-js-style style fills).
 */

export const EXCEL_THEME = {
  /** Dark navy / charcoal — titles & major headers */
  primaryHeader: "1F2937",
  /** Secondary section headers */
  secondaryHeader: "334155",
  /** Present / approved / valid / completed */
  present: "BBF7D0",
  /** Absent / critical / rejected */
  absent: "FECACA",
  /** Late / warning / pending */
  late: "FEF08A",
  /** Leave (AL / SL) */
  leave: "E9D5FF",
  /** Weekly off / WO / neutral / unscheduled base */
  weeklyOff: "E5E7EB",
  /** Overtime / attention / MP */
  overtime: "FED7AA",
  warning: "FEF08A",
  critical: "FECACA",
  neutral: "E5E7EB",
  approved: "BBF7D0",
  /** Public holiday / attendance info */
  publicHoliday: "BFDBFE",
  /** Unpaid leave (UL) — pink / light red */
  unpaidLeave: "FBCFE8",
  /** Half day */
  halfDay: "FEF08A",
  /** Missed punch */
  missedPunch: "FED7AA",
  /** Unscheduled */
  unscheduled: "F3F4F6",
  /** Light blue alias for PH / info */
  lightBlue: "BFDBFE",
  white: "FFFFFF",
  /** Alternating location / data rows */
  altRow: "F8FAFC",
  /** Header text on dark fills */
  onPrimary: "FFFFFF",
} as const;

export type ExcelThemeKey = keyof typeof EXCEL_THEME;

/** Matrix status codes → theme fill key. */
export const MATRIX_CODE_THEME: Record<string, ExcelThemeKey> = {
  P: "present",
  A: "absent",
  WO: "weeklyOff",
  AL: "leave",
  SL: "leave",
  UL: "unpaidLeave",
  PH: "publicHoliday",
  MP: "missedPunch",
  HD: "halfDay",
  US: "unscheduled",
};

export function matrixCodeFillRgb(code: string): string {
  const key = MATRIX_CODE_THEME[code.trim().toUpperCase()];
  return key ? EXCEL_THEME[key] : EXCEL_THEME.white;
}

/** Sheet tab accent colors (xlsx-js-style `!tabColor`). */
export const E3_SHEET_TAB_COLORS: Record<string, string> = {
  "01 HR Summary": EXCEL_THEME.primaryHeader,
  "02 Employee Summary": EXCEL_THEME.lightBlue,
  "03 Attendance Matrix": EXCEL_THEME.present,
  "04 Daily Attendance": EXCEL_THEME.lightBlue,
  "05 Late & Early Exit": EXCEL_THEME.late,
  "06 Absence & Leave": EXCEL_THEME.leave,
  "07 Missed Punches": EXCEL_THEME.overtime,
  "08 Overtime": EXCEL_THEME.overtime,
  "09 Payroll Input": EXCEL_THEME.approved,
  "10 Data Issues": EXCEL_THEME.critical,
  "11 Raw Punches": EXCEL_THEME.neutral,
  "12 Audit Trail": EXCEL_THEME.secondaryHeader,
};

export type ExcelCellStyle = {
  fill?: { patternType: "solid"; fgColor: { rgb: string } };
  font?: {
    bold?: boolean;
    color?: { rgb: string };
    sz?: number;
    name?: string;
  };
  alignment?: {
    vertical?: "top" | "center" | "bottom";
    horizontal?: "left" | "center" | "right";
    wrapText?: boolean;
  };
  border?: {
    top?: { style: string; color: { rgb: string } };
    bottom?: { style: string; color: { rgb: string } };
    left?: { style: string; color: { rgb: string } };
    right?: { style: string; color: { rgb: string } };
  };
  numFmt?: string;
};

const THIN = { style: "thin", color: { rgb: "CBD5E1" } };

export function fillStyle(rgb: string): ExcelCellStyle["fill"] {
  return { patternType: "solid", fgColor: { rgb: rgb.replace(/^#/, "").toUpperCase() } };
}

export function headerCellStyle(rgb: string = EXCEL_THEME.primaryHeader): ExcelCellStyle {
  return {
    fill: fillStyle(rgb),
    font: { bold: true, color: { rgb: EXCEL_THEME.onPrimary }, sz: 11, name: "Calibri" },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
    border: { top: THIN, bottom: THIN, left: THIN, right: THIN },
  };
}

export function titleCellStyle(): ExcelCellStyle {
  return {
    font: { bold: true, color: { rgb: EXCEL_THEME.primaryHeader }, sz: 16, name: "Calibri" },
    alignment: { vertical: "center", horizontal: "left", wrapText: true },
  };
}

export function metaCellStyle(): ExcelCellStyle {
  return {
    font: { color: { rgb: EXCEL_THEME.secondaryHeader }, sz: 10, name: "Calibri" },
    alignment: { vertical: "center", horizontal: "left", wrapText: true },
  };
}

export function sectionHeaderStyle(): ExcelCellStyle {
  return {
    fill: fillStyle(EXCEL_THEME.secondaryHeader),
    font: { bold: true, color: { rgb: EXCEL_THEME.onPrimary }, sz: 11, name: "Calibri" },
    alignment: { vertical: "center", horizontal: "left", wrapText: true },
  };
}

export function dataCellStyle(fillRgb?: string): ExcelCellStyle {
  return {
    fill: fillRgb ? fillStyle(fillRgb) : fillStyle(EXCEL_THEME.white),
    font: { sz: 10, name: "Calibri", color: { rgb: "0F172A" } },
    alignment: { vertical: "center", horizontal: "left", wrapText: true },
    border: { top: THIN, bottom: THIN, left: THIN, right: THIN },
  };
}

/** Attendance % threshold for green highlight on Employee Summary. */
export const ATTENDANCE_PCT_GREEN_THRESHOLD = 90;
