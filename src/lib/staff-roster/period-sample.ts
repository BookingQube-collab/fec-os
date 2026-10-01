import { enumerateRosterSampleDates } from "@/lib/attendance-hr/roster-sample";
import type { AttendanceRosterPeriodMode } from "@/lib/attendance-hr/roster-period";
import type { StaffPlacement } from "@/lib/staff-sample-scope";

/** Leave SHIFT blank so the user fills duty times; other staff details come from the directory. */
export const PEOPLE_ROSTER_SAMPLE_DUTY_DEFAULT = "";

/** Sheet name from E3 Date Wise Roster (with Location). */
export const PEOPLE_ROSTER_SAMPLE_SHEET = "Date Wise Roster";

export const PEOPLE_ROSTER_SAMPLE_ORG = "E3 — Events and Entertainments Enterprises Trading WLL";

/** Required roster-import columns only — QID, position, department, etc. are resolved from staff. */
export const PEOPLE_ROSTER_SAMPLE_HEADERS = [
  "DATE",
  "EMPLOYEE",
  "LOCATION",
  "SHIFT",
] as const;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function formatE3RosterDate(ymd: string): string {
  const [year, month, day] = ymd.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return `${day}-${MONTH_SHORT[month - 1]}-${year}`;
}

export function weekdayLongName(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAY_LONG[d.getUTCDay()] ?? "";
}

export function peopleRosterSampleTitle(periodMode: AttendanceRosterPeriodMode = "week"): string {
  return periodMode === "month" ? "DATE WISE MONTHLY ROSTER" : "DATE WISE WEEKLY ROSTER";
}

export function peopleRosterSamplePeriodLine(dateFrom: string, dateTo: string): string {
  return `${PEOPLE_ROSTER_SAMPLE_ORG}   |   Period: ${formatE3RosterDate(dateFrom)} to ${formatE3RosterDate(dateTo)}`;
}

export function buildPeopleRosterSampleMatrix(
  dates: string[],
  placements: StaffPlacement[],
  options?: { maxRows?: number; periodMode?: AttendanceRosterPeriodMode },
) {
  const maxRows = options?.maxRows ?? 10_000;
  const rows: Array<Array<string>> = [];
  let truncated = false;
  outer: for (const date of dates) {
    const dateLabel = formatE3RosterDate(date);
    for (const place of placements) {
      if (rows.length >= maxRows) {
        truncated = true;
        break outer;
      }
      rows.push([
        dateLabel,
        place.staff.full_name ?? "",
        place.locationName,
        "",
      ]);
    }
  }
  return {
    headers: PEOPLE_ROSTER_SAMPLE_HEADERS,
    rows,
    rowCount: rows.length,
    truncated,
    title: peopleRosterSampleTitle(options?.periodMode ?? (dates.length > 7 ? "month" : "week")),
    periodLine: dates.length ? peopleRosterSamplePeriodLine(dates[0], dates[dates.length - 1]) : "",
  };
}

export function peopleRosterSampleFilename(
  dateFrom: string,
  dateTo: string,
  locationCode: string | null,
): string {
  const loc = locationCode ? locationCode.toLowerCase() : "all";
  return `e3-date-wise-roster-${loc}-${dateFrom}-to-${dateTo}.xlsx`;
}

export type PeopleRosterSheetLine = {
  date: string;
  employee: string;
  location: string;
  shift: string;
};

export type PeopleRosterSheetMatrix = {
  headers: readonly string[];
  rows: string[][];
  rowCount: number;
  truncated: boolean;
  title: string;
  periodLine: string;
};

/** Same DATE / EMPLOYEE / LOCATION / SHIFT sheet as the blank sample, with caller-supplied rows. */
export function buildPeopleRosterSheetMatrix(
  lines: PeopleRosterSheetLine[],
  period: { dateFrom: string; dateTo: string },
  options?: { maxRows?: number; periodMode?: AttendanceRosterPeriodMode },
): PeopleRosterSheetMatrix {
  const maxRows = options?.maxRows ?? 10_000;
  const kept = lines.slice(0, maxRows);
  return {
    headers: PEOPLE_ROSTER_SAMPLE_HEADERS,
    rows: kept.map((line) => [
      formatE3RosterDate(line.date),
      line.employee,
      line.location,
      line.shift,
    ]),
    rowCount: kept.length,
    truncated: lines.length > maxRows,
    title: peopleRosterSampleTitle(options?.periodMode ?? "month"),
    periodLine: peopleRosterSamplePeriodLine(period.dateFrom, period.dateTo),
  };
}

export async function writePeopleRosterSheetXlsx(
  matrix: Pick<PeopleRosterSheetMatrix, "headers" | "rows" | "rowCount" | "truncated" | "title" | "periodLine">,
): Promise<{ buffer: Buffer; rowCount: number; truncated: boolean; headers: readonly string[] }> {
  const { headers, rows, rowCount, truncated, title, periodLine } = matrix;
  const lastCol = headers.length;
  const { writeXlsxBuffer } = await import("@/lib/spreadsheet/workbook");
  const aoa: Array<Array<string>> = [[title], [periodLine], [], [...headers], ...rows];
  const buffer = await writeXlsxBuffer([
    {
      name: PEOPLE_ROSTER_SAMPLE_SHEET,
      rows: aoa,
      colWidths: [14, 28, 34, 22],
      merges: [
        { top: 1, left: 1, bottom: 1, right: lastCol },
        { top: 2, left: 1, bottom: 2, right: lastCol },
      ],
    },
  ]);
  return { buffer, rowCount, truncated, headers };
}

export async function buildPeopleRosterSampleXlsx(
  dates: string[],
  placements: StaffPlacement[],
  options?: { maxRows?: number; periodMode?: AttendanceRosterPeriodMode },
): Promise<{ buffer: Buffer; rowCount: number; truncated: boolean; headers: readonly string[] }> {
  return writePeopleRosterSheetXlsx(buildPeopleRosterSampleMatrix(dates, placements, options));
}

export async function buildPeopleRosterRowsXlsx(
  lines: PeopleRosterSheetLine[],
  period: { dateFrom: string; dateTo: string },
  options?: { maxRows?: number; periodMode?: AttendanceRosterPeriodMode },
): Promise<{ buffer: Buffer; rowCount: number; truncated: boolean; headers: readonly string[] }> {
  return writePeopleRosterSheetXlsx(buildPeopleRosterSheetMatrix(lines, period, options));
}

export { enumerateRosterSampleDates };
