/**
 * Staff profile / salary / status history helpers (Phase 1 foundation).
 * Salary current snapshot syncs only via history insert path.
 */

import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import {
  parseSalaryExtras,
  serializeSalaryExtras,
  type SalaryExtra,
} from "@/lib/salary-package";
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

function allowanceNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Insert salary history then sync staff_compensation current snapshot (package + Qatar components). */
export async function insertSalaryHistoryAndSync(
  context: AuthContext,
  input: {
    staffId: string;
    monthlyTotalQar: number | null;
    dailyRateQar?: number | null;
    /** When omitted, existing compensation.basic_qar is kept (monthly-only edits). */
    basicQar?: number | null;
    housingQar?: number | null;
    transportQar?: number | null;
    /** When true, null housing/transport clear those columns (profile split save). */
    replaceComponents?: boolean;
    /** When set, replaces custom extras on the live snapshot + history allowances.extras. */
    extras?: SalaryExtra[] | null;
    allowances?: Record<string, unknown>;
    effectiveOn?: string;
    reason?: string | null;
    locationId?: string | null;
  },
): Promise<{ historyId: string }> {
  const effectiveOn = input.effectiveOn ?? qatarToday();
  const replace = Boolean(input.replaceComponents);
  let existingComp: {
    basic_qar?: number | null;
    housing_qar?: number | null;
    transport_qar?: number | null;
    extras?: unknown;
  } | null = null;
  {
    const first = await supabaseAdmin
      .from("staff_compensation")
      .select("basic_qar, housing_qar, transport_qar, extras")
      .eq("staff_id", input.staffId)
      .maybeSingle();
    if (first.error && /extras/i.test(first.error.message)) {
      const legacy = await supabaseAdmin
        .from("staff_compensation")
        .select("basic_qar, housing_qar, transport_qar")
        .eq("staff_id", input.staffId)
        .maybeSingle();
      if (!legacy.error) existingComp = legacy.data ? { ...legacy.data, extras: [] } : null;
    } else if (!first.error) {
      existingComp = first.data;
    }
  }

  const housingFromInput =
    input.housingQar !== undefined
      ? allowanceNumber(input.housingQar)
      : allowanceNumber(input.allowances?.housing);
  const transportFromInput =
    input.transportQar !== undefined
      ? allowanceNumber(input.transportQar)
      : allowanceNumber(input.allowances?.transportation) ??
        allowanceNumber(input.allowances?.transport);
  const basicFromInput =
    input.basicQar !== undefined
      ? allowanceNumber(input.basicQar)
      : undefined;

  const housing = replace
    ? (housingFromInput ?? null)
    : (housingFromInput ?? allowanceNumber(existingComp?.housing_qar));
  const transport = replace
    ? (transportFromInput ?? null)
    : (transportFromInput ?? allowanceNumber(existingComp?.transport_qar));
  const basic =
    basicFromInput !== undefined
      ? basicFromInput
      : allowanceNumber(existingComp?.basic_qar) ??
        (input.dailyRateQar != null && Number(input.dailyRateQar) > 0
          ? null
          : allowanceNumber(input.monthlyTotalQar));

  const extras =
    input.extras !== undefined && input.extras !== null
      ? parseSalaryExtras(input.extras)
      : parseSalaryExtras(existingComp?.extras);

  const allowances: Record<string, unknown> = {
    ...(input.allowances ?? {}),
  };
  if (housing != null) allowances.housing = housing;
  if (transport != null) allowances.transportation = transport;
  allowances.extras = serializeSalaryExtras(extras);

  // Service role after people.edit_salary: salary RLS has blocked every history write (0 rows in prod).
  const { data: hist, error: histErr } = await supabaseAdmin
    .from("staff_salary_history")
    .insert({
      staff_id: input.staffId,
      effective_on: effectiveOn,
      basic_qar: basic,
      allowances: allowances as Json,
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

  const extrasJson = serializeSalaryExtras(extras) as unknown as Json;
  const { error: compErr } = await supabaseAdmin.from("staff_compensation").upsert({
    staff_id: input.staffId,
    monthly_salary_qar: input.monthlyTotalQar,
    daily_rate_qar: input.dailyRateQar ?? null,
    basic_qar: basic,
    housing_qar: housing,
    transport_qar: transport,
    extras: extrasJson,
    currency: "QAR",
    updated_by: context.userId,
  });
  if (compErr) {
    if (/extras/i.test(compErr.message)) {
      const { error: legacyCompErr } = await supabaseAdmin.from("staff_compensation").upsert({
        staff_id: input.staffId,
        monthly_salary_qar: input.monthlyTotalQar,
        daily_rate_qar: input.dailyRateQar ?? null,
        basic_qar: basic,
        housing_qar: housing,
        transport_qar: transport,
        currency: "QAR",
        updated_by: context.userId,
      });
      if (legacyCompErr) throw legacyCompErr;
    } else {
      throw compErr;
    }
  }

  try {
    await audit(
      context,
      "staff.salary_changed",
      "staff_salary_history",
      hist.id,
      {
        staff_id: input.staffId,
        monthly_total_qar: input.monthlyTotalQar,
        basic_qar: basic,
        housing_qar: housing,
        transport_qar: transport,
        extras: serializeSalaryExtras(extras),
        daily_rate_qar: input.dailyRateQar ?? null,
        effective_on: effectiveOn,
      },
      input.locationId,
    );
  } catch (e) {
    console.warn("[staff-history] audit after salary change failed", e instanceof Error ? e.message : e);
  }
  try {
    await appendEmployeeEvent(context, {
      staffId: input.staffId,
      eventType: "salary_change",
      effectiveOn,
      payload: {
        monthly_total_qar: input.monthlyTotalQar,
        basic_qar: basic,
        housing_qar: housing,
        transport_qar: transport,
        extras: serializeSalaryExtras(extras),
        daily_rate_qar: input.dailyRateQar ?? null,
        reason: input.reason ?? null,
      },
      sourceTable: "staff_salary_history",
      sourceId: hist.id,
    });
  } catch (e) {
    console.warn("[staff-history] timeline after salary change failed", e instanceof Error ? e.message : e);
  }
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
