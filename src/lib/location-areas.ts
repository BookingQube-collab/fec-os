export interface LocationAreaRow {
  id: string;
  location_id: string;
  name: string;
  code: string | null;
  sort_order: number;
  is_active: boolean;
}

export function normalizeAreaName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match free-text / AI area against configured names (exact, then contains). */
export function matchLocationAreaName(
  candidate: string | null | undefined,
  areas: Array<{ name: string }>,
): string {
  const raw = candidate?.trim() ?? "";
  if (!raw || !areas.length) return "";
  const normalized = normalizeAreaName(raw);
  const exact = areas.find((a) => normalizeAreaName(a.name) === normalized);
  if (exact) return exact.name;
  const contained = areas.find((a) => {
    const n = normalizeAreaName(a.name);
    return normalized.includes(n) || n.includes(normalized);
  });
  return contained?.name ?? "";
}
