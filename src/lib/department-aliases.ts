import { normalizeDepartmentName } from "@/lib/staff-departments";

/**
 * Filter-only aliases between HO and FEC master department rows that mean the
 * same team. Catalogs stay separate (audience ho vs fec); directory / roster /
 * attendance filters treat either label or code as a match for the other.
 *
 * Canonical display stays whatever is stored on the staff row. Do not use this
 * when assigning departments in edit dialogs — audience filtering still applies.
 */
const DEPARTMENT_ALIAS_GROUPS: readonly (readonly string[])[] = [
  // HO Operations (OPS) ↔ FEC Operations (FEC_OPS)
  ["operations", "operation", "ops", "fec operations", "fec ops", "fec_ops"],
];

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

/** All match keys equivalent to this name or code (self only when not aliased). */
export function departmentMatchKeys(nameOrCode: string | null | undefined): ReadonlySet<string> {
  const key = normalizeDepartmentMatchKey(nameOrCode);
  if (!key) return new Set();
  return KEY_TO_GROUP.get(key) ?? new Set([key]);
}

/** True when this label/code belongs to a multi-name alias group (e.g. Operations). */
export function isAliasedDepartmentLabel(nameOrCode: string | null | undefined): boolean {
  const group = KEY_TO_GROUP.get(normalizeDepartmentMatchKey(nameOrCode));
  return Boolean(group && group.size > 1);
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
  const group = (() => {
    const fromName = KEY_TO_GROUP.get(normalizeDepartmentMatchKey(selected.name));
    if (fromName) return fromName;
    return KEY_TO_GROUP.get(normalizeDepartmentMatchKey(selected.code));
  })();
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
