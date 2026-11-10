"use server";

import { z } from "zod";

import { HEAD_OFFICE_LOCATION_CODE } from "@/lib/department-audience";
import {
  DEFAULT_LEAVE_PLANNER_RULES,
  evaluateLeavePlannerRequest,
  pairMatrixCell,
  yearViewDayMark,
  type LeavePlannerDepartment,
  type LeavePlannerEvaluation,
  type LeavePlannerEvent,
  type LeavePlannerRules,
  type LeavePlannerStaffMember,
  type PairMatrixCell,
} from "@/lib/hr-leave-planner";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /relation|does not exist|column .* does not exist/i.test(message));
}

function mapRules(row: Record<string, unknown> | null | undefined): LeavePlannerRules {
  if (!row) return DEFAULT_LEAVE_PLANNER_RULES;
  return {
    activationRuleSet:
      row.activation_rule_set === "lighter" ? "lighter" : "as_stated",
    majorBeforeDays: Number(row.major_before_days ?? DEFAULT_LEAVE_PLANNER_RULES.majorBeforeDays),
    majorAfterDays: Number(row.major_after_days ?? DEFAULT_LEAVE_PLANNER_RULES.majorAfterDays),
    activationBeforeAsStated: Number(
      row.activation_before_as_stated ?? DEFAULT_LEAVE_PLANNER_RULES.activationBeforeAsStated,
    ),
    activationAfterAsStated: Number(
      row.activation_after_as_stated ?? DEFAULT_LEAVE_PLANNER_RULES.activationAfterAsStated,
    ),
    activationBeforeLighter: Number(
      row.activation_before_lighter ?? DEFAULT_LEAVE_PLANNER_RULES.activationBeforeLighter,
    ),
    activationAfterLighter: Number(
      row.activation_after_lighter ?? DEFAULT_LEAVE_PLANNER_RULES.activationAfterLighter,
    ),
    overallMaxAway: Number(row.overall_max_away ?? DEFAULT_LEAVE_PLANNER_RULES.overallMaxAway),
    maxAwayPerDepartment: Number(
      row.max_away_per_department ?? DEFAULT_LEAVE_PLANNER_RULES.maxAwayPerDepartment,
    ),
  };
}

function mapEvent(row: Record<string, unknown>): LeavePlannerEvent {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    eventType: row.event_type === "activation" ? "activation" : "major",
    startDate: String(row.start_date).slice(0, 10),
    endDate: String(row.end_date).slice(0, 10),
    active: row.active !== false,
  };
}

export async function resolveHeadOfficeLocationId(
  context: AuthContext,
): Promise<string | null> {
  const { data, error } = await context.supabase
    .from("locations")
    .select("id")
    .eq("code", HEAD_OFFICE_LOCATION_CODE)
    .maybeSingle();
  if (error && !tableMissing(error.message)) throw error;
  return (data?.id as string | undefined) ?? null;
}

export async function isHeadOfficeStaffLocation(
  context: AuthContext,
  locationId: string | null | undefined,
): Promise<boolean> {
  if (!locationId) return false;
  const { data, error } = await context.supabase
    .from("locations")
    .select("code")
    .eq("id", locationId)
    .maybeSingle();
  if (error && !tableMissing(error.message)) throw error;
  return String(data?.code ?? "").toUpperCase() === HEAD_OFFICE_LOCATION_CODE;
}

async function loadPlannerRules(context: AuthContext): Promise<LeavePlannerRules> {
  const { data, error } = await context.supabase
    .from("hr_leave_planner_rules")
    .select("*")
    .eq("scope", "ho")
    .maybeSingle();
  if (error && tableMissing(error.message)) return DEFAULT_LEAVE_PLANNER_RULES;
  if (error) throw error;
  return mapRules(data as Record<string, unknown> | null);
}

async function loadPlannerEvents(context: AuthContext): Promise<LeavePlannerEvent[]> {
  const { data, error } = await context.supabase
    .from("hr_leave_planner_events")
    .select("id, name, event_type, start_date, end_date, active")
    .eq("active", true)
    .order("start_date", { ascending: true });
  if (error && tableMissing(error.message)) return [];
  if (error) throw error;
  return (data ?? []).map((row) => mapEvent(row as Record<string, unknown>));
}

async function loadHoPlannerContext(context: AuthContext): Promise<{
  hoLocationId: string | null;
  rules: LeavePlannerRules;
  events: LeavePlannerEvent[];
  staffMembers: LeavePlannerStaffMember[];
  departments: LeavePlannerDepartment[];
  staffNames: Record<string, string>;
  awayLeaves: Array<{ id: string; staffId: string; dateFrom: string; dateTo: string }>;
}> {
  const hoLocationId = await resolveHeadOfficeLocationId(context);
  const rules = await loadPlannerRules(context);
  const events = await loadPlannerEvents(context);

  if (!hoLocationId) {
    return {
      hoLocationId: null,
      rules,
      events,
      staffMembers: [],
      departments: [],
      staffNames: {},
      awayLeaves: [],
    };
  }

  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("id, full_name")
    .eq("location_id", hoLocationId)
    .is("deleted_at", null)
    .neq("status", "terminated");
  if (staffErr) throw staffErr;

  const staffIds = (staffRows ?? []).map((r) => String(r.id));
  const staffNames: Record<string, string> = {};
  for (const row of staffRows ?? []) {
    staffNames[String(row.id)] = String(row.full_name ?? "").trim() || String(row.id);
  }

  const { data: deptLinks, error: linkErr } = staffIds.length
    ? await supabaseAdmin
        .from("staff_departments")
        .select("staff_id, department_id, master_departments(id, name, audience, active)")
        .in("staff_id", staffIds)
    : { data: [], error: null };
  if (linkErr) throw linkErr;

  const deptMeta = new Map<string, { name: string; headcount: number }>();
  const byStaff = new Map<string, string[]>();
  for (const link of deptLinks ?? []) {
    const staffId = String(link.staff_id);
    const rawDept = (link as { master_departments?: unknown }).master_departments;
    const dept = (Array.isArray(rawDept) ? rawDept[0] : rawDept) as
      | { id?: string; name?: string; audience?: string | null; active?: boolean | null }
      | null;
    if (!dept?.id) continue;
    if (dept.active === false) continue;
    // Prefer HO audience departments; still count if audience unset.
    if (dept.audience && dept.audience !== "ho") continue;
    const list = byStaff.get(staffId) ?? [];
    if (!list.includes(dept.id)) list.push(dept.id);
    byStaff.set(staffId, list);
    const prev = deptMeta.get(dept.id) ?? { name: String(dept.name ?? dept.id), headcount: 0 };
    prev.headcount += 1;
    deptMeta.set(dept.id, prev);
  }

  const staffMembers: LeavePlannerStaffMember[] = staffIds.map((id) => ({
    staffId: id,
    departmentIds: byStaff.get(id) ?? [],
  }));
  const departments: LeavePlannerDepartment[] = [...deptMeta.entries()].map(([id, meta]) => ({
    id,
    name: meta.name,
    headcount: meta.headcount,
  }));

  const { data: leaveRows, error: leaveErr } = staffIds.length
    ? await supabaseAdmin
        .from("hr_leave_requests")
        .select("id, staff_id, date_from, date_to, status")
        .in("staff_id", staffIds)
        .in("status", ["pending", "approved"])
    : { data: [], error: null };
  if (leaveErr && !tableMissing(leaveErr.message)) throw leaveErr;

  const awayLeaves = (leaveRows ?? []).map((row) => ({
    id: String(row.id),
    staffId: String(row.staff_id),
    dateFrom: String(row.date_from).slice(0, 10),
    dateTo: String(row.date_to).slice(0, 10),
  }));

  return { hoLocationId, rules, events, staffMembers, departments, staffNames, awayLeaves };
}

/**
 * Evaluate HO planner for a staff leave request.
 * Returns null when staff is not Head Office (planner does not apply).
 */
export async function evaluateHoLeavePlannerForStaff(
  context: AuthContext,
  input: {
    staffId: string;
    locationId: string | null | undefined;
    dateFrom: string;
    dateTo: string;
    leaveType: string;
    excludeLeaveId?: string | null;
  },
): Promise<LeavePlannerEvaluation | null> {
  const isHo = await isHeadOfficeStaffLocation(context, input.locationId);
  if (!isHo) return null;

  const ctx = await loadHoPlannerContext(context);
  return evaluateLeavePlannerRequest({
    staffId: input.staffId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    isEmergency: input.leaveType === "emergency",
    rules: ctx.rules,
    events: ctx.events,
    awayLeaves: ctx.awayLeaves,
    staffMembers: ctx.staffMembers,
    departments: ctx.departments,
    excludeLeaveId: input.excludeLeaveId,
  });
}

export const getLeavePlannerRules = createAuthenticatedActionNoInput(
  async (context) => {
    const rules = await loadPlannerRules(context);
    const { data } = await context.supabase
      .from("hr_leave_planner_rules")
      .select("id, updated_at")
      .eq("scope", "ho")
      .maybeSingle();
    return { id: (data?.id as string | undefined) ?? null, rules, updatedAt: data?.updated_at ?? null };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app", "hr.manage"] } },
);

export const updateLeavePlannerRules = createAuthenticatedAction(
  z.object({
    activationRuleSet: z.enum(["as_stated", "lighter"]),
    majorBeforeDays: z.number().int().min(0).max(120),
    majorAfterDays: z.number().int().min(0).max(60),
    activationBeforeAsStated: z.number().int().min(0).max(120),
    activationAfterAsStated: z.number().int().min(0).max(60),
    activationBeforeLighter: z.number().int().min(0).max(120),
    activationAfterLighter: z.number().int().min(0).max(60),
    overallMaxAway: z.number().int().min(1).max(500),
    maxAwayPerDepartment: z.number().int().min(1).max(50),
  }),
  async (data, context) => {
    const { error } = await context.supabase.from("hr_leave_planner_rules").upsert(
      {
        scope: "ho",
        activation_rule_set: data.activationRuleSet,
        major_before_days: data.majorBeforeDays,
        major_after_days: data.majorAfterDays,
        activation_before_as_stated: data.activationBeforeAsStated,
        activation_after_as_stated: data.activationAfterAsStated,
        activation_before_lighter: data.activationBeforeLighter,
        activation_after_lighter: data.activationAfterLighter,
        overall_max_away: data.overallMaxAway,
        max_away_per_department: data.maxAwayPerDepartment,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scope" },
    );
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } },
);

export const listLeavePlannerEvents = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("hr_leave_planner_events")
      .select("id, name, event_type, start_date, end_date, basis, linked_event_id, active, updated_at")
      .order("start_date", { ascending: true });
    if (error && tableMissing(error.message)) return [];
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      eventType: (row.event_type === "activation" ? "activation" : "major") as "major" | "activation",
      startDate: String(row.start_date).slice(0, 10),
      endDate: String(row.end_date).slice(0, 10),
      basis: (row.basis as string | null) ?? null,
      linkedEventId: (row.linked_event_id as string | null) ?? null,
      active: row.active !== false,
      updatedAt: (row.updated_at as string | null) ?? null,
    }));
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app", "hr.manage"] } },
);

export const upsertLeavePlannerEvent = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().min(1).max(200),
    eventType: z.enum(["major", "activation"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    basis: z.string().max(500).optional().nullable(),
    linkedEventId: z.string().uuid().optional().nullable(),
    active: z.boolean().optional(),
  }),
  async (data, context) => {
    if (data.endDate < data.startDate) throw new Error("Event end date must be on or after start date.");
    const payload = {
      name: data.name.trim(),
      event_type: data.eventType,
      start_date: data.startDate,
      end_date: data.endDate,
      basis: data.basis?.trim() || null,
      linked_event_id: data.linkedEventId ?? null,
      active: data.active ?? true,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("hr_leave_planner_events")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("hr_leave_planner_events")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } },
);

export const deleteLeavePlannerEvent = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("hr_leave_planner_events").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } },
);

export const previewLeavePlanner = createAuthenticatedAction(
  z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    leaveType: z.string().min(1).max(40).default("annual"),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    const manage =
      canUserDo(context.roles ?? [], "hr.leave.manage") || canUserDo(context.roles ?? [], "hr.manage");
    const linked = await loadLinkedStaffRecord(context.userId);
    const staffId = manage && data.staffId ? data.staffId : linked?.id;
    if (!staffId) throw new ForbiddenError("No staff record linked.");
    if (!manage && staffId !== linked?.id) {
      throw new ForbiddenError("You can only preview your own leave planner result.");
    }

    const { data: staff, error } = await supabaseAdmin
      .from("staff")
      .select("id, location_id, full_name")
      .eq("id", staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!staff) throw new Error("Staff not found.");

    const evaluation = await evaluateHoLeavePlannerForStaff(context, {
      staffId: String(staff.id),
      locationId: staff.location_id as string | null,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      leaveType: data.leaveType,
    });

    return {
      applies: evaluation != null,
      staffId: String(staff.id),
      staffName: String(staff.full_name ?? ""),
      evaluation,
    };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app", "hr.manage"] } },
);

export const getLeavePlannerBoard = createAuthenticatedActionNoInput(
  async (context) => {
    const ctx = await loadHoPlannerContext(context);
    const people = ctx.staffMembers.map((m) => ({
      staffId: m.staffId,
      name: ctx.staffNames[m.staffId] ?? m.staffId,
      departmentIds: m.departmentIds,
      departmentNames: m.departmentIds
        .map((id) => ctx.departments.find((d) => d.id === id)?.name)
        .filter(Boolean) as string[],
    }));

    const matrixPeople = [...people].sort((a, b) => a.name.localeCompare(b.name));
    const matrix: Array<{ rowStaffId: string; cells: Array<{ colStaffId: string; mark: PairMatrixCell }> }> =
      matrixPeople.map((row, ri) => ({
        rowStaffId: row.staffId,
        cells: matrixPeople.map((col, ci) => ({
          colStaffId: col.staffId,
          mark:
            ri === ci
              ? ("-" as const)
              : pairMatrixCell(
                  row.departmentIds,
                  col.departmentIds,
                  ctx.departments,
                  ctx.rules.maxAwayPerDepartment,
                ),
        })),
      }));

    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    // 14 months from current month (Excel shows Nov 2026–Dec 2027 style window).
    const months: Array<{ month: string; days: Array<{ day: number; mark: "E" | "X" | "." }> }> = [];
    for (let m = 0; m < 14; m += 1) {
      const monthDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
      const y = monthDate.getUTCFullYear();
      const mo = monthDate.getUTCMonth();
      const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      const days: Array<{ day: number; mark: "E" | "X" | "." }> = [];
      for (let d = 1; d <= daysInMonth; d += 1) {
        const ymd = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        days.push({ day: d, mark: yearViewDayMark(ymd, ctx.events, ctx.rules) });
      }
      months.push({
        month: `${y}-${String(mo + 1).padStart(2, "0")}-01`,
        days,
      });
    }

    return {
      hoLocationId: ctx.hoLocationId,
      rules: ctx.rules,
      events: ctx.events,
      departments: ctx.departments,
      people,
      awayLeaves: ctx.awayLeaves.map((row) => ({
        ...row,
        staffName: ctx.staffNames[row.staffId] ?? row.staffId,
      })),
      pairMatrix: {
        people: matrixPeople.map((p) => ({ staffId: p.staffId, name: p.name })),
        rows: matrix,
      },
      yearView: months,
    };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } },
);
