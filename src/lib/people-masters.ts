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

/** Pick the saved spelling when the staff text only differs by case or spacing. */
export function alignMasterValue(value: string | null | undefined, names: readonly string[]): string {
  const raw = normalizeMasterLabel(value);
  if (!raw) return "";
  const key = masterLabelKey(raw);
  return names.find((name) => masterLabelKey(name) === key) ?? raw;
}

export function masterInUseMessage(name: string, count: number): string {
  const people = count === 1 ? "1 current staff member still uses" : `${count} current staff still use`;
  return `Cannot delete "${name}". ${people} it.`;
}
