import type { AuthContext } from "@/lib/server/create-action";
import {
  HR_POLICY_DEFAULTS,
  leaveAllotmentDefaultsFromPolicy,
  mergePolicySection,
  type HrPolicySection,
} from "@/lib/hr-policy";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export async function readPolicySection(
  context: AuthContext,
  section: HrPolicySection,
  companyId?: string | null,
): Promise<Record<string, unknown>> {
  let query = context.supabase
    .from("hr_policy_settings")
    .select("key, value, company_id")
    .eq("section", section);
  if (companyId) {
    query = query.or(`company_id.eq.${companyId},company_id.is.null`);
  } else {
    query = query.is("company_id", null);
  }
  const { data, error } = await query;
  if (error) {
    if (tableMissing(error.message)) return { ...HR_POLICY_DEFAULTS[section] };
    throw error;
  }
  const rows = data ?? [];
  const byKey = new Map<string, unknown>();
  for (const row of rows) {
    if (row.company_id == null && byKey.has(row.key)) continue;
    byKey.set(row.key, row.value);
  }
  return mergePolicySection(
    section,
    [...byKey.entries()].map(([key, value]) => ({ key, value })),
  );
}

export async function readLeaveAllotmentDefaults(context: AuthContext): Promise<{
  annual: number;
  sick: number;
}> {
  const leave = await readPolicySection(context, "leave");
  return leaveAllotmentDefaultsFromPolicy(leave);
}
