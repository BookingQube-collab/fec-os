import { FEC_DEPARTMENT_CATALOG, normalizeLabel } from "@/lib/fec-departments";

export interface MasterDepartmentRow {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  sort_order: number;
  parent_id?: string | null;
  /** ho = head office catalog. fec = site catalog. Missing on older payloads means show it. */
  audience?: "ho" | "fec" | null;
}

const FEC_CATALOG_NAMES = new Set(FEC_DEPARTMENT_CATALOG.map((row) => normalizeLabel(row.name)));

/**
 * Split compound activity strings on + or comma.
 * Slash stays inside FEC catalog names such as "Crew / Attendant".
 * Unknown "A/B" activity labels still split.
 */
export function splitDepartmentTokens(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const chunks = raw.split(/[+,,]/).map((part) => part.trim()).filter(Boolean);
  const parts: string[] = [];
  for (const chunk of chunks) {
    if (FEC_CATALOG_NAMES.has(normalizeLabel(chunk))) {
      parts.push(chunk.trim());
      continue;
    }
    const slashParts = chunk.split("/").map((part) => part.trim()).filter(Boolean);
    parts.push(...slashParts);
  }
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
