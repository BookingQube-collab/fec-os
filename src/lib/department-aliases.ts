import { normalizeDepartmentName } from "@/lib/staff-departments";

/**
 * Filter + display aliases between HO and FEC master department rows that mean
 * the same team. Catalogs may still store separate audience rows; directory /
 * roster / attendance / dashboard charts treat either label or code as one team.
 *
 * Product display for this group is always {@link CANONICAL_OPERATIONS_LABEL}.
 * Assignment pickers still use audience filtering, except Operations itself is
 * treated as shared for both HO and FEC sites (see filterDepartmentsForLocation).
 */
const DEPARTMENT_ALIAS_GROUPS: readonly (readonly string[])[] = [
  // HO Operations (OPS) ↔ FEC Operations (FEC_OPS) and legacy free-text spellings
  [
    "operations",
    "operation",
    "ops",
    "fec operations",
    "fec operation",
    "fec ops",
    "fec op",
    "fec_ops",
  ],
];

/** Single user-facing name for the Operations alias group. */
export const CANONICAL_OPERATIONS_LABEL = "Operations";

/** Collapse spaces and underscores so OPS / FEC_OPS / "FEC Operations" share keys. */
export function normalizeDepartmentMatchKey(value: string | null | undefined): string {
  return normalizeDepartmentName(value ?? "").replace(/_/g, " ");
}

const KEY_TO_GROUP = (() => {
  const map = new Map<string, ReadonlySet<string>>();
  for (const group of DEPARTMENT_ALIAS_GROUPS) {
    const keys = new Set(group.map((entry) => normalizeDepartmentMatchKey(entry)).filter(Boolean));
    for (const key of keys) map.set(key, keys);
  }
  return map;
})();

function aliasGroupFor(nameOrCode: string | null | undefined): ReadonlySet<string> | undefined {
  return KEY_TO_GROUP.get(normalizeDepartmentMatchKey(nameOrCode));
}

/** All match keys equivalent to this name or code (self only when not aliased). */
export function departmentMatchKeys(nameOrCode: string | null | undefined): ReadonlySet<string> {
  const key = normalizeDepartmentMatchKey(nameOrCode);
  if (!key) return new Set();
  return KEY_TO_GROUP.get(key) ?? new Set([key]);
}

/** True when this label/code belongs to a multi-name alias group (e.g. Operations). */
export function isAliasedDepartmentLabel(nameOrCode: string | null | undefined): boolean {
  const group = aliasGroupFor(nameOrCode);
  return Boolean(group && group.size > 1);
}

/** True when the label/code is in the Operations alias group. */
export function isOperationsDepartmentLabel(nameOrCode: string | null | undefined): boolean {
  const group = aliasGroupFor(nameOrCode);
  return Boolean(group?.has("operations"));
}

/**
 * User-facing department label. Operations aliases always render as "Operations"
 * so charts, filters, and tables never show "FEC Operations" / "fec operation".
 */
export function canonicalDepartmentDisplayName(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "";
  if (isOperationsDepartmentLabel(raw)) return CANONICAL_OPERATIONS_LABEL;
  return raw;
}

/**
 * Aggregation key for headcount charts: Operations aliases share one bucket.
 * Falls back to the normalized name, then an id, then "unassigned".
 */
export function departmentAggregateKey(
  name: string | null | undefined,
  fallbackId?: string | null,
): string {
  if (isOperationsDepartmentLabel(name)) return "operations";
  const key = normalizeDepartmentMatchKey(name);
  if (key) return key;
  const id = fallbackId != null ? String(fallbackId).trim() : "";
  return id || "unassigned";
}

/** True when two department labels/codes are the same team under alias rules. */
export function departmentLabelsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const rightKey = normalizeDepartmentMatchKey(right);
  if (!rightKey) return false;
  return departmentMatchKeys(left).has(rightKey);
}

/**
 * Expand a selected master department to every catalog id in its alias group.
 * Returns only the selected id when the name/code is not aliased.
 */
export function expandDepartmentAliasIds(
  selected: { id: string; name?: string | null; code?: string | null },
  catalog: readonly { id: string; name?: string | null; code?: string | null }[],
): string[] {
  const group = aliasGroupFor(selected.name) ?? aliasGroupFor(selected.code);
  if (!group) return [selected.id];

  const ids = new Set<string>([selected.id]);
  for (const row of catalog) {
    const nameKey = normalizeDepartmentMatchKey(row.name);
    const codeKey = normalizeDepartmentMatchKey(row.code);
    if ((nameKey && group.has(nameKey)) || (codeKey && group.has(codeKey))) {
      ids.add(row.id);
    }
  }
  return [...ids];
}

/**
 * Collapse Operations alias rows to one filter option labeled "Operations",
 * preferring code OPS / name Operations when both HO and FEC rows exist.
 */
export function dedupeDepartmentOptionsByAlias<
  T extends { id: string; name?: string | null; code?: string | null },
>(departments: readonly T[]): T[] {
  const preferredOps = [...departments]
    .filter((row) => isOperationsDepartmentLabel(row.name) || isOperationsDepartmentLabel(row.code))
    .sort((a, b) => operationsPreferenceRank(a) - operationsPreferenceRank(b))[0];

  const out: T[] = [];
  let opsEmitted = false;
  for (const row of departments) {
    if (isOperationsDepartmentLabel(row.name) || isOperationsDepartmentLabel(row.code)) {
      if (opsEmitted) continue;
      opsEmitted = true;
      const pick = preferredOps ?? row;
      out.push({ ...pick, name: CANONICAL_OPERATIONS_LABEL });
      continue;
    }
    out.push(row);
  }
  return out;
}

function operationsPreferenceRank(row: { name?: string | null; code?: string | null }): number {
  const code = normalizeDepartmentMatchKey(row.code);
  const name = normalizeDepartmentMatchKey(row.name);
  if (code === "ops" || name === "operations") return 0;
  if (code === "fec ops" || code === "fec_ops") return 1;
  return 2;
}

/**
 * Join department labels for tables/cards, collapsing Operations aliases to one
 * "Operations" token so compound rows never show both "fec operation" and Operations.
 */
export function formatCanonicalDepartmentDisplay(
  names: readonly (string | null | undefined)[] | null | undefined,
  fallback?: string | null,
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names ?? []) {
    if (!raw?.trim()) continue;
    const label = canonicalDepartmentDisplayName(raw) || raw.trim();
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  if (out.length) return out.join(", ");
  const fb = (fallback ?? "").trim();
  return fb ? canonicalDepartmentDisplayName(fb) || fb : "";
}
