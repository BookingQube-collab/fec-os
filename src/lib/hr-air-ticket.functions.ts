/**
 * Air-ticket server actions (Phase 7).
 */

"use server";

import { z } from "zod";

import {
  airTicketPolicyFromSection,
  assertCanMarkAirTicketPaid,
  computeEntitlementDatesFromPolicy,
  HR_AIR_TICKET_ENTITLEMENT_STATUSES,
  isAirTicketOverdue,
  isAirTicketUpcoming,
  type HrAirTicketEntitlementStatus,
  type HrAirTicketIssueStatus,
  type HrAirTicketPayrollStatus,
} from "@/lib/hr-air-ticket";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { readPolicySection } from "@/lib/hr-policy-read";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import type { Json } from "@/integrations/supabase/types";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, hire_date, user_id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function canManage(roles: AuthContext["roles"]): boolean {
  return canUserDo(roles ?? [], "hr.air_ticket.manage") || canUserDo(roles ?? [], "hr.manage");
}

function canViewMoney(roles: AuthContext["roles"], isSelf: boolean): boolean {
  if (isSelf) return true;
  return (
    canUserDo(roles ?? [], "people.view_salary") ||
    canUserDo(roles ?? [], "payroll.view")
  );
}

async function auditAir(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
) {
  try {
    await context.supabase.rpc("log_audit", {
      _action: action,
      _table_name: "hr_air_ticket_issues",
      _row_id: rowId,
      _after: after as unknown as Json,
      _metadata: {},
    });
  } catch {
    /* non-blocking */
  }
}

async function appendIssueAction(
  context: AuthContext,
  issueId: string,
  action: string,
  note?: string | null,
) {
  const { error } = await context.supabase.from("hr_air_ticket_issue_actions").insert({
    issue_id: issueId,
    action,
    actor_id: context.userId,
    note: note ?? null,
  });
  if (error && !tableMissing(error.message)) throw error;
}

async function loadAirPolicy(context: AuthContext) {
  const section = await readPolicySection(context, "air_ticket");
  return airTicketPolicyFromSection(section);
}

type EntitlementRow = Record<string, unknown> & {
  id: string;
  staff_id: string;
  issues?: Record<string, unknown>[] | null;
  staff?:
    | { full_name?: string; employee_code?: string; hire_date?: string | null; user_id?: string }
    | { full_name?: string; employee_code?: string; hire_date?: string | null; user_id?: string }[]
    | null;
};

function mapIssue(
  row: Record<string, unknown>,
  opts: { includeMoney: boolean },
) {
  const money = opts.includeMoney
    ? {
        priceQar: Number(row.price_qar ?? 0),
        cashAllowanceQar: Number(row.cash_allowance_qar ?? 0),
      }
    : { priceQar: null as number | null, cashAllowanceQar: null as number | null };
  return {
    id: String(row.id),
    entitlementId: String(row.entitlement_id),
    ...money,
    bookingRef: (row.booking_ref as string | null) ?? null,
    travelDateFrom: row.travel_date_from ? String(row.travel_date_from).slice(0, 10) : null,
    travelDateTo: row.travel_date_to ? String(row.travel_date_to).slice(0, 10) : null,
    invoiceDocId: (row.invoice_doc_id as string | null) ?? null,
    payrollPaymentStatus: String(row.payroll_payment_status) as HrAirTicketPayrollStatus,
    status: String(row.status) as HrAirTicketIssueStatus,
    issuedOn: row.issued_on ? String(row.issued_on).slice(0, 10) : null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapEntitlement(
  row: EntitlementRow,
  opts: { includeMoney: boolean; asOf: string; horizonDays: number },
) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  const status = String(row.status) as HrAirTicketEntitlementStatus;
  const eligibilityOn = String(row.eligibility_on).slice(0, 10);
  const expiryOn = row.expiry_on ? String(row.expiry_on).slice(0, 10) : null;
  const issuesRaw = Array.isArray(row.issues) ? row.issues : [];
  const issues = issuesRaw.map((i) => mapIssue(i, { includeMoney: opts.includeMoney }));
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: staff?.full_name ?? null,
    employeeCode: staff?.employee_code ?? null,
    hireDate: staff?.hire_date ? String(staff.hire_date).slice(0, 10) : null,
    cycleStart: String(row.cycle_start).slice(0, 10),
    cycleEnd: String(row.cycle_end).slice(0, 10),
    eligibilityOn,
    destination: (row.destination as string | null) ?? null,
    familyEligible: Boolean(row.family_eligible),
    status,
    carryForward: Boolean(row.carry_forward),
    expiryOn,
    notes: (row.notes as string | null) ?? null,
    overdue: isAirTicketOverdue({ eligibilityOn, asOfDate: opts.asOf, status, expiryOn }),
    upcoming: isAirTicketUpcoming({
      eligibilityOn,
      asOfDate: opts.asOf,
      horizonDays: opts.horizonDays,
      status,
    }),
    issues,
    createdAt: String(row.created_at),
  };
}

const ENTITLEMENT_SELECT =
  "id, staff_id, cycle_start, cycle_end, eligibility_on, destination, family_eligible, status, carry_forward, expiry_on, notes, created_at, staff(full_name, employee_code, hire_date, user_id), issues:hr_air_ticket_issues(id, entitlement_id, price_qar, cash_allowance_qar, booking_ref, travel_date_from, travel_date_to, invoice_doc_id, payroll_payment_status, status, issued_on, notes, created_at)";

export const listAirTicketEntitlements = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_AIR_TICKET_ENTITLEMENT_STATUSES, "all", "upcoming", "overdue"]).optional().nullable(),
    mineOnly: z.boolean().optional(),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    const manage = canManage(context.roles);
    const employeeApp = canUserDo(context.roles ?? [], "hr.employee_app");
    if (!manage && !employeeApp) throw new ForbiddenError("Missing air-ticket permission.");

    const mine = await myStaff(context);
    const policy = await loadAirPolicy(context);
    const asOf = qatarToday();

    let query = context.supabase
      .from("hr_air_ticket_entitlements")
      .select(ENTITLEMENT_SELECT)
      .order("eligibility_on", { ascending: true })
      .limit(300);

    if (data.mineOnly || !manage) {
      if (!mine?.id) return [];
      query = query.eq("staff_id", mine.id);
    } else if (data.staffId) {
      query = query.eq("staff_id", data.staffId);
    }

    if (data.status && data.status !== "all" && data.status !== "upcoming" && data.status !== "overdue") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }

    const mapped = (rows ?? []).map((row) => {
      const isSelf = Boolean(mine?.id && String(row.staff_id) === mine.id);
      return mapEntitlement(row as EntitlementRow, {
        includeMoney: canViewMoney(context.roles, isSelf),
        asOf,
        horizonDays: policy.upcomingHorizonDays,
      });
    });

    if (data.status === "upcoming") return mapped.filter((r) => r.upcoming);
    if (data.status === "overdue") return mapped.filter((r) => r.overdue);
    return mapped;
  },
  { auth: { anyCapability: ["hr.air_ticket.manage", "hr.manage", "hr.employee_app"] } },
);

export const createAirTicketEntitlement = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    destination: z.string().trim().max(200).optional().nullable(),
    familyEligible: z.boolean().optional().nullable(),
    cycleIndex: z.number().int().min(1).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    carryForward: z.boolean().optional().nullable(),
  }),
  async (data, context) => {
    if (!canManage(context.roles)) throw new ForbiddenError("Missing hr.air_ticket.manage.");

    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, hire_date, full_name, employee_code")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Staff not found.");
    if (!staff.hire_date) throw new Error("Staff hire_date is required for air-ticket eligibility.");

    const policy = await loadAirPolicy(context);
    const asOf = qatarToday();
    const computed = computeEntitlementDatesFromPolicy({
      hireDate: String(staff.hire_date).slice(0, 10),
      asOfDate: asOf,
      policy,
      cycleIndex: data.cycleIndex ?? undefined,
    });
    if (!computed) throw new Error("Could not compute entitlement from hire_date + policy.");

    const carryForward =
      data.carryForward ?? policy.carryForwardEnabled;
    const familyEligible = data.familyEligible ?? policy.familyEligibleDefault;

    const { data: inserted, error } = await context.supabase
      .from("hr_air_ticket_entitlements")
      .insert({
        staff_id: data.staffId,
        cycle_start: computed.cycleStart,
        cycle_end: computed.cycleEnd,
        eligibility_on: computed.eligibilityOn,
        destination: data.destination?.trim() || null,
        family_eligible: familyEligible,
        status: computed.status,
        carry_forward: carryForward,
        expiry_on: computed.expiryOn,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select(ENTITLEMENT_SELECT)
      .single();
    if (error) throw error;

    await appendEmployeeEvent(context, {
      staffId: data.staffId,
      eventType: "air_ticket_entitlement_created",
      effectiveOn: computed.eligibilityOn,
      payload: {
        entitlementId: inserted.id,
        cycleStart: computed.cycleStart,
        cycleEnd: computed.cycleEnd,
        eligibilityOn: computed.eligibilityOn,
        familyEligible,
      },
      sourceTable: "hr_air_ticket_entitlements",
      sourceId: String(inserted.id),
    });
    await auditAir(context, "hr.air_ticket.entitlement_create", String(inserted.id), {
      staffId: data.staffId,
      eligibilityOn: computed.eligibilityOn,
      familyEligible,
    });

    return mapEntitlement(inserted as EntitlementRow, {
      includeMoney: canViewMoney(context.roles, false),
      asOf,
      horizonDays: policy.upcomingHorizonDays,
    });
  },
  { auth: { capability: "hr.air_ticket.manage" } },
);

export const issueAirTicket = createAuthenticatedAction(
  z.object({
    entitlementId: z.string().uuid(),
    priceQar: z.number().min(0).optional().nullable(),
    cashAllowanceQar: z.number().min(0).optional().nullable(),
    bookingRef: z.string().trim().max(120).optional().nullable(),
    travelDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    travelDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    invoiceDocId: z.string().uuid().optional().nullable(),
    issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    if (!canManage(context.roles)) throw new ForbiddenError("Missing hr.air_ticket.manage.");
    if (!canViewMoney(context.roles, false)) {
      throw new ForbiddenError("Recording ticket price/allowance requires salary access.");
    }

    const { data: ent, error: entErr } = await context.supabase
      .from("hr_air_ticket_entitlements")
      .select("id, staff_id, status")
      .eq("id", data.entitlementId)
      .maybeSingle();
    if (entErr) throw entErr;
    if (!ent) throw new Error("Entitlement not found.");
    if (["cancelled", "expired"].includes(String(ent.status))) {
      throw new Error(`Cannot issue ticket for entitlement status ${ent.status}.`);
    }

    const asOf = qatarToday();
    const { data: issue, error } = await context.supabase
      .from("hr_air_ticket_issues")
      .insert({
        entitlement_id: data.entitlementId,
        price_qar: data.priceQar ?? 0,
        cash_allowance_qar: data.cashAllowanceQar ?? 0,
        booking_ref: data.bookingRef?.trim() || null,
        travel_date_from: data.travelDateFrom ?? null,
        travel_date_to: data.travelDateTo ?? null,
        invoice_doc_id: data.invoiceDocId ?? null,
        payroll_payment_status: "unpaid",
        status: "issued",
        issued_on: data.issuedOn ?? asOf,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    const { error: updErr } = await context.supabase
      .from("hr_air_ticket_entitlements")
      .update({ status: "issued" })
      .eq("id", data.entitlementId);
    if (updErr) throw updErr;

    await appendIssueAction(context, String(issue.id), "created");
    await appendIssueAction(context, String(issue.id), "issued", data.notes);
    await appendEmployeeEvent(context, {
      staffId: String(ent.staff_id),
      eventType: "air_ticket_issued",
      effectiveOn: data.issuedOn ?? asOf,
      payload: {
        entitlementId: data.entitlementId,
        issueId: issue.id,
        bookingRef: data.bookingRef ?? null,
        priceQar: data.priceQar ?? 0,
        cashAllowanceQar: data.cashAllowanceQar ?? 0,
      },
      documentId: data.invoiceDocId ?? null,
      sourceTable: "hr_air_ticket_issues",
      sourceId: String(issue.id),
    });
    await auditAir(context, "hr.air_ticket.issue", String(issue.id), {
      entitlementId: data.entitlementId,
      bookingRef: data.bookingRef ?? null,
    });

    return mapIssue(issue as Record<string, unknown>, { includeMoney: true });
  },
  { auth: { capability: "hr.air_ticket.manage" } },
);

export const markAirTicketPaid = createAuthenticatedAction(
  z.object({
    issueId: z.string().uuid(),
    note: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    if (!canManage(context.roles)) throw new ForbiddenError("Missing hr.air_ticket.manage.");
    if (!canViewMoney(context.roles, false)) {
      throw new ForbiddenError("Marking air-ticket paid requires salary/payroll access.");
    }

    const { data: issue, error } = await context.supabase
      .from("hr_air_ticket_issues")
      .select("id, entitlement_id, status, payroll_payment_status")
      .eq("id", data.issueId)
      .maybeSingle();
    if (error) throw error;
    if (!issue) throw new Error("Issue not found.");
    assertCanMarkAirTicketPaid(String(issue.status) as HrAirTicketIssueStatus);
    if (String(issue.payroll_payment_status) === "paid") {
      throw new Error("Air ticket payroll status is already paid.");
    }

    const { data: updated, error: updErr } = await context.supabase
      .from("hr_air_ticket_issues")
      .update({
        status: "paid",
        payroll_payment_status: "paid",
        paid_by: context.userId,
        paid_at: new Date().toISOString(),
      })
      .eq("id", data.issueId)
      .select("*")
      .single();
    if (updErr) throw updErr;

    const { data: ent } = await context.supabase
      .from("hr_air_ticket_entitlements")
      .select("staff_id")
      .eq("id", issue.entitlement_id)
      .maybeSingle();

    await appendIssueAction(context, data.issueId, "paid", data.note);
    if (ent?.staff_id) {
      await appendEmployeeEvent(context, {
        staffId: String(ent.staff_id),
        eventType: "air_ticket_paid",
        effectiveOn: qatarToday(),
        payload: { issueId: data.issueId, entitlementId: issue.entitlement_id },
        sourceTable: "hr_air_ticket_issues",
        sourceId: data.issueId,
      });
    }
    await auditAir(context, "hr.air_ticket.paid", data.issueId, { payrollPaymentStatus: "paid" });

    return mapIssue(updated as Record<string, unknown>, { includeMoney: true });
  },
  { auth: { capability: "hr.air_ticket.manage" } },
);

export const previewAirTicketEligibility = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    cycleIndex: z.number().int().min(1).optional().nullable(),
  }),
  async (data, context) => {
    if (!canManage(context.roles)) throw new ForbiddenError("Missing hr.air_ticket.manage.");
    const { data: staff, error } = await context.supabase
      .from("staff")
      .select("id, hire_date")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!staff) throw new Error("Staff not found.");
    const policy = await loadAirPolicy(context);
    return computeEntitlementDatesFromPolicy({
      hireDate: staff.hire_date ? String(staff.hire_date).slice(0, 10) : null,
      asOfDate: qatarToday(),
      policy,
      cycleIndex: data.cycleIndex ?? undefined,
    });
  },
  { auth: { capability: "hr.air_ticket.manage" } },
);
