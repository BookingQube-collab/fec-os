import type { AuthContext } from "@/lib/server/auth";
import {
  isMaintenanceOtherOption,
  MAINTENANCE_REQUEST_CATEGORIES,
  MAINTENANCE_REQUEST_ISSUE_TYPES,
  mergeLookupNames,
  type MaintenanceOptionKind,
  type MaintenanceOptionRow,
} from "@/lib/maintenance/request-options";

export async function fetchMaintenanceOptions(
  context: AuthContext,
  options?: { kind?: MaintenanceOptionKind; activeOnly?: boolean },
): Promise<MaintenanceOptionRow[]> {
  const kind = options?.kind ?? "category";
  const table = kind === "category" ? "maintenance_categories" : "maintenance_issue_types";

  let q = context.supabase
    .from(table)
    .select("id, name, sort_order, is_active, is_system")
    .order("sort_order")
    .order("name");

  if (options?.activeOnly) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MaintenanceOptionRow[];
}

export async function listMergedCategoryNames(context: AuthContext): Promise<string[]> {
  const rows = await fetchMaintenanceOptions(context, { kind: "category", activeOnly: true });
  return mergeLookupNames(
    rows.map((r) => r.name),
    MAINTENANCE_REQUEST_CATEGORIES,
  );
}

export async function listMergedIssueTypeNames(context: AuthContext): Promise<string[]> {
  const rows = await fetchMaintenanceOptions(context, { kind: "issue_type", activeOnly: true });
  return mergeLookupNames(
    rows.map((r) => r.name),
    MAINTENANCE_REQUEST_ISSUE_TYPES,
  );
}

async function ensureOptionName(
  rpcName: "ensure_maintenance_category" | "ensure_maintenance_issue_type",
  name: string,
  context: AuthContext,
): Promise<string> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Name is required");
  if (isMaintenanceOtherOption(trimmed)) {
    throw new Error("Enter a custom name instead of Other");
  }
  const { data, error } = await context.supabase.rpc(rpcName, { p_name: trimmed });
  if (error) throw error;
  const resolved = typeof data === "string" ? data.trim() : "";
  if (!resolved) throw new Error("Failed to save option");
  return resolved;
}

export async function resolveMaintenanceCategoryName(
  context: AuthContext,
  name: string,
): Promise<string> {
  return ensureOptionName("ensure_maintenance_category", name, context);
}

export async function resolveMaintenanceIssueTypeName(
  context: AuthContext,
  name: string,
): Promise<string> {
  return ensureOptionName("ensure_maintenance_issue_type", name, context);
}
