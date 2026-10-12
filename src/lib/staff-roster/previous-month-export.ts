import type { RosterLeaveType } from "@/lib/attendance-hr/roster-register-scope";
import { staffMatchesOrgShowOnly, type OrgFocusDepartment } from "@/lib/exclude-org-departments";
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

/**
 * Previous-month download choices.
 * The roster menu is "Operations, Maintenance & F&B": three focus departments
 * (operations, maintenance, fb_cafe). This download does not add a Maintenance-only
 * choice. Maintenance stays with Operations, the non-F&B side of that menu.
 * F&B is the existing F&B Cafe focus (F&B, F&B Cafe, FnB Cafe, FB, FB_CAFE),
 * not job titles the roster filter leaves out (F&B Manager, Barista, Chef).
 */
export const PREVIOUS_MONTH_ROSTER_DEPARTMENTS = ["operations", "fb", "both"] as const;

export type PreviousMonthRosterDepartment = (typeof PREVIOUS_MONTH_ROSTER_DEPARTMENTS)[number];

export type PreviousMonthRosterDownloadRow = PreviousMonthRosterSourceRow & {
  locationId: string;
  department?: string | null;
  departmentNames?: readonly (string | null)[] | null;
  departmentCodes?: readonly (string | null)[] | null;
};

/** Focus departments included for one download choice. */
export function previousMonthRosterDepartmentFocus(
  department: PreviousMonthRosterDepartment,
): readonly OrgFocusDepartment[] {
  if (department === "fb") return ["fb_cafe"];
  if (department === "operations") return ["operations", "maintenance"];
  return ["operations", "maintenance", "fb_cafe"];
}

export function previousMonthRosterRowInDepartment(
  row: Pick<PreviousMonthRosterDownloadRow, "department" | "departmentNames" | "departmentCodes">,
  department: PreviousMonthRosterDepartment,
): boolean {
  const names = [...(row.departmentNames ?? []), ...(row.departmentCodes ?? [])].filter(
    (label): label is string => Boolean(label?.trim()),
  );
  return staffMatchesOrgShowOnly(
    { department: row.department, department_names: names },
    previousMonthRosterDepartmentFocus(department),
  );
}

/** Keep rows for one location and one download department group. */
export function filterPreviousMonthRosterDownloadRows<T extends PreviousMonthRosterDownloadRow>(
  rows: readonly T[],
  scope: { locationId: string; department: PreviousMonthRosterDepartment },
): T[] {
  const locationId = scope.locationId.trim();
  if (!locationId) return [];
  return rows.filter(
    (row) => String(row.locationId) === locationId && previousMonthRosterRowInDepartment(row, scope.department),
  );
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
