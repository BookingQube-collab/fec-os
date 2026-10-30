"use server";

import { z } from "zod";

import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { helpdeskStorageMissing, parseHelpdeskPayload } from "@/lib/hr-helpdesk.shared";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function staffBits(row: Record<string, unknown>) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  const person = staff as { full_name?: string; employee_code?: string } | null;
  return {
    staffName: person?.full_name ?? null,
    employeeCode: person?.employee_code ?? null,
  };
}

function periodBits(row: Record<string, unknown>) {
  const period = Array.isArray(row.hr_payroll_periods)
    ? row.hr_payroll_periods[0]
    : row.hr_payroll_periods;
  const p = period as { month?: string; status?: string } | null;
  return {
    periodMonth: p?.month ? String(p.month) : null,
    periodStatus: p?.status ? String(p.status) : null,
  };
}

const REQUEST_SELECT =
  "id, staff_id, event_type, effective_on, payload, created_at, staff(full_name, employee_code)";

async function listRequestEvents(
  context: AuthContext,
  eventType: "helpdesk_request" | "privacy_request",
) {
  const { data, error } = await context.supabase
    .from("hr_employee_events")
    .select(REQUEST_SELECT)
    .eq("event_type", eventType)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const payload = (row.payload as Record<string, unknown> | null) ?? {};
    return {
      id: String(row.id),
      staffId: String(row.staff_id),
      ...staffBits(row),
      effectiveOn: String(row.effective_on).slice(0, 10),
      createdAt: String(row.created_at),
      payload,
    };
  });
}

export const listHelpdeskQuestions = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const rows = await listRequestEvents(context, "helpdesk_request");
    return rows.map((row) => ({ ...row, ...parseHelpdeskPayload(row.payload) }));
  },
  { defaultInput: {} },
);

async function resolveHelpdeskAssignee(
  context: AuthContext,
  category: string,
  chosen: string | null,
): Promise<string | null> {
  if (chosen) return chosen;
  const { data: rule, error: ruleError } = await context.supabase
    .from("hr_helpdesk_rules")
    .select("assignee_staff_id")
    .eq("kind", "routing")
    .eq("category", category)
    .eq("active", true)
    .not("assignee_staff_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!ruleError && rule?.assignee_staff_id) return String(rule.assignee_staff_id);
  if (ruleError && !helpdeskStorageMissing(ruleError.message)) throw ruleError;

  const { data: settings, error: settingsError } = await context.supabase
    .from("hr_helpdesk_settings")
    .select("default_assignee_staff_id")
    .limit(1)
    .maybeSingle();
  if (settingsError) {
    if (helpdeskStorageMissing(settingsError.message)) return null;
    throw settingsError;
  }
  return settings?.default_assignee_staff_id ? String(settings.default_assignee_staff_id) : null;
}

export const logHelpdeskQuestion = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    question: z.string().trim().min(3).max(2000),
    title: z.string().trim().max(160).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    assigneeStaffId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const category = data.category?.trim() || "other";
    const assigneeStaffId = await resolveHelpdeskAssignee(context, category, data.assigneeStaffId ?? null);
    const saved = await appendEmployeeEvent(context, {
      staffId: data.staffId,
      eventType: "helpdesk_request",
      payload: {
        question: data.question,
        title: data.title?.trim() || data.question.slice(0, 120),
        status: "open",
        category,
        assigneeStaffId,
      },
      sourceTable: "hr_helpdesk",
    });
    if (saved.skipped || !saved.id) throw new Error("Employee timeline is not available.");
    return { id: saved.id };
  },
  { auth: { capability: "hr.manage" } },
);

export const listPrivacyRequests = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => listRequestEvents(context, "privacy_request"),
  { defaultInput: {}, auth: { capability: "hr.manage" } },
);

export const logPrivacyRequest = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    kind: z.enum(["access", "correction", "erasure"]),
    detail: z.string().trim().min(3).max(2000),
  }),
  async (data, context) => {
    const saved = await appendEmployeeEvent(context, {
      staffId: data.staffId,
      eventType: "privacy_request",
      payload: { kind: data.kind, detail: data.detail, status: "open" },
      sourceTable: "hr_privacy",
    });
    if (saved.skipped || !saved.id) throw new Error("Employee timeline is not available.");
    return { id: saved.id };
  },
  { auth: { capability: "hr.manage" } },
);

const EXPENSE_TYPES = ["extra", "other_add"] as const;
const EXPENSE_STATUSES = ["pending", "approved", "rejected", "posted"] as const;

export const listExpenseAdjustments = createAuthenticatedAction(
  z
    .object({
      status: z.enum([...EXPENSE_STATUSES, "all"]).optional().nullable(),
      adjType: z.enum([...EXPENSE_TYPES, "all"]).optional().nullable(),
      staffId: z.string().uuid().optional().nullable(),
      periodId: z.string().uuid().optional().nullable(),
      q: z.string().trim().max(120).optional().nullable(),
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    })
    .default({}),
  async (data, context) => {
    let q = context.supabase
      .from("hr_payroll_adjustments")
      .select(
        "id, period_id, staff_id, adj_type, amount_qar, reason, document_ref, status, created_at, staff(full_name, employee_code), hr_payroll_periods(month, status)",
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (data.adjType && data.adjType !== "all") {
      q = q.eq("adj_type", data.adjType);
    } else {
      q = q.in("adj_type", [...EXPENSE_TYPES]);
    }
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.staffId) q = q.eq("staff_id", data.staffId);
    if (data.periodId) q = q.eq("period_id", data.periodId);
    if (data.dateFrom) q = q.gte("created_at", `${data.dateFrom}T00:00:00.000Z`);
    if (data.dateTo) q = q.lte("created_at", `${data.dateTo}T23:59:59.999Z`);

    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }

    const needle = data.q?.trim().toLowerCase() ?? "";
    return (rows ?? [])
      .map((row) => {
        const record = row as Record<string, unknown>;
        return {
          id: String(record.id),
          periodId: String(record.period_id),
          staffId: String(record.staff_id),
          ...staffBits(record),
          ...periodBits(record),
          adjType: String(record.adj_type) as (typeof EXPENSE_TYPES)[number],
          amountQar: Number(record.amount_qar ?? 0),
          reason: (record.reason as string | null) ?? null,
          documentRef: (record.document_ref as string | null) ?? null,
          status: String(record.status ?? ""),
          createdAt: String(record.created_at),
        };
      })
      .filter((row) => {
        if (!needle) return true;
        const hay = [row.staffName, row.employeeCode, row.reason, row.documentRef, row.periodMonth]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
  },
  { defaultInput: {}, auth: { capability: "payroll.view" } },
);

/** File an extra-pay / other-addition expense for a payroll period (HR or finance). */
export const createExpenseAdjustment = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    staffId: z.string().uuid(),
    adjType: z.enum(EXPENSE_TYPES),
    amountQar: z.number().positive().max(1_000_000),
    reason: z.string().trim().min(2).max(2000),
    documentRef: z.string().trim().max(260).optional().nullable(),
  }),
  async (data, context) => {
    const canFile =
      canUserDo(context.roles ?? [], "payroll.generate") ||
      canUserDo(context.roles ?? [], "payroll.finance");
    if (!canFile) throw new ForbiddenError("Missing payroll.generate or payroll.finance.");

    const { data: period, error: periodError } = await context.supabase
      .from("hr_payroll_periods")
      .select("id, status")
      .eq("id", data.periodId)
      .maybeSingle();
    if (periodError && !tableMissing(periodError.message)) throw periodError;
    if (!period) throw new Error("Payroll period not found.");
    if (String(period.status) === "locked") {
      throw new Error("Locked period — reopen required before filing expenses.");
    }

    const { data: staff, error: staffError } = await context.supabase
      .from("staff")
      .select("id")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) throw new Error("Staff member not found.");

    const { data: row, error } = await context.supabase
      .from("hr_payroll_adjustments")
      .insert({
        period_id: data.periodId,
        staff_id: data.staffId,
        adj_type: data.adjType,
        amount_qar: Math.round(data.amountQar * 100) / 100,
        reason: data.reason,
        document_ref: data.documentRef?.trim() || null,
        status: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (tableMissing(error.message)) {
        throw new Error("Adjustments table missing — apply migration 20260924180000.");
      }
      throw error;
    }

    try {
      const { buildHrAuditRpcArgs } = await import("@/lib/hr-audit");
      await context.supabase.rpc(
        "log_audit",
        buildHrAuditRpcArgs({
          action: "hr.payroll.expense.create",
          tableName: "hr_payroll_adjustments",
          rowId: row.id,
          after: {
            adjType: data.adjType,
            amountQar: data.amountQar,
            periodId: data.periodId,
            staffId: data.staffId,
          },
        }) as never,
      );
    } catch {
      /* non-blocking */
    }

    return { id: row.id as string };
  },
  { auth: { anyCapability: ["payroll.generate", "payroll.finance"] } },
);
