"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import {
  HR_POLICY_DEFAULTS,
  HR_POLICY_SECTIONS,
  mergePolicySection,
  type HrPolicySection,
} from "@/lib/hr-policy";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

async function auditPolicy(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
) {
  await context.supabase.rpc("log_audit", {
    _action: action,
    _table_name: "hr_policy_settings",
    _row_id: rowId,
    _after: after as unknown as Json,
    _metadata: {},
  });
}

async function upsertPolicyRow(
  context: AuthContext,
  data: {
    section: HrPolicySection;
    key: string;
    value: unknown;
    companyId?: string | null;
  },
): Promise<{ id: string }> {
  const companyId = data.companyId ?? null;
  const payload = {
    company_id: companyId,
    section: data.section,
    key: data.key,
    value: data.value as Json,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  };

  let existingQuery = context.supabase
    .from("hr_policy_settings")
    .select("id, value")
    .eq("section", data.section)
    .eq("key", data.key);
  existingQuery = companyId
    ? existingQuery.eq("company_id", companyId)
    : existingQuery.is("company_id", null);
  const { data: existing, error: findErr } = await existingQuery.maybeSingle();
  if (findErr && !tableMissing(findErr.message)) throw findErr;

  if (existing?.id) {
    const { error } = await context.supabase
      .from("hr_policy_settings")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    await auditPolicy(context, "hr.policy.upserted", existing.id, {
      section: data.section,
      key: data.key,
      before: existing.value,
      after: data.value,
    });
    return { id: existing.id };
  }

  const { data: inserted, error } = await context.supabase
    .from("hr_policy_settings")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  await auditPolicy(context, "hr.policy.upserted", inserted.id, {
    section: data.section,
    key: data.key,
    after: data.value,
  });
  return { id: inserted.id };
}

export const listHrPolicySettings = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("hr_policy_settings")
      .select("id, company_id, section, key, value, updated_at")
      .is("company_id", null)
      .order("section")
      .order("key");
    if (error) {
      if (tableMissing(error.message)) {
        return {
          sections: HR_POLICY_SECTIONS.map((section) => ({
            section,
            values: { ...HR_POLICY_DEFAULTS[section] },
          })),
        };
      }
      throw error;
    }
    const bySection = new Map<HrPolicySection, Array<{ key: string; value: unknown }>>();
    for (const section of HR_POLICY_SECTIONS) bySection.set(section, []);
    for (const row of data ?? []) {
      const section = row.section as HrPolicySection;
      if (!bySection.has(section)) continue;
      bySection.get(section)!.push({ key: row.key, value: row.value });
    }
    return {
      sections: HR_POLICY_SECTIONS.map((section) => ({
        section,
        values: mergePolicySection(section, bySection.get(section) ?? []),
      })),
    };
  },
  { auth: { anyCapability: ["hr.policy.configure", "hr.manage"] } },
);

export const upsertHrPolicySetting = createAuthenticatedAction(
  z.object({
    section: z.enum(HR_POLICY_SECTIONS),
    key: z.string().min(1).max(80),
    value: z.unknown(),
    companyId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const { id } = await upsertPolicyRow(context, {
      section: data.section,
      key: data.key,
      value: data.value ?? null,
      companyId: data.companyId,
    });
    return { ok: true as const, id };
  },
  { auth: { capability: "hr.policy.configure" } },
);

export const upsertHrPolicySection = createAuthenticatedAction(
  z.object({
    section: z.enum(HR_POLICY_SECTIONS),
    values: z.record(z.unknown()),
  }),
  async (data, context) => {
    const ids: string[] = [];
    for (const [key, value] of Object.entries(data.values)) {
      const { id } = await upsertPolicyRow(context, {
        section: data.section,
        key,
        value,
      });
      ids.push(id);
    }
    return { ok: true as const, ids };
  },
  { auth: { capability: "hr.policy.configure" } },
);
