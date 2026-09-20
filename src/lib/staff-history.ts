/**
 * Staff profile / salary / status history helpers (Phase 1 foundation).
 * Salary current snapshot syncs only via history insert path.
 */

import type { Json } from "@/integrations/supabase/types";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import type { AuthContext } from "@/lib/server/create-action";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

async function audit(
  context: AuthContext,
  action: string,
  table: string,
  rowId: string,
  after: Record<string, unknown>,
  locationId?: string | null,
) {
  await context.supabase.rpc("log_audit", {
    _action: action,
    _table_name: table,
    _row_id: rowId,
    _after: after as unknown as Json,
    _location_id: locationId ?? undefined,
    _metadata: {},
  });
}

/** Insert salary history then sync staff_compensation current snapshot. */
export async function insertSalaryHistoryAndSync(
  context: AuthContext,
  input: {
    staffId: string;
    monthlyTotalQar: number | null;
    dailyRateQar?: number | null;
    basicQar?: number | null;
    allowances?: Record<string, unknown>;
    effectiveOn?: string;
    reason?: string | null;
    locationId?: string | null;
  },
): Promise<{ historyId: string }> {
  const effectiveOn = input.effectiveOn ?? qatarToday();
  const { data: hist, error: histErr } = await context.supabase
    .from("staff_salary_history")
    .insert({
      staff_id: input.staffId,
      effective_on: effectiveOn,
      basic_qar: input.basicQar ?? input.monthlyTotalQar,
      allowances: (input.allowances ?? {}) as Json,
      monthly_total_qar: input.monthlyTotalQar,
      daily_rate_qar: input.dailyRateQar ?? null,
      currency: "QAR",
      reason: input.reason ?? null,
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (histErr) throw histErr;

  const { error: compErr } = await context.supabase.from("staff_compensation").upsert({
    staff_id: input.staffId,
    monthly_salary_qar: input.monthlyTotalQar,
    daily_rate_qar: input.dailyRateQar ?? null,
    currency: "QAR",
    updated_by: context.userId,
  });
  if (compErr) throw compErr;

  await audit(
    context,
    "staff.salary_changed",
    "staff_salary_history",
    hist.id,
    {
      staff_id: input.staffId,
      monthly_total_qar: input.monthlyTotalQar,
      daily_rate_qar: input.dailyRateQar ?? null,
      effective_on: effectiveOn,
    },
    input.locationId,
  );
  await appendEmployeeEvent(context, {
    staffId: input.staffId,
    eventType: "salary_change",
    effectiveOn,
    payload: {
      monthly_total_qar: input.monthlyTotalQar,
      daily_rate_qar: input.dailyRateQar ?? null,
      reason: input.reason ?? null,
    },
    sourceTable: "staff_salary_history",
    sourceId: hist.id,
  });
  return { historyId: hist.id };
}

/** Append status history (never overwrite prior rows). */
export async function insertStatusHistory(
  context: AuthContext,
  input: {
    staffId: string;
    fromStatus: string | null;
    toStatus: string;
    effectiveOn?: string;
    reason?: string | null;
    documentId?: string | null;
    locationId?: string | null;
  },
): Promise<{ historyId: string }> {
  const effectiveOn = input.effectiveOn ?? qatarToday();
  const { data: hist, error } = await context.supabase
    .from("staff_status_history")
    .insert({
      staff_id: input.staffId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      effective_on: effectiveOn,
      reason: input.reason ?? null,
      document_id: input.documentId ?? null,
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  await audit(
    context,
    "staff.status_changed",
    "staff_status_history",
    hist.id,
    {
      staff_id: input.staffId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      effective_on: effectiveOn,
      reason: input.reason ?? null,
    },
    input.locationId,
  );
  await appendEmployeeEvent(context, {
    staffId: input.staffId,
    eventType: "status_change",
    effectiveOn,
    payload: {
      from_status: input.fromStatus,
      to_status: input.toStatus,
      reason: input.reason ?? null,
    },
    documentId: input.documentId ?? null,
    sourceTable: "staff_status_history",
    sourceId: hist.id,
  });
  return { historyId: hist.id };
}
