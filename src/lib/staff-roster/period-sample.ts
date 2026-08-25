import { ATTENDANCE_ROSTER_TEMPLATE_HEADERS } from "@/lib/attendance-hr/roster-period";
import {
  buildAttendanceRosterSampleMatrix,
  enumerateRosterSampleDates,
} from "@/lib/attendance-hr/roster-sample";
import type { StaffPlacement } from "@/lib/staff-sample-scope";

/** Leave shift/week-off cells blank so the user fills duty times, not directory/salary fields. */
export const PEOPLE_ROSTER_SAMPLE_DUTY_DEFAULT = "";

export const PEOPLE_ROSTER_SAMPLE_HEADERS = ATTENDANCE_ROSTER_TEMPLATE_HEADERS;

export function buildPeopleRosterSampleMatrix(
  dates: string[],
  placements: StaffPlacement[],
  options?: { maxRows?: number },
) {
  return buildAttendanceRosterSampleMatrix(dates, placements, {
    dutyDefault: PEOPLE_ROSTER_SAMPLE_DUTY_DEFAULT,
    maxRows: options?.maxRows,
  });
}

export function peopleRosterSampleFilename(
  dateFrom: string,
  dateTo: string,
  locationCode: string | null,
): string {
  const loc = locationCode ? locationCode.toLowerCase() : "all";
  return `employee-roster-sample-${loc}-${dateFrom}-to-${dateTo}.xlsx`;
}

export async function buildPeopleRosterSampleXlsx(
  dates: string[],
  placements: StaffPlacement[],
  options?: { maxRows?: number },
): Promise<{ buffer: Buffer; rowCount: number; truncated: boolean; headers: readonly string[] }> {
  const { headers, rows, rowCount, truncated } = buildPeopleRosterSampleMatrix(dates, placements, options);
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...headers], ...rows]), "Roster");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer, rowCount, truncated, headers };
}

export { enumerateRosterSampleDates };
