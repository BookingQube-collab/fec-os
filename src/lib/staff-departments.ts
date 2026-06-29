export interface MasterDepartmentRow {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  sort_order: number;
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
