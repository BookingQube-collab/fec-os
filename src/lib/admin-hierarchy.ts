import { isHeadOfOperationsTitle, isSiteSupervisorTitle } from "@/lib/attendance-hr/missed-punch-approval";

/** Rajan Pathak, employee code 9. Not Rajan Khadka. */
export const OPERATIONS_HEAD_STAFF_ID = "64cde3a2-90fd-47c1-83cc-fa49900b1f43";

export type HierarchyStaffRow = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  staffRole: string | null;
  userId: string | null;
  locationName: string | null;
};

/** Head of Operations is Rajan Pathak. Site and venue supervisors sit under that seat. */
export function classifyOperationsHierarchy(rows: HierarchyStaffRow[]): {
  head: HierarchyStaffRow | null;
  supervisors: HierarchyStaffRow[];
} {
  const head =
    rows.find((row) => row.id === OPERATIONS_HEAD_STAFF_ID && isHeadOfOperationsTitle(row.jobTitle)) ??
    null;
  const supervisors = rows
    .filter((row) => row.id !== head?.id && isSiteSupervisorTitle(row.jobTitle, row.staffRole))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  return { head, supervisors };
}
