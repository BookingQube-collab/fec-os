"use server";

import { z } from "zod";

import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";
import { summarizeLeaveBalances, sumUsedLeaveDays } from "@/lib/hr-advanced";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

import { answerHrAssistant, assistantNeeds, type HrAssistantFacts } from "./assistant-reply";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return next.toISOString().slice(0, 10);
}

function unreadable(error: { message?: string } | null): boolean {
  return Boolean(error?.message && /does not exist|schema cache|permission|jwt|row-level/i.test(error.message));
}

function staffName(value: unknown): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "";
  const name = (row as { full_name?: unknown }).full_name;
  return typeof name === "string" ? name.trim() : "";
}

function emptyFacts(input: {
  periodFrom: string;
  periodTo: string;
  today: string;
  filters: string;
  canPayroll: boolean;
}): HrAssistantFacts {
  return {
    ...input,
    staffLinked: null,
    headcount: null,
    presentToday: null,
    onLeaveToday: null,
    pendingLeave: null,
    expiredDocs: null,
    expiringDocs: null,
    payrollBlocked: null,
    payrollExceptions: null,
    openJobs: null,
    pendingJobRequests: null,
    absentNames: null,
    absentTotal: null,
    missingNames: null,
    missingTotal: null,
    presentNames: null,
    onLeaveNames: null,
    balances: null,
    balanceYear: null,
  };
}

async function countOf(
  query: PromiseLike<{ count: number | null; error: { message?: string } | null }>,
): Promise<number | null> {
  const { count, error } = await query;
  if (error) {
    if (unreadable(error)) return null;
    throw error;
  }
  return count ?? 0;
}

export const askHrAssistant = createAuthenticatedAction(
  z.object({
    question: z.string().trim().min(1).max(500),
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: ymd,
    dateTo: ymd,
  }),
  async (data, context): Promise<ReturnType<typeof answerHrAssistant>> => {
    if (!canUserDo(context.roles ?? [], "people.view_roster")) {
      throw new ForbiddenError("Missing capability: people.view_roster");
    }
    if (data.locationId) {
      const viewAll = canUserDo(context.roles ?? [], "attendance.view_all") || canUserDo(context.roles ?? [], "hr.manage");
      if (!viewAll) await assertLocationAccess(context, data.locationId);
    }

    const today = qatarToday();
    const needs = assistantNeeds(data.question);
    const facts = emptyFacts({
      periodFrom: data.dateFrom,
      periodTo: data.dateTo,
      today,
      filters: data.locationId ? data.locationId : "all sites",
      canPayroll: canUserDo(context.roles ?? [], "payroll.view"),
    });

    if (needs.attendance) await loadAttendance(context, facts, data.locationId ?? null, today);
    if (needs.leaveRemaining) await loadLeaveRemaining(context, facts, today);
    if (needs.leaveToday) await loadLeaveToday(context, facts, today);
    if (needs.documents) await loadDocuments(context, facts, today);
    if (needs.payroll && facts.canPayroll) {
      await loadPayrollCounts(context, facts, data.locationId ?? null, data.dateFrom, data.dateTo);
    }
    if (needs.hiring) await loadHiring(context, facts);

    return answerHrAssistant(data.question, facts);
  },
  { auth: { capability: "people.view_roster" } },
);

async function loadAttendance(context: AuthContext, facts: HrAssistantFacts, locationId: string | null, today: string) {
  const headcount = context.supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .in("status", ["active", "on_leave", "serving_notice"])
    .is("deleted_at", null);
  facts.headcount = await countOf(locationId ? headcount.eq("location_id", locationId) : headcount);

  const present = context.supabase
    .from("attendance_daily_summary")
    .select("id", { count: "exact", head: true })
    .eq("work_date", today)
    .in("status", ["present", "late", "overtime", "early_leave", "early_departure"]);
  facts.presentToday = await countOf(locationId ? present.eq("location_id", locationId) : present);

  const absent = context.supabase
    .from("attendance_daily_summary")
    .select("id", { count: "exact", head: true })
    .eq("work_date", today)
    .eq("status", "absent");
  facts.absentTotal = await countOf(locationId ? absent.eq("location_id", locationId) : absent);

  const missing = context.supabase
    .from("attendance_daily_summary")
    .select("id", { count: "exact", head: true })
    .eq("work_date", today)
    .eq("missed_punch", true);
  facts.missingTotal = await countOf(locationId ? missing.eq("location_id", locationId) : missing);

  facts.absentNames = await nameList(context, today, locationId, "absent");
  facts.missingNames = await nameList(context, today, locationId, "missing");
  facts.presentNames = await nameList(context, today, locationId, "present");
}

async function nameList(
  context: AuthContext,
  today: string,
  locationId: string | null,
  kind: "absent" | "missing" | "present",
): Promise<string[] | null> {
  let query = context.supabase.from("attendance_daily_summary").select("staff(full_name)").eq("work_date", today).limit(8);
  if (kind === "absent") query = query.eq("status", "absent");
  if (kind === "missing") query = query.eq("missed_punch", true);
  if (kind === "present") query = query.in("status", ["present", "late", "overtime", "early_leave", "early_departure"]);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) {
    if (unreadable(error)) return null;
    throw error;
  }
  return (data ?? []).map((row) => staffName((row as { staff?: unknown }).staff)).filter(Boolean);
}

async function loadLeaveRemaining(context: AuthContext, facts: HrAssistantFacts, today: string) {
  const { data: staff, error } = await context.supabase
    .from("staff")
    .select("id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (unreadable(error)) return;
    throw error;
  }
  if (!staff?.id) {
    facts.staffLinked = false;
    return;
  }
  facts.staffLinked = true;
  const year = Number(today.slice(0, 4));
  const { data: allotments, error: balErr } = await context.supabase
    .from("hr_leave_balances")
    .select("leave_type, allotted_days, carried_forward, expired_days, pending_days")
    .eq("staff_id", staff.id)
    .eq("period_year", year);
  if (balErr) {
    if (unreadable(balErr)) return;
    throw balErr;
  }
  const { data: leaveRows, error: leaveErr } = await context.supabase
    .from("hr_leave_requests")
    .select("leave_type, days, status, date_from")
    .eq("staff_id", staff.id)
    .eq("status", "approved");
  if (leaveErr) {
    if (unreadable(leaveErr)) return;
    throw leaveErr;
  }
  const used = sumUsedLeaveDays(
    (leaveRows ?? []).map((row) => ({
      leaveType: String(row.leave_type),
      days: Number(row.days ?? 0),
      status: String(row.status),
      dateFrom: String(row.date_from),
    })),
    year,
  );
  const summary = summarizeLeaveBalances(
    (allotments ?? []).map((row) => ({
      leaveType: String(row.leave_type),
      allottedDays: Number(row.allotted_days ?? 0),
      carriedForwardDays: Number(row.carried_forward ?? 0),
      expiredDays: Number(row.expired_days ?? 0),
      pendingDays: Number(row.pending_days ?? 0),
    })),
    used,
  );
  facts.balanceYear = year;
  facts.balances = summary.map((row) => ({
    leaveType: row.leaveType,
    available: row.availableDays ?? row.remainingDays,
  }));
}

async function loadLeaveToday(context: AuthContext, facts: HrAssistantFacts, today: string) {
  const count = context.supabase
    .from("hr_leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .lte("date_from", today)
    .gte("date_to", today);
  facts.onLeaveToday = await countOf(count);

  const pending = context.supabase.from("hr_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  facts.pendingLeave = await countOf(pending);

  const { data, error } = await context.supabase
    .from("hr_leave_requests")
    .select("staff(full_name)")
    .eq("status", "approved")
    .lte("date_from", today)
    .gte("date_to", today)
    .limit(8);
  if (error) {
    if (!unreadable(error)) throw error;
    return;
  }
  facts.onLeaveNames = (data ?? []).map((row) => staffName((row as { staff?: unknown }).staff)).filter(Boolean);
}

async function loadDocuments(context: AuthContext, facts: HrAssistantFacts, today: string) {
  const horizon = addDays(today, 30);
  facts.expiredDocs = await countOf(
    context.supabase
      .from("hr_employee_documents")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("expiry_date", "is", null)
      .lt("expiry_date", today),
  );
  facts.expiringDocs = await countOf(
    context.supabase
      .from("hr_employee_documents")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("expiry_date", "is", null)
      .gte("expiry_date", today)
      .lte("expiry_date", horizon),
  );
}

async function loadPayrollCounts(
  context: AuthContext,
  facts: HrAssistantFacts,
  locationId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  try {
    const payroll = await getPayrollAttendanceSummary({ locationId, dateFrom, dateTo });
    facts.payrollBlocked = payroll.blockedCount;
  } catch {
    facts.payrollBlocked = null;
    return;
  }
  const openPeriods = await countOf(
    context.supabase
      .from("hr_payroll_periods")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "hr_review", "finance_review", "gm_approved"]),
  );
  facts.payrollExceptions = openPeriods == null ? null : openPeriods + facts.payrollBlocked;
}

async function loadHiring(context: AuthContext, facts: HrAssistantFacts) {
  const roles = context.roles ?? [];
  const allowed =
    canUserDo(roles, "quota.view") || canUserDo(roles, "recruitment.manage") || canUserDo(roles, "recruitment.request");
  if (!allowed) return;
  const { data, error } = await context.supabase.from("hr_vacancies").select("vacancies_count").eq("status", "open");
  if (error) {
    if (!unreadable(error)) throw error;
    return;
  }
  facts.openJobs = (data ?? []).reduce((sum, row) => sum + Number(row.vacancies_count ?? 1), 0);
  facts.pendingJobRequests = await countOf(
    context.supabase.from("hr_job_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  );
}
