export type DepartmentAudience = "ho" | "fec";

export const HEAD_OFFICE_LOCATION_CODE = "HO";

export function departmentAudienceForLocationCode(
  code: string | null | undefined,
): DepartmentAudience | null {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return null;
  return normalized === HEAD_OFFICE_LOCATION_CODE ? "ho" : "fec";
}

/**
 * Location pickers: Head Office keeps HO departments, every other site gets the FEC catalog.
 * With no location, both audiences stay available. `keepIds` preserves a current assignment
 * that sits outside the filtered list.
 */
export function filterDepartmentsForLocation<
  T extends { id: string; audience?: string | null; active?: boolean | null },
>(
  departments: readonly T[],
  locationCode: string | null | undefined,
  keepIds: readonly string[] = [],
): T[] {
  const audience = departmentAudienceForLocationCode(locationCode);
  const keep = new Set(keepIds.filter(Boolean));
  return departments.filter((department) => {
    if (keep.has(department.id)) return true;
    if (department.active === false) return false;
    if (!audience || department.audience == null || department.audience === "") return true;
    return department.audience === audience;
  });
}
