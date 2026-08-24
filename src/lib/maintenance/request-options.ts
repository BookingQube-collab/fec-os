export const MAINTENANCE_OTHER_OPTION = "Other" as const;

export type MaintenanceOptionKind = "category" | "issue_type";

export type MaintenanceOptionRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

/**
 * Seed defaults for AI + fallback when DB is empty.
 * "Other" is UI/AI sentinel only — never seeded into master tables.
 */
export const MAINTENANCE_REQUEST_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "HVAC",
  "Structural",
  "Equipment",
  "General",
  MAINTENANCE_OTHER_OPTION,
] as const;

export const MAINTENANCE_REQUEST_ISSUE_TYPES = [
  "Breakdown",
  "Leak",
  "Noise",
  "Safety",
  "Cleaning",
  MAINTENANCE_OTHER_OPTION,
] as const;

export type MaintenanceRequestCategory = (typeof MAINTENANCE_REQUEST_CATEGORIES)[number];
export type MaintenanceRequestIssueType = (typeof MAINTENANCE_REQUEST_ISSUE_TYPES)[number];

export function normalizeMaintenanceOptionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isMaintenanceOtherOption(value: string | null | undefined): boolean {
  return normalizeMaintenanceOptionName(value ?? "") === "other";
}

/** Merge DB names with seed defaults; keep Other last; case-insensitive de-dupe. */
export function mergeLookupNames(
  fromDb: string[] | undefined | null,
  seeds: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return;
    const key = normalizeMaintenanceOptionName(name);
    if (key === "other") return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const s of seeds) push(s);
  for (const n of fromDb ?? []) push(n);
  out.push(MAINTENANCE_OTHER_OPTION);
  return out;
}

/** Alias used by form components. */
export const mergeMaintenanceOptionNames = mergeLookupNames;

/** Dropdown labels: DB rows + Other sentinel (never stored as a row). */
export function withOtherOption(names: string[]): string[] {
  return mergeLookupNames(names, []);
}

/** Prefer an existing option's casing when the candidate matches case-insensitively. */
export function matchMaintenanceOptionName(
  candidate: string | null | undefined,
  options: string[],
): string {
  const raw = candidate?.trim() ?? "";
  if (!raw) return "";
  const key = normalizeMaintenanceOptionName(raw);
  const exact = options.find((o) => normalizeMaintenanceOptionName(o) === key);
  return exact ?? raw;
}
