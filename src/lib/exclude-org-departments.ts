import { splitDepartmentTokens } from "@/lib/staff-departments";

/**
 * View-only focus departments for the employees / roster / HR filters.
 *
 * The dropdown starts with Operations, Maintenance, and F&B Cafe checked.
 * While every box stays checked, the list is unrestricted.
 * Unchecking one or more switches to show-only: the list keeps staff in the
 * unchecked departments and hides everyone else, including people with no
 * department. Checking all three again clears that restriction.
 * An explicit department choice still wins and this filter is ignored.
 *
 * Exact match after trim, case-fold, and whitespace collapse. "&" and "fnb"
 * are read as "f and b". A name matches only when the whole label is one of
 * the keys below — longer names are left alone (FEC Operations, Site Operations,
 * F&B Operations, F&B Manager, F&B Cashier, Barista, Chef, Maintenance Assistant / Electrician, Food).
 *
 * Stored master departments this covers:
 * - Operations (OPS), plus the close label Operation
 * - Maintenance (MAINT), plus the close label Maintenace
 * - F&B Cafe (FB_CAFE), plus F&B (FB), FnB Cafe, and F and B Cafe
 */
export const ORG_FOCUS_DEPARTMENTS = ["operations", "maintenance", "fb_cafe"] as const;

export type OrgFocusDepartment = (typeof ORG_FOCUS_DEPARTMENTS)[number];

export type OrgDepartmentChecks = Record<OrgFocusDepartment, boolean>;

export const ALL_ORG_DEPARTMENTS_CHECKED: OrgDepartmentChecks = {
  operations: true,
  maintenance: true,
  fb_cafe: true,
};

const OPERATIONS_KEYS = new Set(["operations", "operation"]);
const MAINTENANCE_KEYS = new Set(["maintenance", "maintenace"]);
const FB_CAFE_KEYS = new Set(["f and b", "f and b cafe"]);

const CODE_TO_FOCUS: Record<string, OrgFocusDepartment> = {
  OPS: "operations",
  MAINT: "maintenance",
  FB: "fb_cafe",
  FB_CAFE: "fb_cafe",
};

export function normalizeOrgDepartmentKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bfnb\b/g, "f and b")
    .replace(/\s+/g, " ")
    .trim();
}

export function orgFocusDepartmentOfName(name: string | null | undefined): OrgFocusDepartment | null {
  const raw = (name ?? "").trim();
  if (!raw || raw === "—" || raw === "-") return null;
  const fromCode = CODE_TO_FOCUS[raw.toUpperCase()];
  if (fromCode) return fromCode;
  const key = normalizeOrgDepartmentKey(raw);
  if (OPERATIONS_KEYS.has(key)) return "operations";
  if (MAINTENANCE_KEYS.has(key)) return "maintenance";
  if (FB_CAFE_KEYS.has(key)) return "fb_cafe";
  return null;
}

export function orgFocusDepartmentOf(row: {
  name?: string | null;
  code?: string | null;
}): OrgFocusDepartment | null {
  const code = (row.code ?? "").trim().toUpperCase();
  if (code && CODE_TO_FOCUS[code]) return CODE_TO_FOCUS[code];
  return orgFocusDepartmentOfName(row.name);
}

/** Master-department ids that belong to the show-only keys. Empty keys → no ids. */
export function orgDepartmentIdsFor(
  departments: readonly { id: string; name?: string | null; code?: string | null }[],
  showOnly: readonly OrgFocusDepartment[],
): string[] {
  if (showOnly.length === 0) return [];
  const wanted = new Set(showOnly);
  return departments
    .filter((row) => {
      const focus = orgFocusDepartmentOf(row);
      return Boolean(row.id) && focus != null && wanted.has(focus);
    })
    .map((row) => row.id);
}

/** Empty, "all", or an empty multi-select means the department filter is not narrowed. */
export function orgDepartmentSelectionIsAll(
  selected: string | readonly string[] | null | undefined,
): boolean {
  if (selected == null) return true;
  if (typeof selected === "string") {
    const value = selected.trim().toLowerCase();
    return value === "" || value === "all";
  }
  return selected.length === 0;
}

/**
 * Departments to show, in dropdown order.
 * Empty while every box is checked, or while a specific department filter is set.
 */
export function activeShowOnlyOrgDepartments(
  checks: OrgDepartmentChecks,
  selected: string | readonly string[] | null | undefined,
): OrgFocusDepartment[] {
  if (!orgDepartmentSelectionIsAll(selected)) return [];
  return ORG_FOCUS_DEPARTMENTS.filter((key) => !checks[key]);
}

export function parseShowOrgDepartmentsParam(raw: string | null | undefined): OrgFocusDepartment[] {
  if (!raw?.trim()) return [];
  const allowed = new Set<string>(ORG_FOCUS_DEPARTMENTS);
  const out: OrgFocusDepartment[] = [];
  for (const part of raw.split(",")) {
    const key = part.trim();
    if (!allowed.has(key) || out.includes(key as OrgFocusDepartment)) continue;
    out.push(key as OrgFocusDepartment);
  }
  return out;
}

function knownLabels(labels: readonly string[]): string[] {
  return labels.map((label) => label.trim()).filter((label) => label && label !== "—" && label !== "-");
}

function labelsMatchShowOnly(labels: readonly string[], showOnly: readonly OrgFocusDepartment[]): boolean {
  if (showOnly.length === 0) return true;
  const known = knownLabels(labels);
  if (known.length === 0) return false;
  const wanted = new Set(showOnly);
  return known.some((label) => {
    const focus = orgFocusDepartmentOfName(label);
    return focus != null && wanted.has(focus);
  });
}

/** Show-only match for a display department string. No restriction when `showOnly` is empty. */
export function displayDepartmentShown(
  raw: string | null | undefined,
  showOnly: readonly OrgFocusDepartment[],
): boolean {
  return labelsMatchShowOnly(splitDepartmentTokens(raw), showOnly);
}

/**
 * Show a staff row when show-only is off, or when any linked / legacy department
 * is one of the unchecked departments. No department is hidden while show-only is on.
 */
export function staffMatchesOrgShowOnly(
  staff: {
    department?: string | null;
    department_names?: readonly string[] | null;
  },
  showOnly: readonly OrgFocusDepartment[],
): boolean {
  const labels: string[] = [];
  for (const name of staff.department_names ?? []) {
    if (name?.trim()) labels.push(name.trim());
  }
  labels.push(...splitDepartmentTokens(staff.department));
  return labelsMatchShowOnly(labels, showOnly);
}

const RECORD_DEPARTMENT_KEYS = ["department", "departmentName", "department_name", "scope"] as const;

/** Show a report row under the same show-only rule. Missing department text is hidden while active. */
export function recordMatchesOrgShowOnly(
  row: Record<string, unknown>,
  showOnly: readonly OrgFocusDepartment[],
): boolean {
  const labels: string[] = [];
  for (const key of RECORD_DEPARTMENT_KEYS) {
    const value = row[key];
    if (typeof value !== "string") continue;
    labels.push(...splitDepartmentTokens(value));
  }
  return labelsMatchShowOnly(labels, showOnly);
}
