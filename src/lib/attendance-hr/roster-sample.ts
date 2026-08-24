import { toCsv } from "@/lib/csv-parse";
import { ATTENDANCE_ROSTER_TEMPLATE_HEADERS, enumerateYmd } from "@/lib/attendance-hr/roster-period";
import { type StaffPlacement } from "@/lib/staff-sample-scope";

export const ATTENDANCE_ROSTER_SAMPLE_MAX_ROWS = 10_000;
export const ATTENDANCE_ROSTER_SAMPLE_DUTY_DEFAULT = "Yes";

export function buildAttendanceRosterSampleCsv(
  dates: string[],
  placements: StaffPlacement[],
  options?: { dutyDefault?: string; maxRows?: number },
): { csv: string; rowCount: number; truncated: boolean } {
  const duty = options?.dutyDefault ?? ATTENDANCE_ROSTER_SAMPLE_DUTY_DEFAULT;
  const maxRows = options?.maxRows ?? ATTENDANCE_ROSTER_SAMPLE_MAX_ROWS;
  const rows: Array<Array<string>> = [];
  let truncated = false;
  outer: for (const date of dates) {
    for (const place of placements) {
      if (rows.length >= maxRows) {
        truncated = true;
        break outer;
      }
      rows.push([
        date,
        place.staff.full_name ?? "",
        place.staff.qid ?? "",
        place.staff.employee_code ?? "",
        place.locationCode,
        place.locationName,
        "",
        "",
        duty,
      ]);
    }
  }
  return {
    csv: toCsv(ATTENDANCE_ROSTER_TEMPLATE_HEADERS, rows),
    rowCount: rows.length,
    truncated,
  };
}

export function rosterSampleFilename(dateFrom: string, dateTo: string, locationCode: string | null): string {
  const loc = locationCode ? `${locationCode.toLowerCase()}-` : "all-";
  return `attendance-roster-sample-${loc}${dateFrom}-to-${dateTo}.csv`;
}

export function enumerateRosterSampleDates(dateFrom: string, dateTo: string): string[] {
  return enumerateYmd(dateFrom, dateTo);
}
