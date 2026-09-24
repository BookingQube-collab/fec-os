/**
 * Payroll run server actions (Phase 8).
 * Keeps attendance readiness on /people/payroll as input; this posts real runs.
 */

"use server";

import { z } from "zod";

import {
  assertAdvancePayrollStatus,
  assertCanDeletePayrollPeriod,
  assertCanLockPayroll,
  assertPeriodEditable,
  buildBankTransferExportRows,
  buildChequeExportRows,
  buildWpsExportRows,
  computeDailyRateBasicQar,
  computePayrollLineAmounts,
  computeProrationFactor,
  earningsToFixedVariable,
  fecPeriodForMonth,
  filterConsumableOtClaims,
  HR_PAYROLL_PAYMENT_METHODS,
  HR_PAYROLL_STATUSES,
  isDailyRateCompensation,
  nextStatusAfter,
  resolvePaymentMethod,
  sumOtAmounts,
  type HrPayrollPaymentMethod,
  type HrPayrollStatus,
  type PayrollExportRow,
  type PayrollMoneyLine,
} from "@/lib/hr-payroll";
import {
  aggregatePayrollRows,
  isPayrollPresentDay,
  type PayrollDayInput,
} from "@/lib/attendance-hr/payroll";
import { assertCanMarkPayrollPosted } from "@/lib/hr-ot";
import { readPolicySection } from "@/lib/hr-policy-read";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function asStatus(v: string): HrPayrollStatus {
  if ((HR_PAYROLL_STATUSES as readonly string[]).includes(v)) return v as HrPayrollStatus;
  return "draft";
}

async function auditPayroll(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
) {
  try {
    const { buildHrAuditRpcArgs } = await import("@/lib/hr-audit");
    await context.supabase.rpc(
      "log_audit",
      buildHrAuditRpcArgs({
        action,
        tableName: "hr_payroll_periods",
        rowId,
        after,
      }) as never,
    );
  } catch {
    /* non-blocking */
  }
}

function requireCap(context: AuthContext, cap: Parameters<typeof canUserDo>[1]) {
  if (!canUserDo(context.roles ?? [], cap)) {
    throw new ForbiddenError(`Missing capability: ${cap}`);
  }
}

async function loadPeriod(context: AuthContext, periodId: string) {
  const { data, error } = await context.supabase
    .from("hr_payroll_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (error && !tableMissing(error.message)) throw error;
  if (!data) throw new Error("Payroll period not found.");
  return data as Record<string, unknown> & {
    id: string;
    month: string;
    date_from: string;
    date_to: string;
    status: string;
    currency: string;
  };
}

function mapPeriod(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    month: String(row.month),
    displayName: (row.display_name as string | null) ?? null,
    dateFrom: String(row.date_from).slice(0, 10),
    dateTo: String(row.date_to).slice(0, 10),
    status: asStatus(String(row.status)),
    currency: String(row.currency ?? "QAR"),
    source: String(row.source ?? "generated"),
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    reconciledAt: (row.reconciled_at as string | null) ?? null,
  };
}

function mapLine(row: Record<string, unknown>) {
  const staff = row.staff as
    | { full_name?: string; employee_code?: string; qid?: string | null }
    | { full_name?: string; employee_code?: string; qid?: string | null }[]
    | null
    | undefined;
  const s = Array.isArray(staff) ? staff[0] : staff;
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    staffId: String(row.staff_id),
    staffName: s?.full_name ?? "Staff",
    employeeCode: s?.employee_code ?? "",
    qid: s?.qid ?? null,
    paymentMethod: row.payment_method as HrPayrollPaymentMethod,
    earnings: (row.earnings as PayrollMoneyLine[]) ?? [],
    deductions: (row.deductions as PayrollMoneyLine[]) ?? [],
    grossQar: Number(row.gross_qar) || 0,
    netQar: Number(row.net_qar) || 0,
    wpsEligible: Boolean(row.wps_eligible),
    varianceVsPrev: row.variance_vs_prev == null ? null : Number(row.variance_vs_prev),
    prorationFactor: Number(row.proration_factor) || 1,
    notes: (row.notes as string | null) ?? null,
  };
}

export const listPayrollPeriods = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_PAYROLL_STATUSES, "all"]).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.view");
    let q = context.supabase
      .from("hr_payroll_periods")
      .select("*")
      .order("month", { ascending: false })
      .limit(48);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error && tableMissing(error.message)) return [];
    if (error) throw error;
    return (rows ?? []).map((r) => mapPeriod(r as Record<string, unknown>));
  },
  { auth: { capability: "payroll.view" } },
);

export const createPayrollPeriod = createAuthenticatedAction(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    notes: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const bounds = fecPeriodForMonth(data.month);
    const { data: row, error } = await context.supabase
      .from("hr_payroll_periods")
      .insert({
        month: bounds.month,
        date_from: bounds.dateFrom,
        date_to: bounds.dateTo,
        status: "draft",
        currency: "QAR",
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error(`Payroll period for ${bounds.month} already exists.`);
      }
      throw error;
    }
    const period = mapPeriod(row as Record<string, unknown>);
    await auditPayroll(context, "hr.payroll.period.create", period.id, period);
    return period;
  },
  { auth: { capability: "payroll.generate" } },
);

export const getPayrollPeriodDetail = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    paymentMethod: z.enum([...HR_PAYROLL_PAYMENT_METHODS, "all"]).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.view");
    const period = mapPeriod(await loadPeriod(context, data.periodId));
    let q = context.supabase
      .from("hr_payroll_lines")
      .select("*, staff(full_name, employee_code, qid)")
      .eq("period_id", data.periodId)
      .order("created_at", { ascending: true });
    if (data.paymentMethod && data.paymentMethod !== "all") {
      q = q.eq("payment_method", data.paymentMethod);
    }
    const { data: lines, error } = await q;
    if (error && !tableMissing(error.message)) throw error;

    const { data: locks } = await context.supabase
      .from("hr_payroll_locks")
      .select("*")
      .eq("period_id", data.periodId)
      .order("locked_at", { ascending: false })
      .limit(5);

    const mapped = (lines ?? []).map((r) => mapLine(r as Record<string, unknown>));
    const totals = {
      count: mapped.length,
      gross: mapped.reduce((s, l) => s + l.grossQar, 0),
      net: mapped.reduce((s, l) => s + l.netQar, 0),
      byMethod: {
        wps: mapped.filter((l) => l.paymentMethod === "wps").length,
        cheque: mapped.filter((l) => l.paymentMethod === "cheque").length,
        bank_transfer: mapped.filter((l) => l.paymentMethod === "bank_transfer").length,
        cash: mapped.filter((l) => l.paymentMethod === "cash").length,
      },
    };

    return {
      period,
      lines: mapped,
      locks: locks ?? [],
      totals,
      nextStatus: nextStatusAfter(period.status),
    };
  },
  { auth: { capability: "payroll.view" } },
);

type StaffPayRow = {
  id: string;
  full_name: string;
  employee_code: string | null;
  qid: string | null;
  hire_date: string | null;
  status: string;
  employment_type: string | null;
};

async function paymentDefaults(context: AuthContext) {
  const section = await readPolicySection(context, "payroll");
  const raw = section.default_payment_by_category;
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return undefined;
}

async function staffPayBundle(context: AuthContext, staffIds: string[]) {
  const { data: comps } = await context.supabase
    .from("staff_compensation")
    .select("staff_id, monthly_salary_qar, daily_rate_qar")
    .in("staff_id", staffIds);
  const { data: hist } = await context.supabase
    .from("staff_salary_history")
    .select("staff_id, basic_qar, monthly_total_qar, daily_rate_qar, allowances, effective_on")
    .in("staff_id", staffIds)
    .order("effective_on", { ascending: false });
  const { data: ext } = await context.supabase
    .from("staff_profile_ext")
    .select(
      "staff_id, employment_category, payment_method, bank_name, iban, wps_employee_id, last_working_date, releasing_date",
    )
    .in("staff_id", staffIds);

  const compBy = new Map((comps ?? []).map((c) => [c.staff_id as string, c]));
  const histBy = new Map<string, Record<string, unknown>>();
  for (const h of hist ?? []) {
    const id = h.staff_id as string;
    if (!histBy.has(id)) histBy.set(id, h as Record<string, unknown>);
  }
  const extBy = new Map((ext ?? []).map((e) => [e.staff_id as string, e]));
  return { compBy, histBy, extBy };
}

function unpaidLeaveDaysForStaff(
  leaves: Array<{
    staff_id: string;
    leave_type: string;
    days: number;
    payroll_impact?: boolean | null;
    emergency_treatment?: string | null;
    date_from: string;
    date_to: string;
  }>,
  staffId: string,
  dateFrom: string,
  dateTo: string,
): number {
  let days = 0;
  for (const lv of leaves) {
    if (lv.staff_id !== staffId) continue;
    if (lv.date_to < dateFrom || lv.date_from > dateTo) continue;
    const unpaid =
      lv.leave_type === "unpaid" ||
      lv.emergency_treatment === "unpaid" ||
      Boolean(lv.payroll_impact);
    if (!unpaid) continue;
    days += Number(lv.days) || 0;
  }
  return days;
}

export const generatePayrollLines = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    locationId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const periodRow = await loadPeriod(context, data.periodId);
    const status = asStatus(periodRow.status);
    assertPeriodEditable(status);
    if (status !== "draft" && status !== "hr_review") {
      throw new Error("Lines can only be regenerated in draft or HR review.");
    }

    const dateFrom = String(periodRow.date_from).slice(0, 10);
    const dateTo = String(periodRow.date_to).slice(0, 10);
    const defaults = await paymentDefaults(context);

    let staffQ = context.supabase
      .from("staff")
      .select("id, full_name, employee_code, qid, hire_date, status, employment_type")
      .is("deleted_at", null)
      .in("status", ["active", "on_leave", "serving_notice"]);
    if (data.locationId) staffQ = staffQ.eq("location_id", data.locationId);
    const { data: staffRows, error: staffErr } = await staffQ;
    if (staffErr) throw staffErr;
    const staff = (staffRows ?? []) as StaffPayRow[];
    if (staff.length === 0) {
      return {
        inserted: 0,
        periodId: data.periodId,
        otConsumed: 0,
        missingCompensation: 0,
        attendanceBlocked: 0,
        dateFrom,
        dateTo,
      };
    }

    const staffIds = staff.map((s) => s.id);
    const { compBy, histBy, extBy } = await staffPayBundle(context, staffIds);

    // Restore OT already posted to this period so regenerate does not drop OT amounts.
    await context.supabase
      .from("hr_ot_claims")
      .update({
        status: "hr_approved",
        payroll_posted_by: null,
        payroll_posted_at: null,
        payroll_period_id: null,
      })
      .eq("payroll_period_id", data.periodId)
      .eq("status", "payroll_posted");

    const { data: otRows } = await context.supabase
      .from("hr_ot_claims")
      .select("id, staff_id, amount_qar, status, work_date")
      .in("staff_id", staffIds)
      .eq("status", "hr_approved")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo);

    const consumableOt = filterConsumableOtClaims(
      (otRows ?? []).map((r) => ({
        id: r.id as string,
        staff_id: r.staff_id as string,
        status: String(r.status),
        amount_qar: Number(r.amount_qar) || 0,
      })),
    );
    const otByStaff = new Map<string, typeof consumableOt>();
    for (const c of consumableOt) {
      const list = otByStaff.get(c.staff_id) ?? [];
      list.push(c);
      otByStaff.set(c.staff_id, list);
    }

    const { data: airRows } = await context.supabase
      .from("hr_air_ticket_issues")
      .select("id, cash_allowance_qar, payroll_payment_status, status, entitlement_id")
      .in("payroll_payment_status", ["unpaid", "pending"])
      .in("status", ["approved", "issued"]);
    const entitlementIds = [...new Set((airRows ?? []).map((a) => a.entitlement_id as string).filter(Boolean))];
    const entStaff = new Map<string, string>();
    if (entitlementIds.length) {
      const { data: ents } = await context.supabase
        .from("hr_air_ticket_entitlements")
        .select("id, staff_id")
        .in("id", entitlementIds);
      for (const e of ents ?? []) entStaff.set(e.id as string, e.staff_id as string);
    }
    const airByStaff = new Map<string, { id: string; amount: number }[]>();
    for (const a of airRows ?? []) {
      const staffId = entStaff.get(a.entitlement_id as string);
      if (!staffId || !staffIds.includes(staffId)) continue;
      const amount = Number(a.cash_allowance_qar) || 0;
      if (amount <= 0) continue;
      const list = airByStaff.get(staffId) ?? [];
      list.push({ id: a.id as string, amount });
      airByStaff.set(staffId, list);
    }

    const { data: leaveRows } = await context.supabase
      .from("hr_leave_requests")
      .select("staff_id, leave_type, days, payroll_impact, emergency_treatment, date_from, date_to")
      .eq("status", "approved")
      .in("staff_id", staffIds)
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom);

    // Same attendance_daily_summary window as /people/attendance/reports + readiness list.
    const presentDaysByStaff = new Map<string, number>();
    const readinessByStaff = new Map<string, { payrollReady: boolean; blockingDays: number; missedPunches: number }>();
    {
      let attQ = supabaseAdmin
        .from("attendance_daily_summary")
        .select("staff_id, work_date, status, late_minutes, missed_punch, overtime_minutes, worked_minutes, punch_count")
        .in("staff_id", staffIds)
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .not("staff_id", "is", null)
        .limit(50000);
      if (data.locationId) attQ = attQ.eq("location_id", data.locationId);
      const { data: attRows } = await attQ;
      const dayInputs: PayrollDayInput[] = (attRows ?? []).map((row) => ({
        staff_id: String(row.staff_id),
        work_date: row.work_date ? String(row.work_date).slice(0, 10) : null,
        status: String(row.status ?? ""),
        late_minutes: Number(row.late_minutes ?? 0),
        missed_punch: Boolean(row.missed_punch),
        overtime_minutes: Number(row.overtime_minutes ?? 0),
        worked_minutes: Number(row.worked_minutes ?? 0),
        punch_count: Number(row.punch_count ?? 0),
      }));
      for (const day of dayInputs) {
        if (!day.staff_id || !isPayrollPresentDay(day)) continue;
        presentDaysByStaff.set(day.staff_id, (presentDaysByStaff.get(day.staff_id) ?? 0) + 1);
      }
      for (const row of aggregatePayrollRows(dayInputs)) {
        readinessByStaff.set(row.staffId, {
          payrollReady: row.payrollReady,
          blockingDays: row.blockingDays,
          missedPunches: row.missedPunches,
        });
      }
    }

    // Previous period nets for variance
    const prevMonth = (() => {
      const [y, m] = String(periodRow.month).split("-").map(Number);
      if (m === 1) return `${y - 1}-12`;
      return `${y}-${String(m - 1).padStart(2, "0")}`;
    })();
    const { data: prevPeriod } = await context.supabase
      .from("hr_payroll_periods")
      .select("id")
      .eq("month", prevMonth)
      .maybeSingle();
    const prevNetByStaff = new Map<string, number>();
    if (prevPeriod?.id) {
      const { data: prevLines } = await context.supabase
        .from("hr_payroll_lines")
        .select("staff_id, net_qar")
        .eq("period_id", prevPeriod.id);
      for (const pl of prevLines ?? []) {
        prevNetByStaff.set(pl.staff_id as string, Number(pl.net_qar) || 0);
      }
    }

    // Replace draft lines
    await context.supabase.from("hr_payroll_lines").delete().eq("period_id", data.periodId);

    const inserts: Record<string, unknown>[] = [];
    const otToConsume: string[] = [];
    const airToMark: string[] = [];
    let missingCompensation = 0;
    let attendanceBlocked = 0;

    for (const s of staff) {
      const ext = extBy.get(s.id) as
        | {
            employment_category?: string | null;
            payment_method?: string | null;
            last_working_date?: string | null;
            releasing_date?: string | null;
          }
        | undefined;
      const paymentMethod = resolvePaymentMethod({
        override: ext?.payment_method,
        employmentCategory: ext?.employment_category ?? s.employment_type,
        defaults,
      });
      const comp = compBy.get(s.id);
      const hist = histBy.get(s.id);
      const monthlyStored =
        hist?.monthly_total_qar != null
          ? Number(hist.monthly_total_qar)
          : comp?.monthly_salary_qar != null
            ? Number(comp.monthly_salary_qar)
            : null;
      const dailyStored =
        hist?.daily_rate_qar != null
          ? Number(hist.daily_rate_qar)
          : comp?.daily_rate_qar != null
            ? Number(comp.daily_rate_qar)
            : null;
      const basic =
        hist?.basic_qar != null
          ? Number(hist.basic_qar)
          : monthlyStored != null
            ? monthlyStored
            : 0;
      let allowances = 0;
      const allowJson = hist?.allowances;
      if (allowJson && typeof allowJson === "object" && !Array.isArray(allowJson)) {
        allowances = Object.values(allowJson as Record<string, unknown>).reduce(
          (sum: number, v) => sum + (Number(v) || 0),
          0,
        );
      }
      const dailyRate = dailyStored != null ? dailyStored : basic / 30;

      const exitDate = ext?.last_working_date ?? ext?.releasing_date ?? null;
      const unpaidDays = unpaidLeaveDaysForStaff(
        (leaveRows ?? []) as Parameters<typeof unpaidLeaveDaysForStaff>[0],
        s.id,
        dateFrom,
        dateTo,
      );
      const dailyPay = isDailyRateCompensation({
        monthlySalaryQar: monthlyStored,
        dailyRateQar: dailyStored,
      });
      const presentDays = presentDaysByStaff.get(s.id) ?? 0;
      const proration = dailyPay
        ? { factor: 1, unpaidLeaveDays: 0, activeDays: presentDays, periodDays: presentDays }
        : computeProrationFactor({
            dateFrom,
            dateTo,
            hireDate: s.hire_date,
            exitDate,
            unpaidLeaveDays: unpaidDays,
          });
      const basicForLine = dailyPay
        ? computeDailyRateBasicQar(dailyStored ?? 0, presentDays)
        : basic;

      const staffOt = otByStaff.get(s.id) ?? [];
      const otQar = sumOtAmounts(staffOt);
      for (const c of staffOt) otToConsume.push(c.id);

      const staffAir = airByStaff.get(s.id) ?? [];
      const airQar = staffAir.reduce((sum, a) => sum + a.amount, 0);
      for (const a of staffAir) airToMark.push(a.id);

      const computed = computePayrollLineAmounts({
        basicQar: basicForLine,
        allowancesQar: dailyPay ? 0 : allowances,
        otQar,
        airTicketAllowanceQar: airQar,
        unpaidLeaveDays: dailyPay ? 0 : unpaidDays,
        dailyRateQar: dailyRate,
        proration,
        paymentMethod,
        previousNetQar: prevNetByStaff.get(s.id) ?? null,
      });

      const ready = readinessByStaff.get(s.id);
      const hasComp =
        (Number.isFinite(monthlyStored) && (monthlyStored as number) > 0) ||
        (dailyPay && Number.isFinite(dailyStored) && (dailyStored as number) > 0);
      if (!hasComp && computed.netQar <= 0) missingCompensation += 1;
      if (ready && !ready.payrollReady) attendanceBlocked += 1;

      const noteParts: string[] = [];
      if (!hasComp && computed.netQar <= 0) noteParts.push("missing_compensation");
      if (ready && !ready.payrollReady) {
        noteParts.push(
          `attendance_blocked:${ready.blockingDays}d/${ready.missedPunches}missed`,
        );
      }

      inserts.push({
        period_id: data.periodId,
        staff_id: s.id,
        payment_method: computed.paymentMethod,
        earnings: [
          ...computed.earnings.map((e) =>
            dailyPay && e.code === "basic"
              ? {
                  ...e,
                  label: "Day rate × present days",
                  meta: { dayRateQar: dailyRate, presentDays },
                }
              : e,
          ),
          ...(staffOt.length
            ? [{ code: "ot_claim_ids", label: "OT claim ids", amountQar: 0, meta: { ids: staffOt.map((c) => c.id) } }]
            : []),
          ...(staffAir.length
            ? [
                {
                  code: "air_ticket_ids",
                  label: "Air ticket ids",
                  amountQar: 0,
                  meta: { ids: staffAir.map((a) => a.id) },
                },
              ]
            : []),
        ],
        deductions: computed.deductions,
        gross_qar: computed.grossQar,
        net_qar: computed.netQar,
        wps_eligible: computed.wpsEligible,
        variance_vs_prev: computed.varianceVsPrev,
        proration_factor: computed.prorationFactor,
        working_days: presentDays,
        notes: noteParts.length ? noteParts.join("; ") : null,
        snapshot: {
          presentDays,
          payrollReady: ready?.payrollReady ?? true,
          blockingDays: ready?.blockingDays ?? 0,
          missedPunches: ready?.missedPunches ?? 0,
          basicSalary: basicForLine,
          missingCompensation: !hasComp && computed.netQar <= 0,
        },
      });
    }

    if (inserts.length) {
      const { error: insErr } = await context.supabase.from("hr_payroll_lines").insert(inserts);
      if (insErr) throw insErr;
    }

    // Mark OT consumed (payroll_posted) — AT#4 once
    for (const claimId of otToConsume) {
      const { data: claim } = await context.supabase
        .from("hr_ot_claims")
        .select("id, status")
        .eq("id", claimId)
        .maybeSingle();
      if (!claim) continue;
      try {
        assertCanMarkPayrollPosted(String(claim.status) as "hr_approved");
      } catch {
        continue;
      }
      await context.supabase
        .from("hr_ot_claims")
        .update({
          status: "payroll_posted",
          payroll_posted_by: context.userId,
          payroll_posted_at: new Date().toISOString(),
          payroll_period_id: data.periodId,
        })
        .eq("id", claimId)
        .eq("status", "hr_approved");
      await context.supabase.from("hr_ot_claim_approvals").insert({
        claim_id: claimId,
        step: "payroll",
        action: "payroll_posted",
        actor_id: context.userId,
        note: `Consumed by payroll period ${periodRow.month}`,
      });
    }

    if (airToMark.length) {
      await context.supabase
        .from("hr_air_ticket_issues")
        .update({
          payroll_payment_status: "pending",
          payroll_period_id: data.periodId,
        })
        .in("id", airToMark);
    }

    await auditPayroll(context, "hr.payroll.lines.generate", data.periodId, {
      inserted: inserts.length,
      otConsumed: otToConsume.length,
      airPending: airToMark.length,
      missingCompensation,
      attendanceBlocked,
    });

    return {
      inserted: inserts.length,
      periodId: data.periodId,
      otConsumed: otToConsume.length,
      missingCompensation,
      attendanceBlocked,
      dateFrom,
      dateTo,
    };
  },
  { auth: { capability: "payroll.generate" } },
);

export const deletePayrollPeriod = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    confirmMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const period = await loadPeriod(context, data.periodId);
    const status = asStatus(period.status);
    assertCanDeletePayrollPeriod(status);
    if (data.confirmMonth && data.confirmMonth !== period.month) {
      throw new Error(`Confirm month must match period month ${period.month}.`);
    }

    // Release OT consumed by this run so regenerate can pick it up again.
    await context.supabase
      .from("hr_ot_claims")
      .update({
        status: "hr_approved",
        payroll_posted_by: null,
        payroll_posted_at: null,
        payroll_period_id: null,
      })
      .eq("payroll_period_id", data.periodId)
      .eq("status", "payroll_posted");

    await context.supabase
      .from("hr_air_ticket_issues")
      .update({
        payroll_payment_status: "unpaid",
        payroll_period_id: null,
      })
      .eq("payroll_period_id", data.periodId)
      .in("payroll_payment_status", ["pending", "unpaid"]);

    // Service role after capability gate — periods lack DELETE grant for authenticated.
    const { error } = await supabaseAdmin.from("hr_payroll_periods").delete().eq("id", data.periodId);
    if (error) throw error;

    await auditPayroll(context, "hr.payroll.period.delete", data.periodId, {
      month: period.month,
      status,
      dateFrom: period.date_from,
      dateTo: period.date_to,
    });
    return { periodId: data.periodId, month: period.month, deleted: true as const };
  },
  { auth: { capability: "payroll.generate" } },
);

export const advancePayrollPeriod = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    note: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const period = await loadPeriod(context, data.periodId);
    const from = asStatus(period.status);
    assertPeriodEditable(from);
    const to = nextStatusAfter(from);
    if (!to) throw new Error(`No forward step from ${from}.`);
    assertAdvancePayrollStatus(from, to);

    if (to === "attendance_validation" || to === "hr_review" || from === "draft") requireCap(context, "payroll.generate");
    if (to === "finance_review") requireCap(context, "payroll.generate");
    if (to === "gm_approved") {
      if (!canUserDo(context.roles ?? [], "payroll.finance") && !canUserDo(context.roles ?? [], "payroll.generate")) {
        throw new ForbiddenError("GM/authorized approval requires payroll.finance or payroll.generate.");
      }
      // GM step: ceo/coo (generate or finance both include them); cfo for finance
      if (
        !canUserDo(context.roles ?? [], "payroll.finance") &&
        !(context.roles ?? []).some((r) => r === "ceo" || r === "coo" || r === "hr")
      ) {
        throw new ForbiddenError("Not authorized for GM approval.");
      }
    }
    if (to === "processed" || to === "paid") requireCap(context, "payroll.finance");

    const { error } = await context.supabase
      .from("hr_payroll_periods")
      .update({ status: to })
      .eq("id", data.periodId)
      .eq("status", from);
    if (error) throw error;

    try {
      const { findUsersWithCapability, notifyUsers } = await import("@/lib/notifications/action-notify");
      const cap =
        to === "finance_review" || to === "processed" || to === "paid"
          ? "payroll.finance"
          : "payroll.generate";
      const ids = await findUsersWithCapability(cap as "payroll.finance" | "payroll.generate");
      await notifyUsers({
        userIds: ids,
        excludeUserId: context.userId,
        category: "hr_payroll",
        title: `Payroll period → ${to}`,
        body: `Period advanced to ${to}. WPS export is SIF-like for Finance validation only — not bank-certified.`,
        severity: to === "paid" || to === "locked" ? "info" : "warning",
        actionUrl: `/people/payroll/${data.periodId}`,
        sourceType: "hr_payroll_periods",
        sourceId: data.periodId,
      });
    } catch {
      /* non-blocking */
    }

    if (to === "paid") {
      // Mark pending air tickets paid for this period
      await context.supabase
        .from("hr_air_ticket_issues")
        .update({ payroll_payment_status: "paid", status: "paid", paid_by: context.userId, paid_at: new Date().toISOString() })
        .eq("payroll_period_id", data.periodId)
        .eq("payroll_payment_status", "pending");
    }

    await auditPayroll(context, `hr.payroll.advance.${from}_to_${to}`, data.periodId, {
      from,
      to,
      note: data.note ?? null,
    });
    return { periodId: data.periodId, from, to };
  },
);

export const lockPayrollPeriod = createAuthenticatedAction(
  z.object({ periodId: z.string().uuid() }),
  async (data, context) => {
    requireCap(context, "payroll.lock");
    const period = await loadPeriod(context, data.periodId);
    const status = asStatus(period.status);
    assertCanLockPayroll(status);
    const { error } = await context.supabase
      .from("hr_payroll_periods")
      .update({ status: "locked" })
      .eq("id", data.periodId);
    if (error) throw error;
    await context.supabase.from("hr_payroll_locks").insert({
      period_id: data.periodId,
      locked_by: context.userId,
    });
    await auditPayroll(context, "hr.payroll.lock", data.periodId, { previousStatus: status });
    return { periodId: data.periodId, status: "locked" as const };
  },
  { auth: { capability: "payroll.lock" } },
);

export const reopenPayrollPeriod = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    reason: z.string().trim().min(3).max(2000),
  }),
  async (data, context) => {
    requireCap(context, "payroll.lock");
    const period = await loadPeriod(context, data.periodId);
    if (asStatus(period.status) !== "locked") {
      throw new Error("Only locked periods can be reopened.");
    }
    const { error } = await context.supabase
      .from("hr_payroll_periods")
      .update({ status: "hr_review" })
      .eq("id", data.periodId)
      .eq("status", "locked");
    if (error) throw error;

    const { data: lockRow } = await context.supabase
      .from("hr_payroll_locks")
      .select("id")
      .eq("period_id", data.periodId)
      .is("reopened_at", null)
      .order("locked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lockRow?.id) {
      await context.supabase
        .from("hr_payroll_locks")
        .update({
          reopen_reason: data.reason,
          reopen_approved_by: context.userId,
          reopened_at: new Date().toISOString(),
        })
        .eq("id", lockRow.id);
    } else {
      await context.supabase.from("hr_payroll_locks").insert({
        period_id: data.periodId,
        locked_by: context.userId,
        reopen_reason: data.reason,
        reopen_approved_by: context.userId,
        reopened_at: new Date().toISOString(),
      });
    }

    await auditPayroll(context, "hr.payroll.reopen", data.periodId, { reason: data.reason });
    return { periodId: data.periodId, status: "hr_review" as const };
  },
  { auth: { capability: "payroll.lock" } },
);

export const adjustPayrollLine = createAuthenticatedAction(
  z.object({
    lineId: z.string().uuid(),
    otherEarningsQar: z.number().optional().nullable(),
    otherDeductionsQar: z.number().optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.finance");
    const { data: line, error } = await context.supabase
      .from("hr_payroll_lines")
      .select("*, hr_payroll_periods!inner(id, status)")
      .eq("id", data.lineId)
      .maybeSingle();
    if (error) throw error;
    if (!line) throw new Error("Payroll line not found.");
    const period = line.hr_payroll_periods as { id: string; status: string } | { id: string; status: string }[];
    const p = Array.isArray(period) ? period[0] : period;
    assertPeriodEditable(asStatus(p!.status));

    const earnings = [...((line.earnings as PayrollMoneyLine[] | null) ?? [])].filter((e) => e.code !== "other");
    const deductions = [...((line.deductions as PayrollMoneyLine[] | null) ?? [])].filter((d) => d.code !== "other");
    if (data.otherEarningsQar != null && data.otherEarningsQar !== 0) {
      earnings.push({
        code: "other",
        label: "Other earnings",
        amountQar: Math.round(data.otherEarningsQar * 100) / 100,
      });
    }
    if (data.otherDeductionsQar != null && data.otherDeductionsQar !== 0) {
      deductions.push({
        code: "other",
        label: "Other deductions",
        amountQar: Math.round(data.otherDeductionsQar * 100) / 100,
      });
    }
    const gross = Math.round(earnings.reduce((s, e) => s + (Number(e.amountQar) || 0), 0) * 100) / 100;
    const ded = Math.round(deductions.reduce((s, e) => s + (Number(e.amountQar) || 0), 0) * 100) / 100;
    const net = Math.max(0, Math.round((gross - ded) * 100) / 100);

    const { error: updErr } = await context.supabase
      .from("hr_payroll_lines")
      .update({
        earnings,
        deductions,
        gross_qar: gross,
        net_qar: net,
        notes: data.notes ?? line.notes,
      })
      .eq("id", data.lineId);
    if (updErr) throw updErr;

    await auditPayroll(context, "hr.payroll.line.adjust", data.lineId, {
      gross,
      net,
      otherEarningsQar: data.otherEarningsQar,
      otherDeductionsQar: data.otherDeductionsQar,
    });
    return { lineId: data.lineId, grossQar: gross, netQar: net };
  },
  { auth: { capability: "payroll.finance" } },
);

async function exportRowsForPeriod(
  context: AuthContext,
  periodId: string,
  method: HrPayrollPaymentMethod,
): Promise<{ month: string; rows: PayrollExportRow[] }> {
  const period = await loadPeriod(context, periodId);
  const { data: lines, error } = await context.supabase
    .from("hr_payroll_lines")
    .select("*, staff(full_name, employee_code, qid)")
    .eq("period_id", periodId)
    .eq("payment_method", method);
  if (error) throw error;
  const staffIds = (lines ?? []).map((l) => l.staff_id as string);
  const { data: ext } = staffIds.length
    ? await context.supabase
        .from("staff_profile_ext")
        .select("staff_id, bank_name, iban, wps_employee_id")
        .in("staff_id", staffIds)
    : { data: [] as { staff_id: string; bank_name: string | null; iban: string | null; wps_employee_id: string | null }[] };
  const extBy = new Map((ext ?? []).map((e) => [e.staff_id, e]));

  const rows: PayrollExportRow[] = (lines ?? []).map((raw) => {
    const line = mapLine(raw as Record<string, unknown>);
    const e = extBy.get(line.staffId);
    const { fixedIncome, variableIncome } = earningsToFixedVariable(line.earnings.filter((x) => x.amountQar !== 0 || !x.meta));
    const ded = Math.round(line.deductions.reduce((s, d) => s + d.amountQar, 0) * 100) / 100;
    return {
      employeeCode: line.employeeCode,
      employeeName: line.staffName,
      qid: line.qid,
      iban: e?.iban ?? null,
      bankName: e?.bank_name ?? null,
      wpsEmployeeId: e?.wps_employee_id ?? null,
      month: String(period.month),
      fixedIncome,
      variableIncome,
      deductions: ded,
      netQar: line.netQar,
      paymentMethod: line.paymentMethod,
    };
  });
  return { month: String(period.month), rows };
}

export const getPayrollExportMatrix = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    method: z.enum(HR_PAYROLL_PAYMENT_METHODS),
  }),
  async (data, context) => {
    requireCap(context, "payroll.export_wps");
    const { month, rows } = await exportRowsForPeriod(context, data.periodId, data.method);
    const matrix =
      data.method === "wps"
        ? buildWpsExportRows(rows)
        : data.method === "cheque"
          ? buildChequeExportRows(rows)
          : buildBankTransferExportRows(rows);
    await auditPayroll(context, `hr.payroll.export.${data.method}`, data.periodId, {
      rows: rows.length,
    });
    return {
      month,
      method: data.method,
      matrix,
      note:
        data.method === "wps"
          ? "SIF-like columns for Finance validation — not bank-certified WPS SIF submission."
          : null,
    };
  },
  { auth: { capability: "payroll.export_wps" } },
);

export const generatePayslips = createAuthenticatedAction(
  z.object({ periodId: z.string().uuid() }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const period = await loadPeriod(context, data.periodId);
    const { data: lines, error } = await context.supabase
      .from("hr_payroll_lines")
      .select("id, staff_id, gross_qar, net_qar, staff(full_name, employee_code)")
      .eq("period_id", data.periodId);
    if (error) throw error;

    let created = 0;
    for (const line of lines ?? []) {
      const staff = line.staff as
        | { full_name?: string; employee_code?: string }
        | { full_name?: string; employee_code?: string }[]
        | null;
      const s = Array.isArray(staff) ? staff[0] : staff;
      const summary = [
        `FEC Payslip — ${period.month}`,
        `Staff: ${s?.full_name ?? ""} (${s?.employee_code ?? ""})`,
        `Gross QAR: ${line.gross_qar}`,
        `Net QAR: ${line.net_qar}`,
        `Generated: ${new Date().toISOString()}`,
      ].join("\n");
      const path = `payroll/${data.periodId}/${line.staff_id}.txt`;
      const { error: upErr } = await context.supabase.storage
        .from("hr-employee-documents")
        .upload(path, Buffer.from(summary, "utf8"), { upsert: true, contentType: "text/plain" });
      const filePath = upErr ? null : path;
      const { error: slipErr } = await context.supabase.from("hr_payslips").upsert(
        {
          line_id: line.id,
          file_path: filePath,
          generated_at: new Date().toISOString(),
          generated_by: context.userId,
        },
        { onConflict: "line_id" },
      );
      if (!slipErr) created += 1;
    }
    await auditPayroll(context, "hr.payroll.payslips.generate", data.periodId, { created });
    return { created };
  },
  { auth: { capability: "payroll.generate" } },
);

export const listMyPayslips = createAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const { data: me } = await context.supabase
      .from("staff")
      .select("id")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!me?.id) return [];

    const { data: lines, error } = await context.supabase
      .from("hr_payroll_lines")
      .select(
        "id, period_id, gross_qar, net_qar, payment_method, hr_payroll_periods(month, date_from, date_to, status), hr_payslips(id, file_path, generated_at)",
      )
      .eq("staff_id", me.id)
      .order("created_at", { ascending: false })
      .limit(24);
    if (error && tableMissing(error.message)) return [];
    if (error) throw error;

    return (lines ?? []).map((row) => {
      const period = row.hr_payroll_periods as
        | { month?: string; date_from?: string; date_to?: string; status?: string }
        | { month?: string; date_from?: string; date_to?: string; status?: string }[]
        | null;
      const p = Array.isArray(period) ? period[0] : period;
      const slips = row.hr_payslips as
        | { id?: string; file_path?: string | null; generated_at?: string }[]
        | { id?: string; file_path?: string | null; generated_at?: string }
        | null;
      const slip = Array.isArray(slips) ? slips[0] : slips;
      return {
        lineId: row.id as string,
        periodId: row.period_id as string,
        month: p?.month ?? "",
        dateFrom: p?.date_from ?? "",
        dateTo: p?.date_to ?? "",
        status: p?.status ?? "",
        grossQar: Number(row.gross_qar) || 0,
        netQar: Number(row.net_qar) || 0,
        paymentMethod: row.payment_method as string,
        payslipId: slip?.id ?? null,
        filePath: slip?.file_path ?? null,
        generatedAt: slip?.generated_at ?? null,
      };
    });
  },
  { auth: { capability: "hr.employee_app" } },
);

export const countOpenPayrollExceptions = createAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    if (!canUserDo(context.roles ?? [], "payroll.view")) return { openPeriods: 0, lockedNeedingAttention: 0 };
    const { count, error } = await context.supabase
      .from("hr_payroll_periods")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "hr_review", "finance_review", "gm_approved"]);
    if (error && tableMissing(error.message)) return { openPeriods: 0, lockedNeedingAttention: 0 };
    if (error) throw error;
    return { openPeriods: count ?? 0, lockedNeedingAttention: 0 };
  },
  { auth: { capability: "payroll.view" } },
);
