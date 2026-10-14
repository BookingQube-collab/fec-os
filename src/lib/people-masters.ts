/** Saved HR lists: position, gender, and nationality. Departments stay on master_departments. */

export type PeopleMasterKind = "position" | "gender" | "nationality";

export const PEOPLE_MASTER_TABLE = {
  position: "master_positions",
  gender: "master_genders",
  nationality: "master_nationalities",
} as const;

export type PeopleMasterRow = {
  id: string;
  name: string;
  usageCount: number;
};

export function normalizeMasterLabel(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function masterLabelKey(value: string | null | undefined): string {
  return normalizeMasterLabel(value).toLowerCase();
}

/** Saved spelling to insert when a typed master name is missing. Blank and case-insensitive duplicates return null. */
export function missingMasterName(query: string, names: readonly string[]): string | null {
  const name = normalizeMasterLabel(query);
  if (!name || name.length > 120) return null;
  const key = masterLabelKey(name);
  if (names.some((existing) => masterLabelKey(existing) === key)) return null;
  return name;
}

/** Pick the saved spelling when the staff text only differs by case or spacing. */
export function alignMasterValue(value: string | null | undefined, names: readonly string[]): string {
  const raw = normalizeMasterLabel(value);
  if (!raw) return "";
  const key = masterLabelKey(raw);
  return names.find((name) => masterLabelKey(name) === key) ?? raw;
}

/**
 * Map a nationality read from a card onto one saved master.
 * "Kenya" matches a saved "Kenyan" when that is the only longer or shorter label.
 */
export function matchNationalityChoice(extracted: string, names: readonly string[]): string {
  const exact = alignMasterValue(extracted, names);
  if (!exact) return "";
  if (names.some((name) => masterLabelKey(name) === masterLabelKey(exact))) return exact;
  const key = masterLabelKey(exact);
  if (key.length < 4) return exact;
  const partial = names.filter((name) => {
    const master = masterLabelKey(name);
    if (master.length < 4) return false;
    return master.startsWith(key) || key.startsWith(master);
  });
  return partial.length === 1 ? partial[0]! : exact;
}

export function masterInUseMessage(name: string, count: number): string {
  const people = count === 1 ? "1 current staff member still uses" : `${count} current staff still use`;
  return `Cannot delete "${name}". ${people} it.`;
}
