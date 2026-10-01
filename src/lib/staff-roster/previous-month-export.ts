import type { RosterLeaveType } from "@/lib/attendance-hr/roster-register-scope";
import { rosterSheetLabel } from "@/lib/locations/normalize";
import type { PeopleRosterSheetLine } from "@/lib/staff-roster/period-sample";

export type PreviousMonthRosterSourceRow = {
  workDate: string;
  staffName: string | null;
  employeeCode: string | null;
  locationCode: string | null;
  locationName: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
  leaveType: RosterLeaveType | null;
};

/** SHIFT cell for a stored roster row. Blank when the row has no duty text. */
export function previousMonthRosterShiftCell(
  row: Pick<PreviousMonthRosterSourceRow, "shiftStart" | "shiftEnd" | "isWeekOff" | "leaveType">,
): string {
  if (row.leaveType === "annual_leave") return "ANNUAL LEAVE";
  if (row.leaveType === "sick_leave") return "SICK LEAVE";
  if (row.leaveType === "comp_off") return "COMP OFF";
  if (row.isWeekOff) return "DAY OFF";
  const start = (row.shiftStart ?? "").slice(0, 5);
  const end = (row.shiftEnd ?? "").slice(0, 5);
  if (start && end) return `${start}-${end}`;
  if (start) return start;
  if (end) return end;
  return "";
}

export function previousMonthRosterSheetLines(rows: PreviousMonthRosterSourceRow[]): PeopleRosterSheetLine[] {
  return [...rows]
    .sort((a, b) => {
      const date = a.workDate.localeCompare(b.workDate);
      if (date) return date;
      const nameA = (a.staffName ?? a.employeeCode ?? "").trim();
      const nameB = (b.staffName ?? b.employeeCode ?? "").trim();
      return nameA.localeCompare(nameB);
    })
    .map((row) => ({
      date: row.workDate.slice(0, 10),
      employee: (row.staffName ?? "").trim() || (row.employeeCode ?? "").trim(),
      location: rosterSheetLabel(row.locationCode ?? "", row.locationName),
      shift: previousMonthRosterShiftCell(row),
    }));
}
