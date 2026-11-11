import { isOperationsDepartmentLabel } from "@/lib/department-aliases";

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
 *
 * After FEC Operations was merged into the canonical HO Operations (OPS) row, that single
 * active Operations department must stay selectable for FEC sites too — otherwise Add
 * employee (no keepIds) hides Operations while Edit still shows it via keepIds.
 */
export function filterDepartmentsForLocation<
  T extends {
    id: string;
    audience?: string | null;
    active?: boolean | null;
    name?: string | null;
    code?: string | null;
  },
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
    if (department.audience === audience) return true;
    return (
      isOperationsDepartmentLabel(department.name) || isOperationsDepartmentLabel(department.code)
    );
  });
}
