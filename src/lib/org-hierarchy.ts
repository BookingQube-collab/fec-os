import { sortDepartmentsTree } from "@/lib/departments";

/** Card size used by the org canvas. Layout and the card component share these. */
export const ORG_NODE_WIDTH = 220;
export const ORG_NODE_HEIGHT = 92;
export const ORG_LEVEL_GAP = 64;
const ORG_SIBLING_GAP = 28;
const ORG_TREE_GAP = 72;

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
};

export type OrgChartSnapshot = {
  departments: OrgDepartment[];
  people: OrgChartPerson[];
};

export type OrgChartLayout = {
  nodes: Array<{ staffId: string; x: number; y: number }>;
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

export function layoutOrgChart(
  rootIds: readonly string[],
  childIdsOf: ReadonlyMap<string, readonly string[]>,
): OrgChartLayout {
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
        if (index > 0) inner += ORG_SIBLING_GAP;
      });
      width = Math.max(ORG_NODE_WIDTH, inner);
    }
    stack.delete(id);
    widthMemo.set(id, width);
    return width;
  };

  const nodes: OrgChartLayout["nodes"] = [];
  const place = (id: string, left: number, y: number, stack: Set<string>) => {
    if (stack.has(id)) return;
    stack.add(id);
    const width = subtreeWidth(id, new Set());
    const kids = childIdsOf.get(id) ?? [];
    nodes.push({ staffId: id, x: left + (width - ORG_NODE_WIDTH) / 2, y });
    if (kids.length) {
      let inner = 0;
      kids.forEach((kid, index) => {
        inner += subtreeWidth(kid, new Set());
        if (index > 0) inner += ORG_SIBLING_GAP;
      });
      let cursor = left + Math.max(0, (width - inner) / 2);
      for (const kid of kids) {
        place(kid, cursor, y + ORG_NODE_HEIGHT + ORG_LEVEL_GAP, stack);
        cursor += subtreeWidth(kid, new Set()) + ORG_SIBLING_GAP;
      }
    }
    stack.delete(id);
  };

  let cursor = 0;
  const stack = new Set<string>();
  rootIds.forEach((rootId, index) => {
    if (index > 0) cursor += ORG_TREE_GAP;
    place(rootId, cursor, 0, stack);
    cursor += subtreeWidth(rootId, new Set());
  });

  const byId = new Map(nodes.map((node) => [node.staffId, node]));
  const connectors: string[] = [];
  for (const [parentId, kids] of childIdsOf) {
    const parent = byId.get(parentId);
    if (!parent || kids.length === 0) continue;
    const childNodes = kids
      .map((id) => byId.get(id))
      .filter((node): node is OrgChartLayout["nodes"][number] => Boolean(node));
    if (!childNodes.length) continue;
    const parentX = parent.x + ORG_NODE_WIDTH / 2;
    const parentY = parent.y + ORG_NODE_HEIGHT;
    const midY = parentY + ORG_LEVEL_GAP / 2;
    const centers = childNodes.map((node) => node.x + ORG_NODE_WIDTH / 2);
    const left = Math.min(...centers);
    const right = Math.max(...centers);
    const parts = [`M ${parentX} ${parentY} V ${midY}`];
    if (centers.length > 1 || left !== parentX) parts.push(`M ${Math.min(left, parentX)} ${midY} H ${Math.max(right, parentX)}`);
    for (const child of childNodes) {
      const childX = child.x + ORG_NODE_WIDTH / 2;
      parts.push(`M ${childX} ${midY} V ${child.y}`);
    }
    connectors.push(parts.join(" "));
  }

  const width = nodes.reduce((max, node) => Math.max(max, node.x + ORG_NODE_WIDTH), 0);
  const height = nodes.reduce((max, node) => Math.max(max, node.y + ORG_NODE_HEIGHT), 0);
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
