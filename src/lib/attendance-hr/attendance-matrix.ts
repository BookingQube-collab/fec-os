import {
  formatHoursValue,
  formatLatePunch,
  formatReportingTime12h,
  getAttendanceStatusDisplay,
  hasLatePunch,
  resolveHoursBasedAttendanceStatus,
  resolveTotalHoursWorked,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import {
  buildRosterMatrix,
  isWeekendYmd,
  rosterMatrixCellKey,
  rosterMonthSpans,
} from "@/lib/attendance-hr/roster-register-scope";

export type AttendanceMatrixRow = AttendanceListingSource & {
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  qid: string | null;
  workDate: string;
};

export type AttendanceGridTone =
  | "empty"
  | "present"
  | "late"
  | "missed_punch"
  | "weekly_off"
  | "absent"
  | "unscheduled"
  | "leave"
  | "other";

const LEAVE_KEYS = new Set(["public_holiday", "annual_leave", "sick_leave", "unpaid_leave"]);

/** Compact punch clock for grid cells (no seconds). */
export function formatAttendanceGridPunch(iso: string | null | undefined): string {
  return formatReportingTime12h(iso);
}

export function attendanceListingStaffKey(row: AttendanceListingSource): string {
  if (row.staffKey) return row.staffKey;
  if (row.deviceUserId?.trim()) return `bio:${row.locationLabel}:${row.deviceUserId.trim()}`;
  if (row.userName?.trim()) return `name:${row.userName.trim()}`;
  return `row:${row.id ?? row.work_date}`;
}

export function toAttendanceMatrixRow(row: AttendanceListingSource): AttendanceMatrixRow {
  return {
    ...row,
    staffId: attendanceListingStaffKey(row),
    staffName: row.userName,
    employeeCode: row.employeeCode ?? row.deviceUserId ?? null,
    qid: row.qid ?? null,
    workDate: row.work_date.slice(0, 10),
  };
}

/** Staff × day matrix for the attendance listing period — reuses roster matrix helpers. */
export function buildAttendanceMatrix(rows: AttendanceListingSource[], dateFrom: string, dateTo: string) {
  return buildRosterMatrix(rows.map(toAttendanceMatrixRow), dateFrom, dateTo);
}

export function attendanceGridTone(row: AttendanceListingSource): AttendanceGridTone {
  const status = resolveHoursBasedAttendanceStatus(row);
  if (status === "missed_punch") return "missed_punch";
  if (status === "weekly_off") return "weekly_off";
  if (LEAVE_KEYS.has(status)) return "leave";
  if (status === "absent") return "absent";
  if (status === "unscheduled") return "unscheduled";
  if (hasLatePunch(row.late_minutes) || status === "late") return "late";
  if (status === "present" || status === "overtime") return "present";
  return "other";
}

/** Soft cell tint matching list-row status colors where possible. */
export function attendanceGridCellClass(tone: AttendanceGridTone): string {
  switch (tone) {
    case "late":
      return "bg-rose-500/10 text-rose-800 dark:text-rose-200";
    case "missed_punch":
      return "bg-amber-400/25 text-amber-950 dark:text-amber-100";
    case "weekly_off":
    case "absent":
    case "leave":
      return "bg-sky-500/20 text-sky-900 dark:text-sky-100";
    case "unscheduled":
      return "bg-zinc-500/10 text-zinc-800 dark:text-zinc-200";
    default:
      return "";
  }
}

export type AttendanceGridCellContent = {
  tone: AttendanceGridTone;
  primary: string;
  secondary: string | null;
  meta: string | null;
  statusLabel: string;
};

/** Compact cell copy: punches stacked, hours/late/off as meta. */
export function attendanceGridCellContent(row: AttendanceListingSource): AttendanceGridCellContent {
  const tone = attendanceGridTone(row);
  const statusLabel = getAttendanceStatusDisplay(row).label;
  const hours = resolveTotalHoursWorked(row);
  const late = formatLatePunch(row.late_minutes);

  if (tone === "weekly_off" || tone === "leave" || tone === "absent" || tone === "unscheduled") {
    return { tone, primary: statusLabel, secondary: null, meta: null, statusLabel };
  }

  const inn = formatAttendanceGridPunch(row.actual_in) || "—";
  const out = formatAttendanceGridPunch(row.actual_out) || "—";
  const metaParts: string[] = [];
  if (hours != null) metaParts.push(`${formatHoursValue(hours)}h`);
  if (late !== "—") metaParts.push(`L${late}`);

  return {
    tone,
    primary: inn,
    secondary: out,
    meta: metaParts.length ? metaParts.join(" · ") : null,
    statusLabel,
  };
}

/** Short site code for matrix panels — same split the UI day-cell footer uses. */
export function attendanceMatrixLocationCode(locationLabel: string | null | undefined): string {
  if (!locationLabel?.trim()) return "";
  return locationLabel.split("—")[0]?.trim() || locationLabel.trim();
}

/** Staff sticky Location: first non-empty day-cell location code for that person. */
export function attendanceMatrixStaffLocation(
  staffId: string,
  dates: string[],
  byStaffDate: Map<string, AttendanceMatrixRow[]>,
): string {
  for (const ymd of dates) {
    const entries = byStaffDate.get(rosterMatrixCellKey(staffId, ymd));
    if (!entries?.length) continue;
    for (const entry of entries) {
      const code = attendanceMatrixLocationCode(entry.locationLabel);
      if (code) return code;
    }
  }
  return "";
}

/** HR matrix status codes (legend on Excel sheet). */
export const ATTENDANCE_MATRIX_STATUS_CODES = [
  ["P", "Present"],
  ["A", "Absent"],
  ["WO", "Weekly Off"],
  ["AL", "Annual Leave"],
  ["SL", "Sick Leave"],
  ["UL", "Unpaid Leave"],
  ["PH", "Public Holiday"],
  ["MP", "Missed Punch"],
  ["HD", "Half Day"],
  ["US", "Unscheduled"],
] as const;

export function attendanceMatrixStatusCode(row: AttendanceListingSource): string {
  const status = resolveHoursBasedAttendanceStatus(row);
  switch (status) {
    case "weekly_off":
      return "WO";
    case "absent":
      return "A";
    case "annual_leave":
      return "AL";
    case "sick_leave":
      return "SL";
    case "unpaid_leave":
      return "UL";
    case "public_holiday":
      return "PH";
    case "missed_punch":
      return "MP";
    case "unscheduled":
      return "US";
    case "short_hours": {
      const worked = resolveTotalHoursWorked(row);
      const expected = row.expected_minutes != null ? Number(row.expected_minutes) / 60 : null;
      if (worked != null && expected != null && expected > 0 && worked <= expected / 2) return "HD";
      return "P";
    }
    default:
      return "P";
  }
}

function dayHeaderLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`),
  );
}

/** Compact Excel cell: IN – OUT / hours / status code. */
export function attendanceMatrixExcelCellText(entries: AttendanceMatrixRow[]): string {
  if (!entries.length) return "";
  return entries
    .map((entry) => {
      const code = attendanceMatrixStatusCode(entry);
      if (code === "WO" || code === "A" || code === "AL" || code === "SL" || code === "UL" || code === "PH" || code === "US") {
        return code;
      }
      const inn = formatAttendanceGridPunch(entry.actual_in);
      const out = formatAttendanceGridPunch(entry.actual_out);
      const hours = resolveTotalHoursWorked(entry);
      const lines: string[] = [];
      if (inn || out) lines.push(`${inn || "—"} – ${out || "—"}`);
      if (hours != null) lines.push(`${formatHoursValue(hours)} H`);
      lines.push(code);
      return lines.join("\n");
    })
    .join("\n\n");
}

export type AttendanceMatrixExcelSheet = {
  aoa: (string | number)[][];
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  /** Freeze No./Code/Name/Location + legend + header row. */
  freeze: { xSplit: number; ySplit: number };
};

const MATRIX_LEFT_COLS = 4;
const MATRIX_LEGEND_ROWS = 2;

/** AOA + freeze for HR Attendance Matrix (legend + day columns). */
export function buildAttendanceMatrixExcelSheet(
  rows: AttendanceListingSource[],
  dateFrom: string,
  dateTo: string,
): AttendanceMatrixExcelSheet {
  const matrix = buildAttendanceMatrix(rows, dateFrom, dateTo);
  const { dates, staff, byStaffDate } = matrix;

  const legend =
    "Legend: " + ATTENDANCE_MATRIX_STATUS_CODES.map(([c, label]) => `${c} = ${label}`).join("  |  ");
  const legendRow: (string | number)[] = [legend];
  const blankRow: (string | number)[] = [];
  const headerRow: (string | number)[] = [
    "No.",
    "Employee Code",
    "Employee Name",
    "Location",
    ...dates.map(dayHeaderLabel),
  ];

  const dataRows = staff.map((person, index) => {
    const location = attendanceMatrixStaffLocation(person.staffId, dates, byStaffDate);
    const dayCells = dates.map((ymd) => {
      const entries = byStaffDate.get(rosterMatrixCellKey(person.staffId, ymd)) ?? [];
      return attendanceMatrixExcelCellText(entries);
    });
    return [
      index + 1,
      person.employeeCode || person.qid || "",
      person.staffName || "",
      location,
      ...dayCells,
    ];
  });

  return {
    aoa: [legendRow, blankRow, headerRow, ...dataRows],
    merges: [
      {
        s: { r: 0, c: 0 },
        e: { r: 0, c: Math.max(MATRIX_LEFT_COLS - 1, MATRIX_LEFT_COLS + dates.length - 1) },
      },
    ],
    freeze: { xSplit: MATRIX_LEFT_COLS, ySplit: MATRIX_LEGEND_ROWS + 1 },
  };
}

export { isWeekendYmd, rosterMatrixCellKey, rosterMonthSpans };
