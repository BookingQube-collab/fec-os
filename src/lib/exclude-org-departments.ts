import { splitDepartmentTokens } from "@/lib/staff-departments";

/**
 * View-only match for the "Exclude Ops, Maintenance & F&B" filter.
 *
 * Exact match after trim, case-fold, and whitespace collapse. "&" and "fnb"
 * are read as "f and b". A name matches only when the whole label is one of
 * the keys below — longer names are left alone (FEC Operations, Site Operations,
 * F&B Operations, F&B Manager, F&B Cashier, Barista, Maintenance Assistant / Electrician, Food).
 *
 * Stored master departments this covers:
 * - Operations (OPS), plus the close label Operation
 * - Maintenance (MAINT), plus the close label Maintenace
 * - F&B Cafe (FB_CAFE), plus F&B (FB), FnB Cafe, and F and B Cafe
 */
const EXCLUDED_ORG_DEPARTMENT_KEYS = new Set([
  "operations",
  "operation",
  "maintenance",
  "maintenace",
  "f and b",
  "f and b cafe",
]);

const EXCLUDED_ORG_DEPARTMENT_CODES = new Set(["OPS", "MAINT", "FB", "FB_CAFE"]);

export function normalizeOrgDepartmentKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bfnb\b/g, "f and b")
    .replace(/\s+/g, " ")
    .trim();
}

export function isExcludedOrgDepartmentName(name: string | null | undefined): boolean {
  const raw = (name ?? "").trim();
  if (!raw || raw === "—" || raw === "-") return false;
  if (EXCLUDED_ORG_DEPARTMENT_CODES.has(raw.toUpperCase())) return true;
  return EXCLUDED_ORG_DEPARTMENT_KEYS.has(normalizeOrgDepartmentKey(raw));
}

export function isExcludedOrgDepartmentCode(code: string | null | undefined): boolean {
  const raw = (code ?? "").trim();
  if (!raw) return false;
  return EXCLUDED_ORG_DEPARTMENT_CODES.has(raw.toUpperCase());
}

export function isExcludedOrgDepartment(row: {
  name?: string | null;
  code?: string | null;
}): boolean {
  return isExcludedOrgDepartmentCode(row.code) || isExcludedOrgDepartmentName(row.name);
}

/** Ids of loaded master departments the exclude filter should drop. */
export function excludedOrgDepartmentIds(
  departments: readonly { id: string; name?: string | null; code?: string | null }[],
): string[] {
  return departments.filter((row) => row.id && isExcludedOrgDepartment(row)).map((row) => row.id);
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
 * Exclude applies only while the department filter is All / empty.
 * An explicit department choice wins, including when that choice is one of the three.
 */
export function shouldApplyOrgDepartmentExclude(
  enabled: boolean,
  selected: string | readonly string[] | null | undefined,
): boolean {
  return enabled && orgDepartmentSelectionIsAll(selected);
}

function labelsAllExcluded(labels: readonly string[]): boolean {
  const known = labels.map((label) => label.trim()).filter((label) => label && label !== "—" && label !== "-");
  if (known.length === 0) return false;
  return known.every((label) => isExcludedOrgDepartmentName(label));
}

/** Hide when every department token on the display string is an excluded org department. */
export function displayDepartmentHidden(raw: string | null | undefined): boolean {
  return labelsAllExcluded(splitDepartmentTokens(raw));
}

/**
 * Hide a staff row only when every linked or legacy department label is excluded.
 * Someone who also sits in another department stays. Blank department stays.
 */
export function staffHiddenByOrgDepartmentExclude(staff: {
  department?: string | null;
  department_names?: readonly string[] | null;
}): boolean {
  const labels: string[] = [];
  for (const name of staff.department_names ?? []) {
    if (name?.trim()) labels.push(name.trim());
  }
  labels.push(...splitDepartmentTokens(staff.department));
  return labelsAllExcluded(labels);
}

const RECORD_DEPARTMENT_KEYS = ["department", "departmentName", "department_name", "scope"] as const;

/** Hide a report/list row when its department labels are present and all excluded. */
export function recordHiddenByOrgDepartmentExclude(row: Record<string, unknown>): boolean {
  const labels: string[] = [];
  for (const key of RECORD_DEPARTMENT_KEYS) {
    const value = row[key];
    if (typeof value !== "string") continue;
    labels.push(...splitDepartmentTokens(value));
  }
  return labelsAllExcluded(labels);
}
