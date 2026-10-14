import { sortDepartmentsTree } from "@/lib/departments";

/** Card size used by the org canvas. Layout and the card component share these. */
export const ORG_NODE_WIDTH = 200;
export const ORG_NODE_HEIGHT = 58;
/** Extra card height for the location line under the designation. */
export const ORG_LOCATION_LINE_PX = 16;
export const ORG_LEVEL_GAP = 108;
/** Vertical space between ranks in the top-down chart. */
export const ORG_RANK_GAP = 72;
const ORG_SIBLING_GAP = 28;
const ORG_RANK_SIBLING_GAP = 36;
const ORG_TREE_GAP = 64;

export type OrgChartViewMode = "tree" | "levels";

export const ORG_DRAG_PREFIX = "fec-staff:";

const DEPARTMENT_COLORS = [
  "#3b82f6",
  "#f97316",
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#fb7185",
  "#facc15",
  "#818cf8",
  "#2dd4bf",
  "#f472b6",
  "#a3e635",
  "#fb923c",
] as const;

const NONE_DEPARTMENT_COLOR = "#94a3b8";

export type OrgDepartment = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type OrgReportingRow = {
  staffId: string;
  fullName: string;
  reportingManagerStaffId: string | null;
  orgChartPlaced: boolean;
};

export type OrgChartPerson = OrgReportingRow & {
  employeeCode: string | null;
  jobTitle: string | null;
  departmentIds: string[];
  departmentId: string | null;
  departmentName: string | null;
  hasPhoto: boolean;
  photoUpdatedAt: string | null;
  /** Set on the operations chart. Absent means the login was not loaded. */
  loginLinked?: boolean;
  loginEmail?: string | null;
  /** Contact email on the staff record. The create-login dialog prefills from this. */
  email?: string | null;
  /** Home location. The org chart uses it when a double-click appoints a team leader. */
  locationId?: string | null;
  locationName?: string | null;
};

export type OrgChartSnapshot = {
  departments: OrgDepartment[];
  people: OrgChartPerson[];
};

export type OrgChartLayout = {
  nodes: Array<{ staffId: string; x: number; y: number; height: number }>;
  connectors: string[];
  width: number;
  height: number;
};

export type OrgPanelGroup = {
  key: string;
  name: string;
  depth: number;
  people: OrgChartPerson[];
};

export function orgDragToken(staffId: string): string {
  return `${ORG_DRAG_PREFIX}${staffId}`;
}

export function parseOrgDragToken(value: string): string | null {
  if (!value.startsWith(ORG_DRAG_PREFIX)) return null;
  const id = value.slice(ORG_DRAG_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

export function personInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return `${first}${last}`.toUpperCase() || "?";
}

/** Stable color for a department id or a `name:` key. Null is the unassigned swatch. */
export function departmentColor(key: string | null): string {
  if (!key) return NONE_DEPARTMENT_COLOR;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return DEPARTMENT_COLORS[hash % DEPARTMENT_COLORS.length] ?? NONE_DEPARTMENT_COLOR;
}

/**
 * Same department placement the org chart uses: linked master departments first,
 * then a name match on the free-text staff department, then that text alone.
 */
export function staffDepartmentPlacement(
  departments: readonly OrgDepartment[],
  links: readonly { id: string; name: string; sortOrder: number }[],
  departmentText: string | null,
): { departmentIds: string[]; departmentId: string | null; departmentName: string | null } {
  const departmentByName = new Map<string, OrgDepartment>();
  for (const department of departments) {
    const key = department.name.trim().toLowerCase();
    if (!departmentByName.has(key)) departmentByName.set(key, department);
  }

  const uniqueIds = [...new Set(links.map((link) => link.id))];
  let departmentId = links[0]?.id ?? null;
  let departmentName = links[0]?.name ?? null;
  if (!departmentId) {
    const matched = departmentByName.get(departmentText?.trim().toLowerCase() ?? "");
    if (matched) {
      departmentId = matched.id;
      departmentName = matched.name;
      uniqueIds.push(matched.id);
    } else if (departmentText?.trim()) {
      departmentName = departmentText.trim();
    }
  }
  return { departmentIds: uniqueIds, departmentId, departmentName };
}

export function personDepartmentKey(person: {
  departmentId: string | null;
  departmentName: string | null;
}): string | null {
  if (person.departmentId) return person.departmentId;
  const name = person.departmentName?.trim();
  if (name) return `name:${name.toLowerCase()}`;
  return null;
}

/**
 * Walking up from the proposed manager hits this person when the drop would loop.
 * A null manager (chart root) is never a cycle.
 */
export function wouldCreateReportingCycle(
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
  staffId: string,
  managerStaffId: string | null,
): boolean {
  if (!managerStaffId) return false;
  const seen = new Set<string>();
  let cursor: string | null = managerStaffId;
  while (cursor) {
    if (cursor === staffId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = reportingManagerByStaffId.get(cursor) ?? null;
  }
  return false;
}

export type ReportingDrop =
  | { ok: true; managerStaffId: string | null }
  | { ok: false; reason: "self" | "cycle" };

/**
 * Dropping onto a person makes that person the line manager.
 * A null target puts them at the top. Their existing reports stay attached to them.
 * Dropping onto yourself or onto someone below you is rejected.
 */
export function reportingDrop(
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
  staffId: string,
  managerStaffId: string | null,
): ReportingDrop {
  if (managerStaffId === staffId) return { ok: false, reason: "self" };
  if (wouldCreateReportingCycle(reportingManagerByStaffId, staffId, managerStaffId)) {
    return { ok: false, reason: "cycle" };
  }
  return { ok: true, managerStaffId };
}

export type OrgChartMoveMode = "reports-to" | "takes-reports" | "insert-between" | "same-manager";

export type OrgManagerUpdate = {
  staffId: string;
  managerStaffId: string | null;
};

export type OrgChartMovePlan =
  | { ok: true; updates: OrgManagerUpdate[] }
  | { ok: false; reason: "self" | "cycle" | "none" };

/** People whose saved line manager is this person, in a stable id order. */
export function directReportIds(
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
  managerStaffId: string,
): string[] {
  const ids: string[] = [];
  for (const [staffId, managerId] of reportingManagerByStaffId) {
    if (managerId === managerStaffId && staffId !== managerStaffId) ids.push(staffId);
  }
  ids.sort();
  return ids;
}

function rejectOrSet(
  managers: Map<string, string | null>,
  staffId: string,
  managerStaffId: string,
): OrgChartMovePlan | null {
  const drop = reportingDrop(managers, staffId, managerStaffId);
  if (!drop.ok) return drop;
  managers.set(staffId, managerStaffId);
  return null;
}

/** People who can be ticked for "these people report to them". */
export function reportCandidateIds(
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
  staffId: string,
  targetStaffId: string,
): string[] {
  const direct = directReportIds(reportingManagerByStaffId, targetStaffId).filter((id) => id !== staffId);
  if (direct.length > 0) return direct;
  const managerId = reportingManagerByStaffId.get(targetStaffId) ?? null;
  if (!managerId) return targetStaffId !== staffId ? [targetStaffId] : [];
  return directReportIds(reportingManagerByStaffId, managerId).filter((id) => id !== staffId);
}

export type ReportLikeOthersPlacement = {
  managerStaffId: string;
};

/**
 * A middle person already reports to someone and has people reporting to them.
 * Dropping that person on their manager, on a peer under that manager, or on
 * someone in their own team can put them back on the same line as the other staff:
 * their team reports to that manager again, and they stay under the manager.
 * Returns null when they are not a middle person, the drop is somewhere else, or the move would loop.
 */
export function reportLikeOthersPlacement(
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
  staffId: string,
  targetStaffId: string,
): ReportLikeOthersPlacement | null {
  if (staffId === targetStaffId) return null;
  const managerId = reportingManagerByStaffId.get(staffId) ?? null;
  if (!managerId || managerId === staffId) return null;
  const reports = directReportIds(reportingManagerByStaffId, staffId).filter((id) => id !== managerId && id !== staffId);
  if (!reports.length) return null;
  const targetManager = reportingManagerByStaffId.get(targetStaffId) ?? null;
  const onManager = targetStaffId === managerId;
  const onPeer = targetManager === managerId;
  const onOwnReport = targetManager === staffId;
  const ontoTarget = reportingDrop(reportingManagerByStaffId, staffId, targetStaffId);
  const onDescendant = !ontoTarget.ok && ontoTarget.reason === "cycle";
  if (!onManager && !onPeer && !onOwnReport && !onDescendant) return null;
  if (wouldCreateReportingCycle(reportingManagerByStaffId, staffId, managerId)) return null;
  for (const id of reports) {
    if (wouldCreateReportingCycle(reportingManagerByStaffId, id, managerId)) return null;
  }
  return { managerStaffId: managerId };
}

/** The reporting change to select when a card is dropped on another card. */
export function suggestedOrgMoveMode(
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
  staffId: string,
  targetStaffId: string,
): OrgChartMoveMode {
  const flatten = reportLikeOthersPlacement(reportingManagerByStaffId, staffId, targetStaffId);
  const ontoTarget = reportingDrop(reportingManagerByStaffId, staffId, targetStaffId);
  const droppedOnOwnManager = Boolean(flatten && targetStaffId === flatten.managerStaffId);
  if (flatten && (!ontoTarget.ok || droppedOnOwnManager)) return "same-manager";
  if (ontoTarget.ok) return "reports-to";
  if (reportCandidateIds(reportingManagerByStaffId, staffId, targetStaffId).length > 0) return "takes-reports";
  return "reports-to";
}

/**
 * reports-to: the dragged person reports to the drop target. Their own team stays with them.
 * takes-reports: chosen candidates now report to the dragged person. When the target has a team,
 *   those candidates are that team. When the target is a leaf, they are the target and anyone who
 *   reports to the same manager.
 * insert-between: when the target has other direct reports, the dragged person reports to the target
 *   and those reports move under the dragged person. When the target is a leaf with a manager, the
 *   dragged person reports to that manager and the target reports to the dragged person.
 * same-manager: the dragged person is a middle person. Their direct reports move back to
 *   the dragged person's manager, and the dragged person stays on that same line.
 */
export function planOrgChartMove(
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
  input: {
    staffId: string;
    targetStaffId: string;
    mode: OrgChartMoveMode;
    reportStaffIds?: readonly string[];
  },
): OrgChartMovePlan {
  const { staffId, targetStaffId, mode } = input;
  if (staffId === targetStaffId) return { ok: false, reason: "self" };

  if (mode === "reports-to") {
    const drop = reportingDrop(reportingManagerByStaffId, staffId, targetStaffId);
    if (!drop.ok) return drop;
    if (reportingManagerByStaffId.get(staffId) === targetStaffId) return { ok: true, updates: [] };
    return { ok: true, updates: [{ staffId, managerStaffId: targetStaffId }] };
  }

  if (mode === "takes-reports") {
    const allowed = new Set(reportCandidateIds(reportingManagerByStaffId, staffId, targetStaffId));
    const chosen = [...new Set(input.reportStaffIds ?? [])]
      .filter((id) => allowed.has(id) && id !== staffId)
      .sort();
    if (!chosen.length) return { ok: false, reason: "none" };
    const next = new Map(reportingManagerByStaffId);
    const updates: OrgManagerUpdate[] = [];
    for (const id of chosen) {
      const failed = rejectOrSet(next, id, staffId);
      if (failed) return failed;
      updates.push({ staffId: id, managerStaffId: staffId });
    }
    return { ok: true, updates };
  }

  if (mode === "same-manager") {
    if (staffId === targetStaffId) return { ok: false, reason: "self" };
    const managerId = reportingManagerByStaffId.get(staffId) ?? null;
    const reports = managerId
      ? directReportIds(reportingManagerByStaffId, staffId).filter((id) => id !== managerId && id !== staffId)
      : [];
    if (!managerId || managerId === staffId || !reports.length) return { ok: false, reason: "none" };
    if (wouldCreateReportingCycle(reportingManagerByStaffId, staffId, managerId)) return { ok: false, reason: "cycle" };
    for (const id of reports) {
      if (wouldCreateReportingCycle(reportingManagerByStaffId, id, managerId)) return { ok: false, reason: "cycle" };
    }
    const placement = reportLikeOthersPlacement(reportingManagerByStaffId, staffId, targetStaffId);
    if (!placement) return { ok: false, reason: "none" };
    const next = new Map(reportingManagerByStaffId);
    const updates: OrgManagerUpdate[] = [];
    for (const id of reports) {
      const failed = rejectOrSet(next, id, placement.managerStaffId);
      if (failed) return failed;
      updates.push({ staffId: id, managerStaffId: placement.managerStaffId });
    }
    if (!updates.length) return { ok: false, reason: "none" };
    return { ok: true, updates };
  }

  const next = new Map(reportingManagerByStaffId);
  const updates: OrgManagerUpdate[] = [];
  const reports = directReportIds(reportingManagerByStaffId, targetStaffId).filter((id) => id !== staffId);
  if (directReportIds(reportingManagerByStaffId, targetStaffId).length === 0) {
    const managerId = reportingManagerByStaffId.get(targetStaffId) ?? null;
    if (!managerId) return { ok: false, reason: "none" };
    if (reportingManagerByStaffId.get(staffId) !== managerId) {
      const failed = rejectOrSet(next, staffId, managerId);
      if (failed) return failed;
      updates.push({ staffId, managerStaffId: managerId });
    }
    if (reportingManagerByStaffId.get(targetStaffId) !== staffId) {
      const failed = rejectOrSet(next, targetStaffId, staffId);
      if (failed) return failed;
      updates.push({ staffId: targetStaffId, managerStaffId: staffId });
    }
    if (!updates.length) return { ok: false, reason: "none" };
    return { ok: true, updates };
  }
  if (reportingManagerByStaffId.get(staffId) !== targetStaffId) {
    const failed = rejectOrSet(next, staffId, targetStaffId);
    if (failed) return failed;
    updates.push({ staffId, managerStaffId: targetStaffId });
  } else if (!reportingDrop(next, staffId, targetStaffId).ok) {
    return { ok: false, reason: "cycle" };
  }
  for (const id of reports) {
    const failed = rejectOrSet(next, id, staffId);
    if (failed) return failed;
    updates.push({ staffId: id, managerStaffId: staffId });
  }
  if (!updates.length) return { ok: false, reason: "none" };
  return { ok: true, updates };
}

/** Sr. Site Supervisor, including "Senior Site Supervisor". A plain Site Supervisor does not match. */
export function isSrSiteSupervisorTitle(jobTitle: string | null | undefined): boolean {
  const title = (jobTitle ?? "").trim();
  if (!title) return false;
  return /(?:^|[\s,/])(?:sr\.?\s*|senior\s+)site supervisor\b/i.test(title);
}

function isAboveLocationTeam(jobTitle: string | null | undefined): boolean {
  if (isSrSiteSupervisorTitle(jobTitle)) return true;
  return /head of operations|managing director|\bgeneral manager\b|chief executive/i.test(jobTitle ?? "");
}

export type LocationTeamStaff = {
  staffId: string;
  jobTitle: string | null;
  locationId?: string | null;
  reportingManagerStaffId: string | null;
};

export type LocationTeamLeaderReason =
  | "missing"
  | "no-location"
  | "is-supervisor"
  | "above-team"
  | "no-supervisor"
  | "ambiguous-supervisor"
  | "self"
  | "cycle";

export type LocationTeamLeaderPlan =
  | {
      ok: true;
      already: boolean;
      leaderStaffId: string;
      supervisorStaffId: string;
      locationId: string;
      /** Other people at the location who report to the leader after the plan. */
      reportCount: number;
      updates: OrgManagerUpdate[];
    }
  | { ok: false; reason: LocationTeamLeaderReason };

function reportingAncestors(reportingManagerByStaffId: ReadonlyMap<string, string | null>, staffId: string): string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let cursor = reportingManagerByStaffId.get(staffId) ?? null;
  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    ancestors.push(cursor);
    cursor = reportingManagerByStaffId.get(cursor) ?? null;
  }
  return ancestors;
}

/**
 * Double-click on the org chart makes this person the team leader for their location.
 * Other people at that location report to them, and they report to the Sr. Site Supervisor
 * who already supervises that location, or the Sr. Site Supervisor assigned to it.
 * A failure returns no updates. People above the supervisor are left in place so the chart cannot loop.
 */
export function planLocationTeamLeader(
  people: readonly LocationTeamStaff[],
  staffId: string,
): LocationTeamLeaderPlan {
  const person = people.find((row) => row.staffId === staffId);
  if (!person) return { ok: false, reason: "missing" };
  if (isSrSiteSupervisorTitle(person.jobTitle)) return { ok: false, reason: "is-supervisor" };
  if (isAboveLocationTeam(person.jobTitle)) return { ok: false, reason: "above-team" };
  const locationId = person.locationId?.trim() || null;
  if (!locationId) return { ok: false, reason: "no-location" };

  const byId = new Map(people.map((row) => [row.staffId, row]));
  const managers = new Map(people.map((row) => [row.staffId, row.reportingManagerStaffId]));
  const locationPeople = people.filter((row) => (row.locationId?.trim() || null) === locationId);
  const supervisingIds = new Set<string>();
  for (const row of locationPeople) {
    for (const ancestorId of reportingAncestors(managers, row.staffId)) {
      const ancestor = byId.get(ancestorId);
      if (!ancestor || ancestor.staffId === staffId) continue;
      if (isSrSiteSupervisorTitle(ancestor.jobTitle)) supervisingIds.add(ancestor.staffId);
    }
  }

  const supervising = [...supervisingIds]
    .map((id) => byId.get(id))
    .filter((row): row is LocationTeamStaff => Boolean(row))
    .sort((a, b) => a.staffId.localeCompare(b.staffId));
  let supervisor: LocationTeamStaff | null = null;
  if (supervising.length === 1) {
    supervisor = supervising[0] ?? null;
  } else if (supervising.length > 1) {
    const atLocation = supervising.filter((row) => (row.locationId?.trim() || null) === locationId);
    if (atLocation.length !== 1) return { ok: false, reason: "ambiguous-supervisor" };
    supervisor = atLocation[0] ?? null;
  } else {
    const atLocation = people
      .filter(
        (row) =>
          row.staffId !== staffId &&
          (row.locationId?.trim() || null) === locationId &&
          isSrSiteSupervisorTitle(row.jobTitle),
      )
      .sort((a, b) => a.staffId.localeCompare(b.staffId));
    if (atLocation.length !== 1) {
      return { ok: false, reason: atLocation.length === 0 ? "no-supervisor" : "ambiguous-supervisor" };
    }
    supervisor = atLocation[0] ?? null;
  }
  if (!supervisor || supervisor.staffId === staffId) return { ok: false, reason: "self" };

  const next = new Map(managers);
  if (wouldCreateReportingCycle(next, staffId, supervisor.staffId)) return { ok: false, reason: "cycle" };

  const updates: OrgManagerUpdate[] = [];
  if (next.get(staffId) !== supervisor.staffId) {
    next.set(staffId, supervisor.staffId);
    updates.push({ staffId, managerStaffId: supervisor.staffId });
  }

  const peers = locationPeople
    .filter((row) => row.staffId !== staffId && row.staffId !== supervisor.staffId && !isAboveLocationTeam(row.jobTitle))
    .sort((a, b) => a.staffId.localeCompare(b.staffId));
  for (const row of peers) {
    if (next.get(row.staffId) === staffId) continue;
    if (wouldCreateReportingCycle(next, row.staffId, staffId)) continue;
    next.set(row.staffId, staffId);
    updates.push({ staffId: row.staffId, managerStaffId: staffId });
  }

  const reportCount = locationPeople.filter(
    (row) => row.staffId !== staffId && row.staffId !== supervisor.staffId && next.get(row.staffId) === staffId,
  ).length;
  return {
    ok: true,
    already: updates.length === 0,
    leaderStaffId: staffId,
    supervisorStaffId: supervisor.staffId,
    locationId,
    reportCount,
    updates,
  };
}

export function staffOnOrgChart(people: readonly OrgReportingRow[]): Set<string> {
  const known = new Set(people.map((person) => person.staffId));
  const referenced = new Set<string>();
  for (const person of people) {
    const managerId = person.reportingManagerStaffId;
    if (managerId && known.has(managerId)) referenced.add(managerId);
  }
  const onChart = new Set<string>();
  for (const person of people) {
    if (person.orgChartPlaced || person.reportingManagerStaffId || referenced.has(person.staffId)) {
      onChart.add(person.staffId);
    }
  }
  return onChart;
}

function displayManagerId(
  person: OrgReportingRow,
  onChart: ReadonlySet<string>,
  reportingManagerByStaffId: ReadonlyMap<string, string | null>,
): string | null {
  const managerId = person.reportingManagerStaffId;
  if (!managerId || !onChart.has(person.staffId) || !onChart.has(managerId)) return null;
  const seen = new Set<string>([person.staffId]);
  let cursor: string | null = managerId;
  while (cursor) {
    if (seen.has(cursor)) return null;
    seen.add(cursor);
    const next: string | null = reportingManagerByStaffId.get(cursor) ?? null;
    if (next && !onChart.has(next)) break;
    cursor = next;
  }
  return managerId;
}

export function groupOrgChart<T extends OrgReportingRow>(people: readonly T[]): {
  onChart: Set<string>;
  roots: T[];
  childrenOf: Map<string, T[]>;
} {
  const onChart = staffOnOrgChart(people);
  const reportingManagerByStaffId = new Map(people.map((person) => [person.staffId, person.reportingManagerStaffId]));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];
  const visible = people
    .filter((person) => onChart.has(person.staffId))
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.staffId.localeCompare(b.staffId));

  for (const person of visible) {
    const managerId = displayManagerId(person, onChart, reportingManagerByStaffId);
    if (!managerId) {
      roots.push(person);
      continue;
    }
    const list = childrenOf.get(managerId) ?? [];
    list.push(person);
    childrenOf.set(managerId, list);
  }

  return { onChart, roots, childrenOf };
}

/** Managers below the top start collapsed so the first row of reports is visible. */
export function initialCollapsedIds(
  rootIds: readonly string[],
  childIdsOf: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const roots = new Set(rootIds);
  const collapsed = new Set<string>();
  for (const [id, kids] of childIdsOf) {
    if (kids.length > 0 && !roots.has(id)) collapsed.add(id);
  }
  return collapsed;
}

/** Links that stay on the canvas. A collapsed card stays put and hides its branch. */
export function expandedChildIds(
  rootIds: readonly string[],
  childIdsOf: ReadonlyMap<string, readonly string[]>,
  collapsedIds: ReadonlySet<string>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (collapsedIds.has(id)) return;
    const kids = childIdsOf.get(id);
    if (!kids?.length) return;
    result.set(id, [...kids]);
    for (const kid of kids) walk(kid);
  };
  for (const rootId of rootIds) walk(rootId);
  return result;
}

/** Every person who has reports. Collapse-all hides each of these branches. */
export function collapsibleOrgIds(
  rootIds: readonly string[],
  childIdsOf: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const ids = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const kids = childIdsOf.get(id);
    if (!kids?.length) return;
    ids.add(id);
    for (const kid of kids) walk(kid);
  };
  for (const rootId of rootIds) walk(rootId);
  return ids;
}

/**
 * Name lines that fit in the org card. The editable card leaves room for the
 * avatar, status dot, and remove control, so a line holds fewer characters
 * than the read-only card.
 */
const ORG_NAME_CHARS_PER_LINE = 14;
const ORG_NAME_CHARS_PER_LINE_READONLY = 18;
const ORG_NAME_LINE_PX = 18;

/**
 * Wrapped name lines for a card that is ORG_NODE_WIDTH wide.
 * A word longer than the line is split so every character stays visible.
 */
export function wrapOrgChartName(fullName: string, charsPerLine: number): string[] {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const width = Math.max(1, charsPerLine);
  const lines: string[] = [];
  let current = "";

  const take = (word: string) => {
    if (word.length <= width) {
      current = word;
      return;
    }
    let rest = word;
    while (rest.length > width) {
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    current = rest;
  };

  for (const word of words) {
    if (!current) {
      take(word);
      continue;
    }
    if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current);
    current = "";
    take(word);
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Name lines drawn on the org card. `readOnly` matches the wider card. */
export function orgChartWrappedName(fullName: string, readOnly = false): string[] {
  return wrapOrgChartName(
    fullName,
    readOnly ? ORG_NAME_CHARS_PER_LINE_READONLY : ORG_NAME_CHARS_PER_LINE,
  );
}

/** Wrapped name lines for a card that is ORG_NODE_WIDTH wide. */
export function orgChartNameLines(fullName: string, charsPerLine = ORG_NAME_CHARS_PER_LINE): number {
  return wrapOrgChartName(fullName, charsPerLine).length;
}

/** Card height that fits the full name on extra lines instead of an ellipsis. */
export function orgChartNodeHeight(fullName: string, readOnly = false, hasLocation = false): number {
  const lines = orgChartNameLines(
    fullName,
    readOnly ? ORG_NAME_CHARS_PER_LINE_READONLY : ORG_NAME_CHARS_PER_LINE,
  );
  return (
    ORG_NODE_HEIGHT +
    Math.max(0, lines - 1) * ORG_NAME_LINE_PX +
    (hasLocation ? ORG_LOCATION_LINE_PX : 0)
  );
}

/** Cubic curve from the parent's outgoing edge to the child's incoming edge. */
export function orgCurve(
  parent: { x: number; y: number; height?: number },
  child: { x: number; y: number; height?: number },
  rtl = false,
): { x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number } {
  const parentHeight = parent.height ?? ORG_NODE_HEIGHT;
  const childHeight = child.height ?? ORG_NODE_HEIGHT;
  const x1 = rtl ? parent.x : parent.x + ORG_NODE_WIDTH;
  const y1 = parent.y + parentHeight / 2;
  const x2 = rtl ? child.x + ORG_NODE_WIDTH : child.x;
  const y2 = child.y + childHeight / 2;
  const mid = (x1 + x2) / 2;
  return { x1, y1, c1x: mid, c1y: y1, c2x: mid, c2y: y2, x2, y2 };
}

/** SVG path for the reporting line between a parent card and a child card. */
export function orgCurvePath(
  parent: { x: number; y: number; height?: number },
  child: { x: number; y: number; height?: number },
  rtl = false,
): string {
  const curve = orgCurve(parent, child, rtl);
  return `M ${curve.x1} ${curve.y1} C ${curve.c1x} ${curve.c1y}, ${curve.c2x} ${curve.c2y}, ${curve.x2} ${curve.y2}`;
}

/** Curve from the bottom of a parent card to the top of a child card. */
export function orgRankCurve(
  parent: { x: number; y: number; height?: number },
  child: { x: number; y: number; height?: number },
): { x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number } {
  const parentHeight = parent.height ?? ORG_NODE_HEIGHT;
  const x1 = parent.x + ORG_NODE_WIDTH / 2;
  const y1 = parent.y + parentHeight;
  const x2 = child.x + ORG_NODE_WIDTH / 2;
  const y2 = child.y;
  const mid = (y1 + y2) / 2;
  return { x1, y1, c1x: x1, c1y: mid, c2x: x2, c2y: mid, x2, y2 };
}

export function orgRankCurvePath(
  parent: { x: number; y: number; height?: number },
  child: { x: number; y: number; height?: number },
): string {
  const curve = orgRankCurve(parent, child);
  return `M ${curve.x1} ${curve.y1} C ${curve.c1x} ${curve.c1y}, ${curve.c2x} ${curve.c2y}, ${curve.x2} ${curve.y2}`;
}

export function layoutOrgChart(
  rootIds: readonly string[],
  childIdsOf: ReadonlyMap<string, readonly string[]>,
  nodeHeights?: ReadonlyMap<string, number>,
): OrgChartLayout {
  const cardHeight = (id: string) => {
    const height = nodeHeights?.get(id);
    return height != null && height > 0 ? height : ORG_NODE_HEIGHT;
  };
  const heightMemo = new Map<string, number>();

  const subtreeHeight = (id: string, stack: Set<string>): number => {
    const cached = heightMemo.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) return cardHeight(id);
    stack.add(id);
    const kids = childIdsOf.get(id) ?? [];
    let height = cardHeight(id);
    if (kids.length) {
      let inner = 0;
      kids.forEach((kid, index) => {
        inner += subtreeHeight(kid, stack);
        if (index > 0) inner += ORG_SIBLING_GAP;
      });
      height = Math.max(cardHeight(id), inner);
    }
    stack.delete(id);
    heightMemo.set(id, height);
    return height;
  };

  const nodes: OrgChartLayout["nodes"] = [];
  const place = (id: string, x: number, top: number, stack: Set<string>) => {
    if (stack.has(id)) return;
    stack.add(id);
    const height = subtreeHeight(id, new Set());
    const kids = childIdsOf.get(id) ?? [];
    const nodeHeight = cardHeight(id);
    nodes.push({ staffId: id, x, y: top + (height - nodeHeight) / 2, height: nodeHeight });
    if (kids.length) {
      let inner = 0;
      kids.forEach((kid, index) => {
        inner += subtreeHeight(kid, new Set());
        if (index > 0) inner += ORG_SIBLING_GAP;
      });
      let cursor = top + Math.max(0, (height - inner) / 2);
      const childX = x + ORG_NODE_WIDTH + ORG_LEVEL_GAP;
      for (const kid of kids) {
        place(kid, childX, cursor, stack);
        cursor += subtreeHeight(kid, new Set()) + ORG_SIBLING_GAP;
      }
    }
    stack.delete(id);
  };

  let cursor = 0;
  const stack = new Set<string>();
  rootIds.forEach((rootId, index) => {
    if (index > 0) cursor += ORG_TREE_GAP;
    place(rootId, 0, cursor, stack);
    cursor += subtreeHeight(rootId, new Set());
  });

  const byId = new Map(nodes.map((node) => [node.staffId, node]));
  const connectors: string[] = [];
  for (const [parentId, kids] of childIdsOf) {
    const parent = byId.get(parentId);
    if (!parent || kids.length === 0) continue;
    for (const kid of kids) {
      const child = byId.get(kid);
      if (!child) continue;
      connectors.push(orgCurvePath(parent, child));
    }
  }

  const width = nodes.reduce((max, node) => Math.max(max, node.x + ORG_NODE_WIDTH), 0);
  const height = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
  return { nodes, connectors, width, height };
}

/** Top-down ranks. Parents sit above their reports, centered on the row. */
export function layoutOrgChartLevels(
  rootIds: readonly string[],
  childIdsOf: ReadonlyMap<string, readonly string[]>,
  nodeHeights?: ReadonlyMap<string, number>,
): OrgChartLayout {
  const cardHeight = (id: string) => {
    const height = nodeHeights?.get(id);
    return height != null && height > 0 ? height : ORG_NODE_HEIGHT;
  };
  const widthMemo = new Map<string, number>();
  const subtreeWidth = (id: string, stack: Set<string>): number => {
    const cached = widthMemo.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) return ORG_NODE_WIDTH;
    stack.add(id);
    const kids = childIdsOf.get(id) ?? [];
    let width = ORG_NODE_WIDTH;
    if (kids.length) {
      let inner = 0;
      kids.forEach((kid, index) => {
        inner += subtreeWidth(kid, stack);
        if (index > 0) inner += ORG_RANK_SIBLING_GAP;
      });
      width = Math.max(ORG_NODE_WIDTH, inner);
    }
    stack.delete(id);
    widthMemo.set(id, width);
    return width;
  };

  const depthOf = new Map<string, number>();
  const queue: string[] = [];
  for (const rootId of rootIds) {
    if (depthOf.has(rootId)) continue;
    depthOf.set(rootId, 0);
    queue.push(rootId);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (!id) continue;
    const depth = depthOf.get(id) ?? 0;
    for (const kid of childIdsOf.get(id) ?? []) {
      if (depthOf.has(kid)) continue;
      depthOf.set(kid, depth + 1);
      queue.push(kid);
    }
  }

  const rowHeight = new Map<number, number>();
  for (const [id, depth] of depthOf) {
    rowHeight.set(depth, Math.max(rowHeight.get(depth) ?? 0, cardHeight(id)));
  }
  const rowTop = new Map<number, number>();
  const maxDepth = rowHeight.size ? Math.max(...rowHeight.keys()) : -1;
  let y = 0;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    rowTop.set(depth, y);
    y += (rowHeight.get(depth) ?? ORG_NODE_HEIGHT) + ORG_RANK_GAP;
  }

  const nodes: OrgChartLayout["nodes"] = [];
  const place = (id: string, left: number, stack: Set<string>) => {
    if (stack.has(id) || !depthOf.has(id)) return;
    stack.add(id);
    const depth = depthOf.get(id) ?? 0;
    const width = subtreeWidth(id, new Set());
    const nodeHeight = cardHeight(id);
    const rowH = rowHeight.get(depth) ?? nodeHeight;
    nodes.push({
      staffId: id,
      x: left + (width - ORG_NODE_WIDTH) / 2,
      y: (rowTop.get(depth) ?? 0) + (rowH - nodeHeight) / 2,
      height: nodeHeight,
    });
    const kids = childIdsOf.get(id) ?? [];
    if (kids.length) {
      let inner = 0;
      kids.forEach((kid, index) => {
        inner += subtreeWidth(kid, new Set());
        if (index > 0) inner += ORG_RANK_SIBLING_GAP;
      });
      let cursor = left + Math.max(0, (width - inner) / 2);
      for (const kid of kids) {
        place(kid, cursor, stack);
        cursor += subtreeWidth(kid, new Set()) + ORG_RANK_SIBLING_GAP;
      }
    }
    stack.delete(id);
  };

  let cursor = 0;
  const stack = new Set<string>();
  rootIds.forEach((rootId, index) => {
    if (index > 0) cursor += ORG_TREE_GAP;
    place(rootId, cursor, stack);
    cursor += subtreeWidth(rootId, new Set());
  });

  const byId = new Map(nodes.map((node) => [node.staffId, node]));
  const connectors: string[] = [];
  for (const [parentId, kids] of childIdsOf) {
    const parent = byId.get(parentId);
    if (!parent || kids.length === 0) continue;
    for (const kid of kids) {
      const child = byId.get(kid);
      if (!child) continue;
      connectors.push(orgRankCurvePath(parent, child));
    }
  }

  const width = nodes.reduce((max, node) => Math.max(max, node.x + ORG_NODE_WIDTH), 0);
  const height = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
  return { nodes, connectors, width, height };
}

/** Direct reports move up to this person's manager. A root's reports become roots. */
export function planRemoveFromOrgChart(
  rows: readonly OrgReportingRow[],
  staffId: string,
): { childIds: string[]; childManagerId: string | null } {
  const current = rows.find((row) => row.staffId === staffId);
  return {
    childIds: rows
      .filter((row) => row.reportingManagerStaffId === staffId && row.staffId !== staffId)
      .map((row) => row.staffId),
    childManagerId: current?.reportingManagerStaffId ?? null,
  };
}

export function orgPanelGroups(departments: readonly OrgDepartment[], people: readonly OrgChartPerson[]): OrgPanelGroup[] {
  const tree = sortDepartmentsTree(
    departments.map((department) => ({
      id: department.id,
      name: department.name,
      parent_id: department.parentId,
      sort_order: department.sortOrder,
    })),
  );
  const deptIds = new Set(departments.map((department) => department.id));
  const byId = new Map<string, OrgChartPerson[]>();
  for (const department of departments) byId.set(department.id, []);
  const extras = new Map<string, OrgChartPerson[]>();
  const none: OrgChartPerson[] = [];

  for (const person of people) {
    const ids = [...new Set(person.departmentIds.filter((id) => deptIds.has(id)))];
    if (ids.length) {
      for (const id of ids) byId.get(id)?.push(person);
      continue;
    }
    const name = person.departmentName?.trim();
    if (name) {
      const list = extras.get(name) ?? [];
      list.push(person);
      extras.set(name, list);
      continue;
    }
    none.push(person);
  }

  const byName = (a: OrgChartPerson, b: OrgChartPerson) => a.fullName.localeCompare(b.fullName);
  const groups: OrgPanelGroup[] = tree.map((department) => ({
    key: department.id,
    name: department.name,
    depth: department.depth,
    people: (byId.get(department.id) ?? []).slice().sort(byName),
  }));

  for (const name of [...extras.keys()].sort((a, b) => a.localeCompare(b))) {
    groups.push({
      key: `name:${name.toLowerCase()}`,
      name,
      depth: 0,
      people: (extras.get(name) ?? []).slice().sort(byName),
    });
  }

  if (none.length) {
    groups.push({
      key: "__none__",
      name: "No department",
      depth: 0,
      people: none.slice().sort(byName),
    });
  }

  return groups;
}

export function legendForChart(people: readonly OrgChartPerson[], onChart: ReadonlySet<string>): Array<{
  key: string;
  name: string;
  color: string;
}> {
  const names = new Map<string, string>();
  for (const person of people) {
    if (!onChart.has(person.staffId)) continue;
    const key = personDepartmentKey(person) ?? "__none__";
    if (!names.has(key)) names.set(key, person.departmentName?.trim() || "No department");
  }
  return [...names.entries()]
    .map(([key, name]) => ({
      key,
      name,
      color: departmentColor(key === "__none__" ? null : key),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
