export interface MasterDepartmentRow {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  sort_order: number;
  parent_id?: string | null;
}

/** Split compound activity strings on + , or / */
export function splitDepartmentTokens(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[+,/]/).map((p) => p.trim()).filter(Boolean);
  return [...new Set(parts)];
}

export function formatDepartmentDisplay(names: string[]): string {
  return names.filter(Boolean).join(", ");
}

export function normalizeDepartmentName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact masterfile Department cell → optional parent/child when written as "Parent / Child". */
export function parseDepartmentHierarchyLabel(raw: string | null | undefined): {
  parentName: string | null;
  name: string;
} | null {
  const label = (raw ?? "").trim();
  if (!label) return null;
  const spaced = label.match(/^(.+?)\s+\/\s+(.+)$/);
  if (spaced) {
    return { parentName: spaced[1].trim(), name: spaced[2].trim() };
  }
  return { parentName: null, name: label };
}
