/**
 * E3 HR Attendance & Payroll Input Report — multi-sheet Excel composition.
 * Pure builders over attendance daily rows + optional OT claims / corrections.
 * Styling applied at write time via xlsx-js-style (community SheetJS has no fills).
 */

import {
  formatReportingTime12h,
  resolveHoursBasedAttendanceStatus,
  resolveOvertimeMinutes,
  resolveReportingDisplayIso,
  resolveTotalHoursWorked,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import { buildAttendanceMatrixExcelSheet } from "@/lib/attendance-hr/attendance-matrix";
import { FEC_ATTENDANCE_SITES } from "@/lib/attendance-hr/constants";
import { applyE3SheetStyles } from "@/lib/attendance-hr/excel-style";
import {
  ATTENDANCE_PCT_GREEN_THRESHOLD,
  E3_SHEET_TAB_COLORS,
  EXCEL_THEME,
} from "@/lib/attendance-hr/excel-theme";
import {
  attendanceHrExportStaffName,
  attendanceHrIdentityKey,
  attendanceHrToListingSource,
  formatAttendanceHrLocation,
  type AttendanceHrReportRow,
} from "@/lib/attendance-hr/report";

export const E3_HR_EXPORT_SHEET_NAMES = [
  "01 HR Summary",
  "02 Employee Summary",
  "03 Attendance Matrix",
  "04 Daily Attendance",
  "05 Late & Early Exit",
  "06 Absence & Leave",
  "07 Missed Punches",
  "08 Overtime",
  "09 Payroll Input",
  "10 Data Issues",
  "11 Raw Punches",
  "12 Audit Trail",
] as const;

export type ExcelSheetSpec = {
  name: string;
  aoa: (string | number | boolean | null)[][];
  merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  freeze?: { xSplit: number; ySplit: number };
  cols?: Array<{ wch: number }>;
  /** 0-based header row for auto-filter (omit when no table). */
  filterHeaderRow?: number;
  titleRowCount?: number;
  sectionHeaderRows?: number[];
  cellFills?: Record<string, string>;
  alternatingRows?: boolean;
  tabColor?: string;
};

export type ExportFilterMeta = {
  locationLabel?: string;
  departmentLabel?: string;
  statusLabel?: string;
};

export type ExportOtClaim = {
  staffId: string;
  workDate: string;
  rateType: string;
  calculatedMinutes: number;
  approvedMinutes: number | null;
  status: string;
  notes?: string | null;
};

export type ExportCorrection = {
  requestedAt: string;
  staffId: string | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  workDate: string | null;
  kind: string;
  originalValue: unknown;
  newValue: unknown;
  reason: string;
  requestedBy?: string | null;
  reviewedBy?: string | null;
  status: string;
};

export type ExportPunchRow = {
  id?: string;
  location_id?: string | null;
  device_id?: string | null;
  staff_id?: string | null;
  biometric_user_id?: string | null;
  punch_at?: string | null;
  punch_type?: string | null;
  source?: string | null;
  probable_duplicate?: boolean | null;
  excluded_from_calc?: boolean | null;
  attendance_date?: string | null;
  device_user_name?: string | null;
};

export type ExportUnmatchedMapping = {
  biometric_user_id?: string | null;
  device_name?: string | null;
  full_name?: string | null;
  employee_code?: string | null;
  location_id?: string | null;
  device_id?: string | null;
  department?: string | null;
  job_title?: string | null;
};

export type ExportImportFile = {
  original_filename?: string | null;
  status?: string | null;
  created_at?: string | null;
  unmatched_count?: number | null;
  rejected_count?: number | null;
  duplicate_count?: number | null;
  location_id?: string | null;
};

export type BuildE3AttendanceHrWorkbookInput = {
  daily: AttendanceHrReportRow[];
  punches: ExportPunchRow[];
  unmatched: ExportUnmatchedMapping[];
  imports: ExportImportFile[];
  otClaims?: ExportOtClaim[];
  corrections?: ExportCorrection[];
  dateFrom: string;
  dateTo: string;
  generatedAt?: Date;
  filters?: ExportFilterMeta;
  /** When set, only include matching sheet names (same calc dataset). */
  sheetNames?: string[];
};

const LEAVE_STATUSES = new Set(["annual_leave", "sick_leave", "unpaid_leave"]);
const ABSENCE_LEAVE_STATUSES = new Set([
  "absent",
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "weekly_off",
  "public_holiday",
]);
const APPROVED_OT_STATUSES = new Set(["hr_approved", "payroll_posted"]);

function blank(v: string | null | undefined): string {
  return v?.trim() || "";
}

/** DD-MMM-YYYY (UTC calendar day). */
export function formatHrExportDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const iso = String(ymd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(ymd);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00.000Z`));
}

export function formatHrExportPeriod(dateFrom: string, dateTo: string): string {
  return `${formatHrExportDate(dateFrom)} – ${formatHrExportDate(dateTo)}`;
}

export function formatHrExportGeneratedAt(at: Date): string {
  return at.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Qatar",
  });
}

export function formatExportFilterLine(filters?: ExportFilterMeta): string {
  const location = blank(filters?.locationLabel) || "All Locations";
  const department = blank(filters?.departmentLabel) || "All Departments";
  const status = blank(filters?.statusLabel);
  const parts = [`Location: ${location}`, `Department: ${department}`];
  if (status && status !== "All statuses" && status !== "all") parts.push(`Status: ${status}`);
  return `Filters: ${parts.join("  |  ")}`;
}

/** Shared E3 title block for every HR-facing sheet. */
export function buildE3ExportTitleRows(
  dateFrom: string,
  dateTo: string,
  generatedAt: Date,
  filters?: ExportFilterMeta,
  title = "E3 – HR Attendance Report",
): (string | number | boolean | null)[][] {
  return [
    [title],
    [`Reporting Period: ${formatHrExportPeriod(dateFrom, dateTo)}`],
    [`Generated On: ${formatHrExportGeneratedAt(generatedAt)}`],
    [formatExportFilterLine(filters)],
    [],
  ];
}

export function e3AttendanceExportFilename(
  dateFrom: string,
  dateTo: string,
  kind: "xlsx" | "csv" | "pdf" | "payroll" | "employee" | "matrix" | "payroll-input" = "xlsx",
): string {
  const from = dateFrom.slice(0, 10);
  const to = dateTo.slice(0, 10);
  switch (kind) {
    case "csv":
      return `E3_HR_Attendance_${from}_to_${to}.csv`;
    case "pdf":
      return `E3_HR_Attendance_${from}_to_${to}.pdf`;
    case "payroll":
      return `E3_HR_Payroll_${from}_to_${to}.xlsx`;
    case "employee":
      return `E3_Employee_Summary_${from}_to_${to}.xlsx`;
    case "matrix":
      return `E3_Attendance_Matrix_${from}_to_${to}.xlsx`;
    case "payroll-input":
      return `E3_Payroll_Input_${from}_to_${to}.xlsx`;
    default:
      return `E3_HR_Attendance_${from}_to_${to}.xlsx`;
  }
}

/** Map UI focus query → sheet name filter (no second calc engine). */
export function sheetsForExportFocus(focus: string | null | undefined): string[] | undefined {
  switch ((focus ?? "").toLowerCase()) {
    case "employee":
    case "employee-summary":
      return ["02 Employee Summary"];
    case "matrix":
      return ["03 Attendance Matrix"];
    case "payroll":
    case "payroll-input":
      return ["09 Payroll Input"];
    default:
      return undefined;
  }
}

function hoursFromMinutes(mins: number | null | undefined): number {
  const n = Number(mins ?? 0);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.round((n / 60) * 100) / 100;
}

function numericHours(hours: number | null | undefined): number {
  if (hours == null || !Number.isFinite(hours)) return 0;
  return Math.round(hours * 100) / 100;
}

function listingOf(row: AttendanceHrReportRow): AttendanceListingSource {
  return attendanceHrToListingSource(row);
}

function locationCodeOf(row: AttendanceHrReportRow): string {
  return blank(row.location_code) || attendanceMatrixLoc(row);
}

function attendanceMatrixLoc(row: AttendanceHrReportRow): string {
  const label = formatAttendanceHrLocation(row.location_code, row.location_name);
  return label.split("—")[0]?.trim() || label;
}

/**
 * HR Attendance Status — separate from punch completeness.
 * Missed OUT/IN does not become Absent when a punch exists.
 */
export function resolveHrAttendanceStatus(row: AttendanceHrReportRow): string {
  const listing = listingOf(row);
  const resolved = resolveHoursBasedAttendanceStatus(listing);
  const hasIn = Boolean(row.actual_in);
  const hasOut = Boolean(row.actual_out);

  if (resolved === "weekly_off") return "Weekly Off";
  if (resolved === "public_holiday") return "Public Holiday";
  if (resolved === "annual_leave") return "Annual Leave";
  if (resolved === "sick_leave") return "Sick Leave";
  if (resolved === "unpaid_leave") return "Unpaid Leave";
  if (resolved === "unscheduled") return "Unscheduled";
  if (resolved === "review_required") return "Pending Review";
  if (resolved === "absent") return "Absent";

  if (resolved === "missed_punch" || (hasIn !== hasOut && (hasIn || hasOut))) {
    if (hasIn || hasOut) {
      if (Number(row.late_minutes) > 0 || resolved === "late") return "Late";
      return "Present";
    }
    return "Missed Punch";
  }

  if (resolved === "late") return "Late";
  if (resolved === "early_departure" || resolved === "early_leave") return "Present";
  if (resolved === "short_hours") return "Present";
  if (resolved === "overtime") return "Present";
  if (resolved === "present" || resolved === "complete") return "Present";
  return getAttendanceLabelFallback(resolved);
}

function getAttendanceLabelFallback(key: string): string {
  if (!key) return "Pending Review";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Punch completeness — independent of attendance status. */
export function resolveHrPunchStatus(row: Pick<AttendanceHrReportRow, "actual_in" | "actual_out">): string {
  const hasIn = Boolean(row.actual_in);
  const hasOut = Boolean(row.actual_out);
  if (hasIn && hasOut) {
    const inMs = new Date(row.actual_in!).getTime();
    const outMs = new Date(row.actual_out!).getTime();
    if (Number.isFinite(inMs) && Number.isFinite(outMs) && outMs < inMs) return "Invalid Punch Sequence";
    return "Complete";
  }
  if (hasIn && !hasOut) return "Missing OUT";
  if (!hasIn && hasOut) return "Missing IN";
  return "Both Missing";
}

function missingPunchType(row: AttendanceHrReportRow): string {
  const punch = resolveHrPunchStatus(row);
  if (punch === "Missing IN" || punch === "Missing OUT" || punch === "Both Missing" || punch === "Invalid Punch Sequence") {
    return punch;
  }
  return "Missing OUT";
}

function leaveTypeLabel(status: string): string {
  switch (status) {
    case "annual_leave":
      return "Annual Leave";
    case "sick_leave":
      return "Sick Leave";
    case "unpaid_leave":
      return "Unpaid Leave";
    default:
      return "";
  }
}

function payrollImpact(status: string): string {
  if (status === "unpaid_leave" || status === "absent") return "Unpaid";
  if (LEAVE_STATUSES.has(status) || status === "public_holiday" || status === "weekly_off") return "Paid / Off";
  return "";
}

function otTypeForDay(row: AttendanceHrReportRow): string {
  const status = resolveHoursBasedAttendanceStatus(listingOf(row));
  if (status === "weekly_off") return "Rest Day OT";
  if (status === "public_holiday") return "Public Holiday OT";
  return "Regular OT";
}

function otRateBucket(rateType: string): "regular" | "rest" | "ph" {
  const t = rateType.toLowerCase();
  if (t.includes("weekly_off") || t.includes("rest") || t === "eid") return "rest";
  if (t.includes("public_holiday") || t.includes("holiday")) return "ph";
  return "regular";
}

type EmpAgg = {
  staffId: string;
  code: string;
  name: string;
  department: string;
  designation: string;
  location: string;
  employmentType: string;
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
  paidLeave: number;
  sickLeave: number;
  unpaidLeave: number;
  weeklyOff: number;
  publicHoliday: number;
  scheduledMinutes: number;
  workedMinutes: number;
  lateInstances: number;
  lateMinutes: number;
  earlyInstances: number;
  earlyMinutes: number;
  missedPunches: number;
  regularOtMinutes: number;
  restOtMinutes: number;
  phOtMinutes: number;
  approvedOtMinutes: number;
};

function emptyAgg(row: AttendanceHrReportRow): EmpAgg {
  return {
    staffId: row.staff_id ?? attendanceHrIdentityKey(row),
    code: blank(row.employee_code),
    name: attendanceHrExportStaffName(row),
    department: blank(row.department),
    designation: blank(row.job_title),
    location: locationCodeOf(row),
    employmentType: blank(row.employment_type),
    scheduledDays: 0,
    presentDays: 0,
    absentDays: 0,
    paidLeave: 0,
    sickLeave: 0,
    unpaidLeave: 0,
    weeklyOff: 0,
    publicHoliday: 0,
    scheduledMinutes: 0,
    workedMinutes: 0,
    lateInstances: 0,
    lateMinutes: 0,
    earlyInstances: 0,
    earlyMinutes: 0,
    missedPunches: 0,
    regularOtMinutes: 0,
    restOtMinutes: 0,
    phOtMinutes: 0,
    approvedOtMinutes: 0,
  };
}

function isScheduledDay(status: string): boolean {
  return status !== "unscheduled" && status !== "weekly_off" && status !== "public_holiday";
}

function aggregateEmployees(
  daily: AttendanceHrReportRow[],
  otClaims: ExportOtClaim[],
): EmpAgg[] {
  const byStaff = new Map<string, EmpAgg>();
  for (const row of daily) {
    if (!row.staff_id) continue;
    const key = row.staff_id;
    const cur = byStaff.get(key) ?? emptyAgg(row);
    const listing = listingOf(row);
    const status = resolveHoursBasedAttendanceStatus(listing);
    const att = resolveHrAttendanceStatus(row);
    const punch = resolveHrPunchStatus(row);
    if (!cur.code && blank(row.employee_code)) cur.code = blank(row.employee_code);
    if (blank(row.staff_name)) cur.name = attendanceHrExportStaffName(row);
    if (!cur.department && blank(row.department)) cur.department = blank(row.department);
    if (!cur.designation && blank(row.job_title)) cur.designation = blank(row.job_title);
    if (locationCodeOf(row)) cur.location = locationCodeOf(row);
    if (!cur.employmentType && blank(row.employment_type)) cur.employmentType = blank(row.employment_type);

    cur.scheduledDays += 1;
    if (att === "Present" || att === "Late") cur.presentDays += 1;
    if (status === "absent") cur.absentDays += 1;
    if (status === "annual_leave") cur.paidLeave += 1;
    if (status === "sick_leave") cur.sickLeave += 1;
    if (status === "unpaid_leave") cur.unpaidLeave += 1;
    if (status === "weekly_off") cur.weeklyOff += 1;
    if (status === "public_holiday") cur.publicHoliday += 1;

    cur.scheduledMinutes += Number(row.expected_minutes ?? 0) || 0;
    const worked = resolveTotalHoursWorked(listing);
    if (worked != null) cur.workedMinutes += Math.round(worked * 60);

    const late = Number(row.late_minutes ?? 0);
    if (late > 0) {
      cur.lateInstances += 1;
      cur.lateMinutes += late;
    }
    const early = Number(row.early_leave_minutes ?? 0);
    if (early > 0) {
      cur.earlyInstances += 1;
      cur.earlyMinutes += early;
    }
    const offOrLeave =
      status === "weekly_off" || status === "public_holiday" || LEAVE_STATUSES.has(status);
    if (!offOrLeave && (punch.startsWith("Missing") || punch === "Both Missing" || punch === "Invalid Punch Sequence")) {
      cur.missedPunches += 1;
    }

    const otMins = resolveOvertimeMinutes(listing);
    if (otMins > 0) {
      const bucket = otTypeForDay(row);
      if (bucket === "Rest Day OT") cur.restOtMinutes += otMins;
      else if (bucket === "Public Holiday OT") cur.phOtMinutes += otMins;
      else cur.regularOtMinutes += otMins;
    }

    byStaff.set(key, cur);
  }

  for (const claim of otClaims) {
    if (!APPROVED_OT_STATUSES.has(claim.status)) continue;
    const cur = byStaff.get(claim.staffId);
    if (!cur) continue;
    const mins = Number(claim.approvedMinutes ?? claim.calculatedMinutes ?? 0);
    if (mins <= 0) continue;
    cur.approvedOtMinutes += mins;
    const bucket = otRateBucket(claim.rateType);
    // Approved OT supersedes calculated bucket only for the approved total column;
    // keep calculated buckets from daily unless claim is the only source.
    if (cur.regularOtMinutes + cur.restOtMinutes + cur.phOtMinutes === 0) {
      if (bucket === "rest") cur.restOtMinutes += mins;
      else if (bucket === "ph") cur.phOtMinutes += mins;
      else cur.regularOtMinutes += mins;
    }
  }

  return [...byStaff.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function attendancePct(present: number, scheduled: number): number {
  if (scheduled <= 0) return 0;
  return Math.round((present / scheduled) * 1000) / 10;
}

function payableDays(agg: EmpAgg): number {
  return agg.presentDays + agg.paidLeave + agg.sickLeave + agg.publicHoliday;
}

function colsFor(headers: string[], min = 10, max = 28): Array<{ wch: number }> {
  return headers.map((h) => ({ wch: Math.max(min, Math.min(max, h.length + 2)) }));
}

type TableSheetOpts = {
  titleRows?: (string | number | boolean | null)[][];
  freezeCols?: number;
  cellFills?: Record<string, string>;
  alternatingRows?: boolean;
  tabColor?: string;
};

function tableSheet(
  name: string,
  headers: string[],
  rows: (string | number | boolean | null)[][],
  opts?: TableSheetOpts,
): ExcelSheetSpec {
  const titleRows = opts?.titleRows ?? [];
  const aoa = [...titleRows, headers, ...rows];
  const headerRow = titleRows.length;
  return {
    name,
    aoa,
    freeze: { xSplit: opts?.freezeCols ?? 0, ySplit: headerRow + 1 },
    cols: colsFor(headers),
    filterHeaderRow: rows.length || headers.length ? headerRow : undefined,
    titleRowCount: titleRows.length,
    cellFills: opts?.cellFills,
    alternatingRows: opts?.alternatingRows,
    tabColor: opts?.tabColor ?? E3_SHEET_TAB_COLORS[name],
  };
}

type SheetContext = {
  dateFrom: string;
  dateTo: string;
  generatedAt: Date;
  filters?: ExportFilterMeta;
};

function titleRowsFor(ctx: SheetContext, title?: string) {
  return buildE3ExportTitleRows(ctx.dateFrom, ctx.dateTo, ctx.generatedAt, ctx.filters, title);
}

function buildHrSummary(
  daily: AttendanceHrReportRow[],
  employees: EmpAgg[],
  ctx: SheetContext,
): ExcelSheetSpec {
  const { dateFrom, dateTo, generatedAt } = ctx;
  const mapped = daily.filter((r) => r.staff_id);
  const locationCodes = new Set(mapped.map((r) => locationCodeOf(r)).filter(Boolean));
  const withAttendance = new Set<string>();
  const withExceptions = new Set<string>();
  let scheduledDays = 0;
  let presentDays = 0;
  let absentDays = 0;
  let weeklyOff = 0;
  let leaveDays = 0;
  let lateInstances = 0;
  let lateMinutes = 0;
  let earlyInstances = 0;
  let earlyMinutes = 0;
  let missed = 0;
  let workedMinutes = 0;
  let approvedOt = 0;

  for (const e of employees) {
    approvedOt += e.approvedOtMinutes;
    if (e.presentDays > 0) withAttendance.add(e.staffId);
    if (e.lateInstances || e.earlyInstances || e.missedPunches || e.absentDays) withExceptions.add(e.staffId);
  }

  for (const row of mapped) {
    const status = resolveHoursBasedAttendanceStatus(listingOf(row));
    if (isScheduledDay(status) || LEAVE_STATUSES.has(status) || status === "weekly_off" || status === "public_holiday") {
      scheduledDays += 1;
    }
    const att = resolveHrAttendanceStatus(row);
    if (att === "Present" || att === "Late") presentDays += 1;
    if (status === "absent") absentDays += 1;
    if (status === "weekly_off") weeklyOff += 1;
    if (LEAVE_STATUSES.has(status)) leaveDays += 1;
    if (Number(row.late_minutes) > 0) {
      lateInstances += 1;
      lateMinutes += Number(row.late_minutes);
    }
    if (Number(row.early_leave_minutes) > 0) {
      earlyInstances += 1;
      earlyMinutes += Number(row.early_leave_minutes);
    }
    if (status === "missed_punch" || resolveHrPunchStatus(row).startsWith("Missing") || resolveHrPunchStatus(row) === "Both Missing") {
      missed += 1;
    }
    const worked = resolveTotalHoursWorked(listingOf(row));
    if (worked != null) workedMinutes += Math.round(worked * 60);
  }

  const locStats = new Map<
    string,
    { employees: Set<string>; present: number; absent: number; late: number; early: number; missed: number; ot: number }
  >();
  const ensureLoc = (code: string) => {
    if (!locStats.has(code)) {
      locStats.set(code, {
        employees: new Set(),
        present: 0,
        absent: 0,
        late: 0,
        early: 0,
        missed: 0,
        ot: 0,
      });
    }
    return locStats.get(code)!;
  };
  for (const code of FEC_ATTENDANCE_SITES.map((s) => s.code)) ensureLoc(code);
  for (const row of mapped) {
    const code = locationCodeOf(row) || "OTHER";
    const s = ensureLoc(code);
    if (row.staff_id) s.employees.add(row.staff_id);
    const att = resolveHrAttendanceStatus(row);
    if (att === "Present" || att === "Late") s.present += 1;
    if (resolveHoursBasedAttendanceStatus(listingOf(row)) === "absent") s.absent += 1;
    if (Number(row.late_minutes) > 0) s.late += 1;
    if (Number(row.early_leave_minutes) > 0) s.early += 1;
    if (
      resolveHoursBasedAttendanceStatus(listingOf(row)) === "missed_punch" ||
      resolveHrPunchStatus(row).startsWith("Missing") ||
      resolveHrPunchStatus(row) === "Both Missing"
    ) {
      s.missed += 1;
    }
    s.ot += resolveOvertimeMinutes(listingOf(row));
  }

  const preferred = ["KDS-CC", "INF-CC", "UA-DM", "CB-VM", "CB-DSM", "CAR-AP"];
  const locOrder = [
    ...preferred.filter((c) => locStats.has(c)),
    ...[...locStats.keys()].filter((c) => !preferred.includes(c)).sort(),
  ];

  const title = titleRowsFor(ctx, "E3 – Monthly Attendance Report");
  const aoa: (string | number | boolean | null)[][] = [
    ...title,
    ["Workforce Summary"],
    ["Metric", "Value"],
    ["Total Employees", employees.length],
    ["Active Employees", employees.length],
    ["Locations Covered", locationCodes.size],
    ["Scheduled Employees", employees.filter((e) => e.scheduledDays > 0).length],
    ["Employees With Attendance", withAttendance.size],
    ["Employees With Exceptions", withExceptions.size],
    [],
    ["Attendance Summary"],
    ["Metric", "Value"],
    ["Total Scheduled Days", scheduledDays],
    ["Total Present Days", presentDays],
    ["Total Absent Days", absentDays],
    ["Total Weekly Off Days", weeklyOff],
    ["Total Leave Days", leaveDays],
    ["Total Late Instances", lateInstances],
    ["Total Late Hours", hoursFromMinutes(lateMinutes)],
    ["Total Early Exit Instances", earlyInstances],
    ["Total Early Exit Hours", hoursFromMinutes(earlyMinutes)],
    ["Total Missed Punches", missed],
    ["Total Worked Hours", hoursFromMinutes(workedMinutes)],
    ["Total Approved OT Hours", hoursFromMinutes(approvedOt)],
    [],
    ["Location Summary"],
    [
      "Location",
      "Employees",
      "Present Days",
      "Absent Days",
      "Late Cases",
      "Early Exits",
      "Missed Punches",
      "OT Hours",
      "Attendance %",
    ],
  ];

  const cellFills: Record<string, string> = {};
  const sectionHeaderRows: number[] = [];
  // Find section headers by scanning aoa after build of static part
  for (let i = 0; i < aoa.length; i++) {
    const v = aoa[i]![0];
    if (v === "Workforce Summary" || v === "Attendance Summary" || v === "Location Summary") {
      sectionHeaderRows.push(i);
    }
  }

  // KPI value coloring for Attendance Summary metrics
  const kpiFills: Record<string, string> = {
    "Total Present Days": EXCEL_THEME.present,
    "Total Absent Days": EXCEL_THEME.absent,
    "Total Late Instances": EXCEL_THEME.late,
    "Total Late Hours": EXCEL_THEME.late,
    "Total Missed Punches": EXCEL_THEME.missedPunch,
    "Total Leave Days": EXCEL_THEME.leave,
    "Total Weekly Off Days": EXCEL_THEME.weeklyOff,
    "Total Approved OT Hours": EXCEL_THEME.overtime,
    "Employees With Attendance": EXCEL_THEME.present,
    "Employees With Exceptions": EXCEL_THEME.warning,
  };
  for (let r = 0; r < aoa.length; r++) {
    const label = String(aoa[r]?.[0] ?? "");
    if (kpiFills[label] && aoa[r]!.length > 1) {
      cellFills[`${r},1`] = kpiFills[label]!;
    }
  }

  const locHeaderRow = aoa.length - 1;
  for (const code of locOrder) {
    const s = locStats.get(code)!;
    const denom = s.present + s.absent;
    aoa.push([
      code,
      s.employees.size,
      s.present,
      s.absent,
      s.late,
      s.early,
      s.missed,
      hoursFromMinutes(s.ot),
      denom > 0 ? attendancePct(s.present, denom) : 0,
    ]);
  }

  // Alternating location data rows
  for (let i = 0; i < locOrder.length; i++) {
    const r = locHeaderRow + 1 + i;
    if (i % 2 === 1) {
      for (let c = 0; c < 9; c++) {
        if (!cellFills[`${r},${c}`]) cellFills[`${r},${c}`] = EXCEL_THEME.altRow;
      }
    }
  }

  return {
    name: "01 HR Summary",
    aoa,
    freeze: { xSplit: 0, ySplit: title.length },
    cols: [
      { wch: 28 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
    ],
    titleRowCount: title.length,
    sectionHeaderRows,
    cellFills,
    tabColor: E3_SHEET_TAB_COLORS["01 HR Summary"],
  };
}

export const EMPLOYEE_SUMMARY_HEADERS = [
  "Sr. No.",
  "Employee Code",
  "Employee Name",
  "Department",
  "Designation",
  "Location",
  "Employment Type",
  "Reporting Manager",
  "Scheduled Days",
  "Present Days",
  "Absent Days",
  "Paid Leave",
  "Sick Leave",
  "Unpaid Leave",
  "Weekly Off",
  "Public Holiday",
  "Scheduled Hours",
  "Worked Hours",
  "Late Instances",
  "Late Minutes",
  "Early Exit Instances",
  "Early Exit Minutes",
  "Missed Punches",
  "Regular OT Hours",
  "Rest Day OT Hours",
  "Public Holiday OT Hours",
  "Total OT Hours",
  "Attendance %",
  "Payroll Payable Days",
  "HR Remarks",
  "HR Review Status",
] as const;

/** Exception / threshold fills for Employee Summary — does not recolor every cell. */
export function employeeSummaryCellFills(
  dataRows: (string | number | boolean | null)[][],
  headerRow: number,
): Record<string, string> {
  const fills: Record<string, string> = {};
  const col = {
    present: EMPLOYEE_SUMMARY_HEADERS.indexOf("Present Days"),
    absent: EMPLOYEE_SUMMARY_HEADERS.indexOf("Absent Days"),
    paidLeave: EMPLOYEE_SUMMARY_HEADERS.indexOf("Paid Leave"),
    sickLeave: EMPLOYEE_SUMMARY_HEADERS.indexOf("Sick Leave"),
    unpaidLeave: EMPLOYEE_SUMMARY_HEADERS.indexOf("Unpaid Leave"),
    late: EMPLOYEE_SUMMARY_HEADERS.indexOf("Late Instances"),
    missed: EMPLOYEE_SUMMARY_HEADERS.indexOf("Missed Punches"),
    regularOt: EMPLOYEE_SUMMARY_HEADERS.indexOf("Regular OT Hours"),
    restOt: EMPLOYEE_SUMMARY_HEADERS.indexOf("Rest Day OT Hours"),
    phOt: EMPLOYEE_SUMMARY_HEADERS.indexOf("Public Holiday OT Hours"),
    totalOt: EMPLOYEE_SUMMARY_HEADERS.indexOf("Total OT Hours"),
    pct: EMPLOYEE_SUMMARY_HEADERS.indexOf("Attendance %"),
    review: EMPLOYEE_SUMMARY_HEADERS.indexOf("HR Review Status"),
  };

  dataRows.forEach((row, i) => {
    const r = headerRow + 1 + i;
    if (Number(row[col.present]) > 0) fills[`${r},${col.present}`] = EXCEL_THEME.present;
    if (Number(row[col.absent]) > 0) fills[`${r},${col.absent}`] = EXCEL_THEME.absent;
    if (Number(row[col.paidLeave]) > 0) fills[`${r},${col.paidLeave}`] = EXCEL_THEME.leave;
    if (Number(row[col.sickLeave]) > 0) fills[`${r},${col.sickLeave}`] = EXCEL_THEME.leave;
    if (Number(row[col.unpaidLeave]) > 0) fills[`${r},${col.unpaidLeave}`] = EXCEL_THEME.unpaidLeave;
    if (Number(row[col.late]) > 0) fills[`${r},${col.late}`] = EXCEL_THEME.late;
    if (Number(row[col.missed]) > 0) fills[`${r},${col.missed}`] = EXCEL_THEME.missedPunch;
    for (const c of [col.regularOt, col.restOt, col.phOt, col.totalOt]) {
      if (Number(row[c]) > 0) fills[`${r},${c}`] = EXCEL_THEME.overtime;
    }
    const pct = Number(row[col.pct]);
    if (Number.isFinite(pct) && pct >= ATTENDANCE_PCT_GREEN_THRESHOLD) {
      fills[`${r},${col.pct}`] = EXCEL_THEME.present;
    }
    const review = String(row[col.review] ?? "");
    if (/^approved$/i.test(review)) fills[`${r},${col.review}`] = EXCEL_THEME.approved;
    else if (/correction/i.test(review)) fills[`${r},${col.review}`] = EXCEL_THEME.critical;
    else if (/pending/i.test(review)) fills[`${r},${col.review}`] = EXCEL_THEME.warning;
  });
  return fills;
}

function buildEmployeeSummary(employees: EmpAgg[], ctx: SheetContext): ExcelSheetSpec {
  const headers = [...EMPLOYEE_SUMMARY_HEADERS];
  const rows = employees.map((e, i) => {
    const totalOt = e.regularOtMinutes + e.restOtMinutes + e.phOtMinutes;
    return [
      i + 1,
      e.code,
      e.name,
      e.department,
      e.designation,
      e.location,
      e.employmentType,
      "",
      e.scheduledDays,
      e.presentDays,
      e.absentDays,
      e.paidLeave,
      e.sickLeave,
      e.unpaidLeave,
      e.weeklyOff,
      e.publicHoliday,
      hoursFromMinutes(e.scheduledMinutes),
      hoursFromMinutes(e.workedMinutes),
      e.lateInstances,
      Math.round(e.lateMinutes * 100) / 100,
      e.earlyInstances,
      Math.round(e.earlyMinutes * 100) / 100,
      e.missedPunches,
      hoursFromMinutes(e.regularOtMinutes),
      hoursFromMinutes(e.restOtMinutes),
      hoursFromMinutes(e.phOtMinutes),
      hoursFromMinutes(totalOt),
      attendancePct(e.presentDays, Math.max(e.scheduledDays - e.weeklyOff - e.publicHoliday, e.presentDays + e.absentDays)),
      payableDays(e),
      "",
      "Pending",
    ];
  });
  const titleRows = titleRowsFor(ctx, "E3 – Employee Summary");
  const headerRow = titleRows.length;
  return tableSheet("02 Employee Summary", headers, rows, {
    titleRows,
    freezeCols: 3,
    cellFills: employeeSummaryCellFills(rows, headerRow),
  });
}

function buildDailyAttendance(daily: AttendanceHrReportRow[], ctx: SheetContext): ExcelSheetSpec {
  const headers = [
    "Date",
    "Employee Code",
    "Employee Name",
    "Department",
    "Designation",
    "Location",
    "Reporting Time",
    "Shift Start",
    "First Check-In",
    "Last Check-Out",
    "Scheduled Hours",
    "Worked Hours",
    "Late Minutes",
    "Early Exit Minutes",
    "OT Hours",
    "Attendance Status",
    "Punch Status",
    "Remarks",
  ];
  const sorted = [...daily].sort((a, b) => {
    const d = String(a.work_date).localeCompare(String(b.work_date));
    if (d !== 0) return d;
    return attendanceHrExportStaffName(a).localeCompare(attendanceHrExportStaffName(b), undefined, {
      sensitivity: "base",
    });
  });
  const rows = sorted.map((row) => {
    const listing = listingOf(row);
    const worked = resolveTotalHoursWorked(listing);
    const ot = resolveOvertimeMinutes(listing);
    const punch = resolveHrPunchStatus(row);
    const att = resolveHrAttendanceStatus(row);
    const remarks =
      punch !== "Complete" && (att === "Present" || att === "Late")
        ? `${att}; ${punch}`
        : punch !== "Complete"
          ? punch
          : "";
    return [
      formatHrExportDate(row.work_date),
      blank(row.employee_code),
      attendanceHrExportStaffName(row),
      blank(row.department),
      blank(row.job_title),
      locationCodeOf(row),
      formatReportingTime12h(resolveReportingDisplayIso(listing)) || "",
      formatReportingTime12h(row.scheduled_in) || "",
      formatReportingTime12h(row.actual_in) || "",
      formatReportingTime12h(row.actual_out) || "",
      hoursFromMinutes(row.expected_minutes),
      numericHours(worked),
      Number(row.late_minutes) > 0 ? Math.round(Number(row.late_minutes) * 100) / 100 : 0,
      Number(row.early_leave_minutes) > 0 ? Math.round(Number(row.early_leave_minutes) * 100) / 100 : 0,
      hoursFromMinutes(ot),
      att,
      punch,
      remarks,
    ];
  });
  return tableSheet("04 Daily Attendance", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 3,
    alternatingRows: true,
  });
}

function buildLateEarly(daily: AttendanceHrReportRow[], ctx: SheetContext): ExcelSheetSpec {
  const headers = [
    "Date",
    "Employee Code",
    "Employee Name",
    "Location",
    "Shift Start",
    "Actual Check-In",
    "Late Minutes",
    "Shift End",
    "Actual Check-Out",
    "Early Exit Minutes",
    "Total Attendance Exception Minutes",
    "Reason",
    "Approved/Excused",
    "Approved By",
    "HR Remarks",
  ];
  const rows = daily
    .filter((r) => Number(r.late_minutes) > 0 || Number(r.early_leave_minutes) > 0)
    .map((row) => {
      const late = Number(row.late_minutes) || 0;
      const early = Number(row.early_leave_minutes) || 0;
      return [
        formatHrExportDate(row.work_date),
        blank(row.employee_code),
        attendanceHrExportStaffName(row),
        locationCodeOf(row),
        formatReportingTime12h(row.scheduled_in) || "",
        formatReportingTime12h(row.actual_in) || "",
        late > 0 ? Math.round(late * 100) / 100 : 0,
        formatReportingTime12h(row.scheduled_out) || "",
        formatReportingTime12h(row.actual_out) || "",
        early > 0 ? Math.round(early * 100) / 100 : 0,
        Math.round((late + early) * 100) / 100,
        "",
        "",
        "",
        "",
      ];
    });
  return tableSheet("05 Late & Early Exit", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 3,
  });
}

function buildAbsenceLeave(daily: AttendanceHrReportRow[], ctx: SheetContext): ExcelSheetSpec {
  const headers = [
    "Date",
    "Employee Code",
    "Employee Name",
    "Location",
    "Scheduled Status",
    "Attendance Status",
    "Leave Type",
    "Leave Request No.",
    "Approved Leave",
    "Payroll Impact",
    "Reason",
    "HR Remarks",
  ];
  const rows = daily
    .filter((r) => ABSENCE_LEAVE_STATUSES.has(resolveHoursBasedAttendanceStatus(listingOf(r))))
    .map((row) => {
      const status = resolveHoursBasedAttendanceStatus(listingOf(row));
      const leave = leaveTypeLabel(status);
      return [
        formatHrExportDate(row.work_date),
        blank(row.employee_code),
        attendanceHrExportStaffName(row),
        locationCodeOf(row),
        status === "weekly_off" ? "Weekly Off" : status === "public_holiday" ? "Public Holiday" : "Scheduled",
        resolveHrAttendanceStatus(row),
        leave,
        "",
        leave ? "Yes" : "",
        payrollImpact(status),
        "",
        "",
      ];
    });
  return tableSheet("06 Absence & Leave", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 3,
  });
}

function buildMissedPunches(daily: AttendanceHrReportRow[], ctx: SheetContext): ExcelSheetSpec {
  const headers = [
    "Date",
    "Employee Code",
    "Employee Name",
    "Location",
    "Expected Shift",
    "Available Punch",
    "Missing Punch Type",
    "Employee Explanation",
    "Supervisor Verification",
    "HR Decision",
    "Corrected IN",
    "Corrected OUT",
    "Correction By",
    "Correction Date",
    "Status",
  ];
  const rows = daily
    .filter((r) => {
      const punch = resolveHrPunchStatus(r);
      return punch !== "Complete";
    })
    .filter((r) => {
      const status = resolveHoursBasedAttendanceStatus(listingOf(r));
      if (
        (status === "weekly_off" || status === "public_holiday" || LEAVE_STATUSES.has(status)) &&
        !r.actual_in &&
        !r.actual_out
      ) {
        return false;
      }
      return true;
    })
    .map((row) => {
      const available = row.actual_in
        ? `IN ${formatReportingTime12h(row.actual_in)}`
        : row.actual_out
          ? `OUT ${formatReportingTime12h(row.actual_out)}`
          : "";
      const shift =
        row.scheduled_in || row.scheduled_out
          ? `${formatReportingTime12h(row.scheduled_in) || "—"} – ${formatReportingTime12h(row.scheduled_out) || "—"}`
          : "";
      return [
        formatHrExportDate(row.work_date),
        blank(row.employee_code),
        attendanceHrExportStaffName(row),
        locationCodeOf(row),
        shift,
        available,
        missingPunchType(row),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "Pending",
      ];
    });
  return tableSheet("07 Missed Punches", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 3,
  });
}

function buildOvertime(daily: AttendanceHrReportRow[], otClaims: ExportOtClaim[], ctx: SheetContext): ExcelSheetSpec {
  const headers = [
    "Date",
    "Employee Code",
    "Employee Name",
    "Location",
    "Normal Shift Hours",
    "Worked Hours",
    "OT Type",
    "Calculated OT Hours",
    "Approved OT Hours",
    "Reason",
    "Requested By",
    "Approved By",
    "Approval Status",
    "Payroll Month",
    "Remarks",
  ];
  const claimByKey = new Map<string, ExportOtClaim>();
  for (const c of otClaims) {
    claimByKey.set(`${c.staffId}|${c.workDate.slice(0, 10)}`, c);
  }
  const payrollMonth = ctx.dateFrom.slice(0, 7);
  const rows: (string | number | boolean | null)[][] = [];

  for (const row of daily) {
    if (!row.staff_id) continue;
    const listing = listingOf(row);
    const calc = resolveOvertimeMinutes(listing);
    const claim = claimByKey.get(`${row.staff_id}|${String(row.work_date).slice(0, 10)}`);
    if (calc <= 0 && !claim) continue;
    const approved =
      claim && APPROVED_OT_STATUSES.has(claim.status)
        ? hoursFromMinutes(claim.approvedMinutes ?? claim.calculatedMinutes)
        : 0;
    const worked = resolveTotalHoursWorked(listing);
    rows.push([
      formatHrExportDate(row.work_date),
      blank(row.employee_code),
      attendanceHrExportStaffName(row),
      locationCodeOf(row),
      hoursFromMinutes(row.expected_minutes),
      numericHours(worked),
      claim ? otRateLabel(claim.rateType) : otTypeForDay(row),
      hoursFromMinutes(calc || claim?.calculatedMinutes || 0),
      approved,
      blank(claim?.notes),
      "",
      "",
      claim?.status ?? "Calculated",
      payrollMonth,
      approved > 0 ? "Approved for payroll" : "Pending approval — not for payroll",
    ]);
  }
  return tableSheet("08 Overtime", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 3,
  });
}

function otRateLabel(rateType: string): string {
  const bucket = otRateBucket(rateType);
  if (bucket === "rest") return "Rest Day OT";
  if (bucket === "ph") return "Public Holiday OT";
  if (rateType.toLowerCase().includes("special")) return "Special Approved OT";
  return "Regular OT";
}

function buildPayrollInput(employees: EmpAgg[], ctx: SheetContext): ExcelSheetSpec {
  const { dateFrom, dateTo } = ctx;
  const calendarDays = Math.max(
    1,
    Math.round(
      (new Date(`${dateTo}T12:00:00.000Z`).getTime() - new Date(`${dateFrom}T12:00:00.000Z`).getTime()) / 86_400_000,
    ) + 1,
  );
  const headers = [
    "Employee Code",
    "Employee Name",
    "Position",
    "Department",
    "Location",
    "Employment Type",
    "Calendar Days",
    "Scheduled Working Days",
    "Present Days",
    "Paid Leave Days",
    "Unpaid Leave Days",
    "Absent Days",
    "Weekly Off Days",
    "Public Holidays",
    "Payable Days",
    "Scheduled Hours",
    "Worked Hours",
    "Late Hours",
    "Early Exit Hours",
    "Regular OT Hours",
    "Rest Day OT Hours",
    "Public Holiday OT Hours",
    "Approved OT Hours",
    "Attendance Adjustment Days",
    "Payroll Attendance Status",
    "HR Remarks",
  ];
  const rows = employees.map((e) => {
    const blocking = e.missedPunches > 0 || e.absentDays > 0;
    return [
      e.code,
      e.name,
      e.designation,
      e.department,
      e.location,
      e.employmentType,
      calendarDays,
      Math.max(0, e.scheduledDays - e.weeklyOff - e.publicHoliday),
      e.presentDays,
      e.paidLeave + e.sickLeave,
      e.unpaidLeave,
      e.absentDays,
      e.weeklyOff,
      e.publicHoliday,
      payableDays(e),
      hoursFromMinutes(e.scheduledMinutes),
      hoursFromMinutes(e.workedMinutes),
      hoursFromMinutes(e.lateMinutes),
      hoursFromMinutes(e.earlyMinutes),
      hoursFromMinutes(e.regularOtMinutes),
      hoursFromMinutes(e.restOtMinutes),
      hoursFromMinutes(e.phOtMinutes),
      hoursFromMinutes(e.approvedOtMinutes),
      0,
      blocking ? "Exceptions Open" : "Ready for HR Review",
      "",
    ];
  });
  return tableSheet("09 Payroll Input", headers, rows, {
    titleRows: titleRowsFor(ctx, "E3 – Payroll Input"),
    freezeCols: 2,
  });
}

function buildDataIssues(
  unmatched: ExportUnmatchedMapping[],
  punches: ExportPunchRow[],
  imports: ExportImportFile[],
  daily: AttendanceHrReportRow[],
  ctx: SheetContext,
): ExcelSheetSpec {
  const headers = [
    "Issue Type",
    "Date",
    "Device",
    "Location",
    "Biometric User ID",
    "Device Name",
    "Possible Employee",
    "Employee Code",
    "Issue Description",
    "Recommended Action",
    "Assigned To",
    "Status",
    "Resolved By",
    "Resolved Date",
  ];
  const rows: (string | number | boolean | null)[][] = [];

  for (const u of unmatched) {
    rows.push([
      "Unmatched Biometric User",
      "",
      blank(u.device_id),
      blank(u.location_id),
      blank(u.biometric_user_id),
      blank(u.device_name),
      blank(u.full_name),
      blank(u.employee_code),
      "Biometric identity is not mapped to an Employee Code",
      "Map biometric user to Employee Master via Employee Code",
      "",
      "Open",
      "",
      "",
    ]);
  }

  for (const p of punches) {
    if (!p.probable_duplicate) continue;
    rows.push([
      "Duplicate Punch",
      formatHrExportDate(p.attendance_date || (p.punch_at ?? "").slice(0, 10)),
      blank(p.device_id),
      blank(p.location_id),
      blank(p.biometric_user_id),
      blank(p.device_user_name),
      "",
      "",
      "Punch marked as probable duplicate",
      "Confirm duplicate window / exclude from calculation if confirmed",
      "",
      "Open",
      "",
      "",
    ]);
  }

  for (const row of daily) {
    if (row.staff_id) continue;
    rows.push([
      "Missing Employee Mapping",
      formatHrExportDate(row.work_date),
      blank(row.device_id),
      locationCodeOf(row),
      blank(row.biometric_user_id),
      blank(row.device_name),
      blank(row.device_name),
      "",
      "Daily attendance row has no staff mapping",
      "Map biometric user before payroll",
      "",
      "Open",
      "",
      "",
    ]);
  }

  for (const imp of imports) {
    const rejected = Number(imp.rejected_count ?? 0);
    const unmatchedCount = Number(imp.unmatched_count ?? 0);
    if (rejected <= 0 && unmatchedCount <= 0 && String(imp.status ?? "") !== "failed") continue;
    rows.push([
      "Device Sync Problem",
      formatHrExportDate((imp.created_at ?? "").slice(0, 10)),
      "",
      blank(imp.location_id),
      "",
      "",
      "",
      "",
      `${blank(imp.original_filename) || "Import"} — status ${blank(imp.status)}; rejected=${rejected}; unmatched=${unmatchedCount}`,
      "Review import file and re-process if needed",
      "",
      blank(imp.status) || "Open",
      "",
      "",
    ]);
  }

  return tableSheet("10 Data Issues", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 1,
  });
}

function buildRawPunches(
  punches: ExportPunchRow[],
  staffMeta: Map<string, { code: string; name: string }>,
  ctx: SheetContext,
): ExcelSheetSpec {
  const headers = [
    "Punch ID",
    "Location ID",
    "Device ID",
    "Staff ID",
    "Biometric User ID",
    "Employee Code",
    "Employee Name",
    "Punch Date/Time",
    "Punch Type",
    "Source",
    "Probable Duplicate",
    "Excluded From Calculation",
    "Attendance Date",
  ];
  const rows = punches.map((p) => {
    const meta = p.staff_id ? staffMeta.get(p.staff_id) : undefined;
    return [
      blank(p.id),
      blank(p.location_id),
      blank(p.device_id),
      blank(p.staff_id),
      blank(p.biometric_user_id),
      meta?.code ?? "",
      meta?.name ?? blank(p.device_user_name),
      p.punch_at
        ? formatReportingTime12h(p.punch_at)
          ? `${formatHrExportDate(p.punch_at.slice(0, 10))} ${formatReportingTime12h(p.punch_at)}`
          : blank(p.punch_at)
        : "",
      blank(p.punch_type),
      blank(p.source),
      p.probable_duplicate ? "Yes" : "No",
      p.excluded_from_calc ? "Yes" : "No",
      formatHrExportDate(p.attendance_date),
    ];
  });
  return tableSheet("11 Raw Punches", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 1,
  });
}

function correctionActionLabel(kind: string): string {
  switch (kind) {
    case "edit_in":
    case "add_punch":
      return "Manual Check-In Correction";
    case "edit_out":
      return "Manual Check-Out Correction";
    case "mark_leave":
      return "Leave Correction";
    case "mark_holiday":
    case "mark_week_off":
      return "Absence Correction";
    case "approve_overtime":
      return "OT Correction";
    case "map_user":
      return "Employee Mapping";
    default:
      return kind;
  }
}

function buildAuditTrail(corrections: ExportCorrection[], ctx: SheetContext): ExcelSheetSpec {
  const headers = [
    "Date/Time",
    "Employee Code",
    "Employee Name",
    "Attendance Date",
    "Action",
    "Original Value",
    "New Value",
    "Reason",
    "Changed By",
    "Approved By",
  ];
  const rows = corrections.map((c) => [
    c.requestedAt
      ? `${formatHrExportDate(c.requestedAt.slice(0, 10))} ${formatReportingTime12h(c.requestedAt)}`
      : "",
    blank(c.employeeCode),
    blank(c.employeeName),
    formatHrExportDate(c.workDate),
    correctionActionLabel(c.kind),
    typeof c.originalValue === "string" ? c.originalValue : JSON.stringify(c.originalValue ?? {}),
    typeof c.newValue === "string" ? c.newValue : JSON.stringify(c.newValue ?? {}),
    blank(c.reason),
    blank(c.requestedBy),
    blank(c.reviewedBy),
  ]);
  if (rows.length === 0) {
    rows.push([
      "Note: Audit trail fills when manual attendance corrections exist. No correction records in this period.",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  return tableSheet("12 Audit Trail", headers, rows, {
    titleRows: titleRowsFor(ctx),
    freezeCols: 1,
  });
}

/** Compose all 12 sheets in order. */
export function buildE3AttendanceHrWorkbookSheets(input: BuildE3AttendanceHrWorkbookInput): ExcelSheetSpec[] {
  const generatedAt = input.generatedAt ?? new Date();
  const otClaims = input.otClaims ?? [];
  const corrections = input.corrections ?? [];
  const listing = input.daily.map((r) => attendanceHrToListingSource(r));
  const employees = aggregateEmployees(input.daily, otClaims);
  const ctx: SheetContext = {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt,
    filters: input.filters,
  };

  const staffMeta = new Map<string, { code: string; name: string }>();
  for (const row of input.daily) {
    if (!row.staff_id) continue;
    staffMeta.set(row.staff_id, {
      code: blank(row.employee_code),
      name: attendanceHrExportStaffName(row),
    });
  }

  const matrix = buildAttendanceMatrixExcelSheet(listing, input.dateFrom, input.dateTo, {
    titleRows: titleRowsFor(ctx, "E3 – Attendance Matrix") as (string | number)[][],
  });
  const matrixSheet: ExcelSheetSpec = {
    name: "03 Attendance Matrix",
    aoa: matrix.aoa,
    merges: matrix.merges,
    freeze: matrix.freeze,
    cols: [
      { wch: 5 },
      { wch: 14 },
      { wch: 22 },
      { wch: 10 },
      ...matrix.aoa[matrix.filterHeaderRow]!.slice(4).map(() => ({ wch: 14 })),
    ],
    filterHeaderRow: matrix.filterHeaderRow,
    titleRowCount: matrix.titleRowCount,
    cellFills: matrix.cellFills,
    tabColor: E3_SHEET_TAB_COLORS["03 Attendance Matrix"],
  };

  const all = [
    buildHrSummary(input.daily, employees, ctx),
    buildEmployeeSummary(employees, ctx),
    matrixSheet,
    buildDailyAttendance(input.daily, ctx),
    buildLateEarly(input.daily, ctx),
    buildAbsenceLeave(input.daily, ctx),
    buildMissedPunches(input.daily, ctx),
    buildOvertime(input.daily, otClaims, ctx),
    buildPayrollInput(employees, ctx),
    buildDataIssues(input.unmatched, input.punches, input.imports, input.daily, ctx),
    buildRawPunches(input.punches, staffMeta, ctx),
    buildAuditTrail(corrections, ctx),
  ];

  if (input.sheetNames?.length) {
    const allow = new Set(input.sheetNames);
    return all.filter((s) => allow.has(s.name));
  }
  return all;
}

/** Append sheet specs onto a SheetJS / xlsx-js-style workbook (styles require xlsx-js-style). */
export function appendExcelSheets(
  XLSX: typeof import("xlsx"),
  wb: import("xlsx").WorkBook,
  sheets: ExcelSheetSpec[],
): void {
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    if (sheet.merges?.length) ws["!merges"] = sheet.merges;
    if (sheet.freeze) ws["!freeze"] = sheet.freeze;
    if (sheet.cols) ws["!cols"] = sheet.cols;
    if (sheet.filterHeaderRow != null && sheet.aoa.length > sheet.filterHeaderRow) {
      const header = sheet.aoa[sheet.filterHeaderRow] ?? [];
      const lastCol = Math.max(0, header.length - 1);
      const lastRow = Math.max(sheet.filterHeaderRow, sheet.aoa.length - 1);
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: sheet.filterHeaderRow, c: 0 },
          e: { r: lastRow, c: lastCol },
        }),
      };
    }
    applyE3SheetStyles(ws, sheet);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
}
