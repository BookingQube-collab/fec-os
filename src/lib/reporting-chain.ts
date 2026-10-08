import { isHeadOfOperationsTitle, isSiteSupervisorTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { wouldCreateReportingCycle } from "@/lib/org-hierarchy";
import { isActiveStaffStatus, isResignedStaffStatus, isServingNoticeStaffStatus, isTerminatedStaffStatus } from "@/lib/staff-status";

/** Adil Bashir Ahmed, employee code 1. Managing Director / Chief Executive Officer. */
export const CEO_STAFF_ID = "ca3abc00-55ba-44eb-86c7-457173bb98bc";

/** Mohamad Ali Hassan Awada, employee code 10. General Manager. */
export const GM_STAFF_ID = "1c6c2111-6aad-4784-83f5-0c687669c6c5";

export type ChainStaff = {
  staffId: string;
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  locationId: string | null;
  staffRole: string | null;
  status: string | null;
  userId: string | null;
  reportingManagerStaffId: string | null;
  orgChartPlaced: boolean;
};

export type ReportingViewer = {
  userId: string | null;
  employeeCode: string | null;
  displayName: string | null;
  /** CEO login with no employee row follows Adil Bashir Ahmed's reporting line. */
  seat?: "ceo" | null;
};

export type ProjectedReporting = {
  rows: ChainStaff[];
  viewerStaffId: string | null;
  /** Login name used for the viewer's Operations seat. Null when that seat does not apply. */
  viewerOperationsName: string | null;
  departmentHeads: ChainStaff[];
};

function eligible(row: ChainStaff): boolean {
  if (!row.locationId) return false;
  if (isTerminatedStaffStatus(row.status) || isResignedStaffStatus(row.status)) return false;
  if ((row.status ?? "").trim().toLowerCase() === "joker") return false;
  return isActiveStaffStatus(row.status) || isServingNoticeStaffStatus(row.status);
}

function headRank(row: ChainStaff): number {
  const title = row.jobTitle ?? "";
  if (/sr\.?\s+site supervisor/i.test(title)) return 0;
  if (/\bsite supervisor\b/i.test(title)) return 1;
  if (/\bvenue supervisor\b/i.test(title)) return 2;
  if (isHeadOfOperationsTitle(title)) return 3;
  return 4;
}

/**
 * One department head per location.
 * Venue and site supervisors win. Head Office has no site supervisor, so the
 * Head of Operations record at that location is the department head.
 */
export function locationDepartmentHeads(rows: readonly ChainStaff[]): ChainStaff[] {
  const groups = new Map<string, ChainStaff[]>();
  for (const row of rows) {
    if (!eligible(row) || row.staffId === CEO_STAFF_ID || row.staffId === GM_STAFF_ID) continue;
    const list = groups.get(row.locationId!) ?? [];
    list.push(row);
    groups.set(row.locationId!, list);
  }

  const heads: ChainStaff[] = [];
  for (const group of groups.values()) {
    const supervisors = group.filter((row) => isSiteSupervisorTitle(row.jobTitle, row.staffRole));
    const pool = supervisors.length
      ? supervisors
      : group.filter((row) => isHeadOfOperationsTitle(row.jobTitle));
    if (!pool.length) continue;
    pool.sort(
      (a, b) => headRank(a) - headRank(b) || a.fullName.localeCompare(b.fullName) || a.staffId.localeCompare(b.staffId),
    );
    const head = pool[0];
    if (head) heads.push(head);
  }
  return heads.sort((a, b) => a.fullName.localeCompare(b.fullName) || a.staffId.localeCompare(b.staffId));
}

/** Operations is a department/function on the staff record, not a separate person we invent. */
export function isOperationsFunction(department: string | null, jobTitle: string | null): boolean {
  const parts = (department ?? "")
    .split(/[,/]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.some((part) => part === "operations" || part.startsWith("operations "))) return true;
  return isHeadOfOperationsTitle(jobTitle);
}

function matchViewer(rows: readonly ChainStaff[], viewer: ReportingViewer | null): ChainStaff | null {
  if (!viewer) return null;
  const byUser = viewer.userId ? rows.find((row) => row.userId === viewer.userId) : undefined;
  if (byUser) return byUser;
  const code = viewer.employeeCode?.trim();
  if (code) {
    const byCode = rows.find((row) => row.employeeCode?.trim() === code);
    if (byCode) return byCode;
  }
  const name = viewer.displayName?.trim().toLowerCase();
  if (name) {
    const named = rows.filter((row) => row.fullName.trim().toLowerCase() === name);
    if (named.length === 1) return named[0]!;
  }
  if (viewer.seat === "ceo") return rows.find((row) => row.staffId === CEO_STAFF_ID) ?? null;
  return null;
}

/** Who the signed-in person is on the chart. Does not rewrite anyone's line manager. */
export function reportingViewerView(
  rows: readonly ChainStaff[],
  viewer: ReportingViewer | null,
): { viewerStaffId: string | null; viewerOperationsName: string | null } {
  const viewerRow = matchViewer(rows, viewer);
  const viewerIsOperations = Boolean(viewerRow && isOperationsFunction(viewerRow.department, viewerRow.jobTitle));
  return {
    viewerStaffId: viewerRow?.staffId ?? null,
    viewerOperationsName: viewerIsOperations ? viewer?.displayName?.trim() || viewerRow?.fullName || null : null,
  };
}

function reportsUnder(
  staffId: string,
  ancestorId: string,
  managers: ReadonlyMap<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let cursor = managers.get(staffId) ?? null;
  while (cursor) {
    if (cursor === ancestorId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = managers.get(cursor) ?? null;
  }
  return false;
}

function setManager(
  managers: Map<string, string | null>,
  placed: Map<string, boolean>,
  staffId: string,
  managerId: string | null,
) {
  if (managerId === staffId) return;
  if (wouldCreateReportingCycle(managers, staffId, managerId)) return;
  managers.set(staffId, managerId);
  placed.set(staffId, true);
}

/**
 * CEO → GM → one department head per location.
 * A logged-in Operations person who is not already that location's department
 * head is placed under the head. People who already report through that head
 * keep their existing manager.
 */
export function projectReportingChain(
  rows: readonly ChainStaff[],
  viewer: ReportingViewer | null,
): ProjectedReporting {
  const heads = locationDepartmentHeads(rows);
  const headIds = new Set(heads.map((head) => head.staffId));
  const headByLocation = new Map(heads.flatMap((head) => (head.locationId ? [[head.locationId, head.staffId] as const] : [])));
  const managers = new Map(rows.map((row) => [row.staffId, row.reportingManagerStaffId]));
  const placed = new Map(rows.map((row) => [row.staffId, row.orgChartPlaced]));
  const known = new Set(rows.map((row) => row.staffId));

  if (known.has(CEO_STAFF_ID)) setManager(managers, placed, CEO_STAFF_ID, null);
  if (known.has(GM_STAFF_ID) && known.has(CEO_STAFF_ID)) setManager(managers, placed, GM_STAFF_ID, CEO_STAFF_ID);
  for (const head of heads) {
    if (known.has(GM_STAFF_ID)) setManager(managers, placed, head.staffId, GM_STAFF_ID);
  }

  const viewerRow = matchViewer(rows, viewer);
  const viewerIsOperations = Boolean(
    viewerRow && isOperationsFunction(viewerRow.department, viewerRow.jobTitle),
  );
  if (
    viewerRow &&
    viewerIsOperations &&
    !headIds.has(viewerRow.staffId) &&
    viewerRow.staffId !== CEO_STAFF_ID &&
    viewerRow.staffId !== GM_STAFF_ID
  ) {
    const headId = viewerRow.locationId ? headByLocation.get(viewerRow.locationId) ?? null : null;
    if (headId && !reportsUnder(viewerRow.staffId, headId, managers)) {
      setManager(managers, placed, viewerRow.staffId, headId);
    }
  }

  const viewerOperationsName = viewerIsOperations
    ? viewer?.displayName?.trim() || viewerRow?.fullName || null
    : null;

  return {
    departmentHeads: heads,
    viewerStaffId: viewerRow?.staffId ?? null,
    viewerOperationsName,
    rows: rows.map((row) => ({
      ...row,
      reportingManagerStaffId: managers.get(row.staffId) ?? null,
      orgChartPlaced: placed.get(row.staffId) ?? false,
      fullName:
        viewerOperationsName && row.staffId === viewerRow?.staffId ? viewerOperationsName : row.fullName,
    })),
  };
}

export function reportingDescendants(
  rootId: string,
  managers: ReadonlyMap<string, string | null>,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const [staffId, managerId] of managers) {
    if (!managerId || managerId === staffId) continue;
    const list = children.get(managerId) ?? [];
    list.push(staffId);
    children.set(managerId, list);
  }
  const result = new Set<string>();
  const seen = new Set<string>([rootId]);
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return result;
}

/**
 * Team a login inherits from the operations hierarchy.
 * Manager is the saved line manager. Direct reports are the people who report to this person.
 * reportStaffIds includes everyone further down the same chain.
 */
export function loginReportingTeam(
  staffId: string,
  rows: readonly { staffId: string; reportingManagerStaffId: string | null }[],
): { managerStaffId: string | null; directReportStaffIds: string[]; reportStaffIds: string[] } {
  const managers = new Map(rows.map((row) => [row.staffId, row.reportingManagerStaffId]));
  const directReportStaffIds = [...managers.entries()]
    .filter(([id, managerId]) => managerId === staffId && id !== staffId)
    .map(([id]) => id)
    .sort();
  return {
    managerStaffId: managers.get(staffId) ?? null,
    directReportStaffIds,
    reportStaffIds: [...reportingDescendants(staffId, managers)].sort(),
  };
}

/** People who report to the signed-in user, directly or further down the chart. */
export function reportingTeamIds(viewerStaffId: string | null, rows: readonly ChainStaff[]): Set<string> {
  if (!viewerStaffId) return new Set();
  const managers = new Map(rows.map((row) => [row.staffId, row.reportingManagerStaffId]));
  return reportingDescendants(viewerStaffId, managers);
}

/** Department head of a location plus everyone who reports through them. */
export function operationalTeamIds(locationId: string, rows: readonly ChainStaff[]): Set<string> {
  const head = locationDepartmentHeads(rows).find((row) => row.locationId === locationId);
  if (!head) return new Set();
  const managers = new Map(rows.map((row) => [row.staffId, row.reportingManagerStaffId]));
  const ids = reportingDescendants(head.staffId, managers);
  ids.add(head.staffId);
  return ids;
}
