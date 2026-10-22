import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  expandDepartmentAliasIds,
  isAliasedDepartmentLabel,
} from "@/lib/department-aliases";

/**
 * Expand People / attendance department filter ids so HO Operations and
 * FEC Operations (and any future alias pairs) resolve to the same staff set.
 */
export async function resolveDepartmentFilterIds(
  departmentIds: readonly string[],
): Promise<string[]> {
  const ids = [...new Set(departmentIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data: selected, error } = await supabaseAdmin
    .from("master_departments")
    .select("id, name, code")
    .in("id", ids);
  if (error) throw error;
  if (!selected?.length) return ids;

  const needsAlias = selected.some(
    (row) => isAliasedDepartmentLabel(row.name) || isAliasedDepartmentLabel(row.code),
  );
  if (!needsAlias) return ids;

  const { data: catalog, error: catalogError } = await supabaseAdmin
    .from("master_departments")
    .select("id, name, code");
  if (catalogError) throw catalogError;

  const out = new Set<string>(ids);
  for (const row of selected) {
    for (const id of expandDepartmentAliasIds(row, catalog ?? [])) out.add(id);
  }
  return [...out];
}
