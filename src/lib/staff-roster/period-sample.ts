import { enumerateRosterSampleDates } from "@/lib/attendance-hr/roster-sample";
import type { AttendanceRosterPeriodMode } from "@/lib/attendance-hr/roster-period";
import type { StaffPlacement } from "@/lib/staff-sample-scope";

/** Leave SHIFT / STATUS blank so the user fills duty times, not directory/salary fields. */
export const PEOPLE_ROSTER_SAMPLE_DUTY_DEFAULT = "";

/** Sheet name from E3 Date Wise Roster (with Location). */
export const PEOPLE_ROSTER_SAMPLE_SHEET = "Date Wise Roster";

export const PEOPLE_ROSTER_SAMPLE_ORG = "E3 — Events and Entertainments Enterprises Trading WLL";

export const PEOPLE_ROSTER_SAMPLE_HEADERS = [
  "DATE",
  "DAY",
  "EMPLOYEE",
  "POSITION",
  "LOCATION",
  "SHIFT",
  "STATUS",
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
    const dayLabel = weekdayLongName(date);
    for (const place of placements) {
      if (rows.length >= maxRows) {
        truncated = true;
        break outer;
      }
      rows.push([
        dateLabel,
        dayLabel,
        place.staff.full_name ?? "",
        place.staff.job_title ?? "",
        place.locationName,
        "",
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

export async function buildPeopleRosterSampleXlsx(
  dates: string[],
  placements: StaffPlacement[],
  options?: { maxRows?: number; periodMode?: AttendanceRosterPeriodMode },
): Promise<{ buffer: Buffer; rowCount: number; truncated: boolean; headers: readonly string[] }> {
  const { headers, rows, rowCount, truncated, title, periodLine } = buildPeopleRosterSampleMatrix(
    dates,
    placements,
    options,
  );
  const XLSX = await import("xlsx");
  const aoa: Array<Array<string>> = [[title], [periodLine], [], [...headers], ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
  ];
  ws["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 22 },
    { wch: 34 },
    { wch: 22 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, PEOPLE_ROSTER_SAMPLE_SHEET);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer, rowCount, truncated, headers };
}

export { enumerateRosterSampleDates };
