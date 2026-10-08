"use server";

import { z } from "zod";

import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { helpdeskStorageMissing, parseHelpdeskPayload } from "@/lib/hr-helpdesk.shared";
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

export const listExpenseAdjustments = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("hr_payroll_adjustments")
      .select(
        "id, adj_type, amount_qar, reason, document_ref, status, created_at, staff(full_name, employee_code)",
      )
      .in("adj_type", [...EXPENSE_TYPES])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: String(record.id),
        ...staffBits(record),
        adjType: String(record.adj_type),
        amountQar: Number(record.amount_qar ?? 0),
        reason: (record.reason as string | null) ?? null,
        documentRef: (record.document_ref as string | null) ?? null,
        status: String(record.status ?? ""),
        createdAt: String(record.created_at),
      };
    });
  },
  { defaultInput: {}, auth: { capability: "payroll.view" } },
);
