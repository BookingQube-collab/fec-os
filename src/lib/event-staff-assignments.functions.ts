"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  defaultPayOnEventRun,
  EVENT_CREW_READINESS_CODE,
  EVENT_STAFF_ASSIGNMENT_TYPES,
  eventCrewReadinessMet,
  eventHireEmploymentDefaults,
  findOverlappingAssignment,
  normalizeAssignmentType,
  type EventStaffAssignmentType,
  validateAssignmentDates,
} from "@/lib/events/staff-assignments";
import type { EventStaffingImportRow } from "@/lib/events/staffing-import";
import type { EventStaffAssignmentRow, EventStaffAssignmentsPayload } from "@/lib/events/types";
import { resolveNewEmployeeCode } from "@/lib/staff-employee-code";
import { assertLocationAccess, requireCapability } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";

const EventIdSchema = z.object({ eventId: z.string().uuid() });
const IdSchema = z.object({ id: z.string().uuid() });

async function writeEventAudit(
  context: AuthContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    eventId?: string | null;
    locationId?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  await context.supabase.from("event_audit_logs").insert({
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    event_id: entry.eventId ?? null,
    location_id: entry.locationId ?? null,
    before: (entry.before ?? null) as Json,
    after: (entry.after ?? null) as Json,
    metadata: (entry.metadata ?? {}) as Json,
  });
}

async function loadEventOrThrow(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("events")
    .select("id, location_id, name, event_name, event_start, event_end, venue_access, setup_start, dismantle_end")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Event not found");
  await assertLocationAccess(context, data.location_id as string);
  return data;
}

function emptyText(v?: string | null) {
  return v && v.trim() ? v.trim() : null;
}

function eventWindowDefaults(event: {
  event_start?: string | null;
  event_end?: string | null;
  venue_access?: string | null;
  setup_start?: string | null;
  dismantle_end?: string | null;
}): { dateFrom: string | null; dateTo: string | null } {
  const dateFrom =
    (event.venue_access as string | null) ??
    (event.setup_start as string | null) ??
    (event.event_start as string | null) ??
    null;
  const dateTo =
    (event.dismantle_end as string | null) ?? (event.event_end as string | null) ?? dateFrom;
  return { dateFrom, dateTo };
}

async function listAssignmentRows(
  context: AuthContext,
  eventId: string,
): Promise<EventStaffAssignmentRow[]> {
  type AssignmentSelectRow = {
    id: string;
    event_id: string;
    staff_id: string;
    assignment_type: string;
    role_label: string;
    event_role_id?: string | null;
    hours_per_day?: number | null;
    day_rate_qar?: number | null;
    date_from: string;
    date_to: string;
    pay_on_event_run: boolean;
    notes: string | null;
    status?: string | null;
    closed_at?: string | null;
    created_at: string;
    updated_at: string;
  };
  let rows: AssignmentSelectRow[] | null = null;
  let error: { message: string } | null = null;
  {
    const res = await context.supabase
      .from("event_staff_assignments")
      .select(
        "id, event_id, staff_id, assignment_type, role_label, event_role_id, hours_per_day, day_rate_qar, date_from, date_to, pay_on_event_run, notes, status, closed_at, created_at, updated_at",
      )
      .eq("event_id", eventId)
      .order("date_from", { ascending: true })
      .order("created_at", { ascending: true });
    error = res.error;
    rows = (res.data as AssignmentSelectRow[] | null) ?? null;
  }
  if (error && /event_role_id|hours_per_day|day_rate_qar|schema cache/i.test(error.message)) {
    const legacy = await context.supabase
      .from("event_staff_assignments")
      .select(
        "id, event_id, staff_id, assignment_type, role_label, date_from, date_to, pay_on_event_run, notes, status, closed_at, created_at, updated_at",
      )
      .eq("event_id", eventId)
      .order("date_from", { ascending: true })
      .order("created_at", { ascending: true });
    error = legacy.error;
    rows = (legacy.data as AssignmentSelectRow[] | null) ?? null;
  }
  if (error && /status|closed_at|schema cache/i.test(error.message)) {
    const fallback = await context.supabase
      .from("event_staff_assignments")
      .select(
        "id, event_id, staff_id, assignment_type, role_label, date_from, date_to, pay_on_event_run, notes, created_at, updated_at",
      )
      .eq("event_id", eventId)
      .order("date_from", { ascending: true })
      .order("created_at", { ascending: true });
    rows = (fallback.data as AssignmentSelectRow[] | null) ?? null;
    error = fallback.error;
  }
  if (error) {
    if (/event_staff_assignments|schema cache/i.test(error.message)) return [];
    throw error;
  }

  const staffIds = [...new Set((rows ?? []).map((r) => r.staff_id as string))];
  const { data: staff } = staffIds.length
    ? await context.supabase
        .from("staff")
        .select("id, full_name, employee_code, employment_type, status, job_title, location_id")
        .in("id", staffIds)
    : { data: [] as Array<{
        id: string;
        full_name: string;
        employee_code: string | null;
        employment_type: string | null;
        status: string;
        job_title: string | null;
        location_id: string;
      }> };

  const staffMap = new Map(
    (staff ?? []).map((s) => [
      s.id as string,
      {
        name: s.full_name as string,
        employee_code: (s.employee_code as string | null) ?? null,
        employment_type: (s.employment_type as string | null) ?? null,
        status: (s.status as string) ?? null,
        job_title: (s.job_title as string | null) ?? null,
        location_id: s.location_id as string,
      },
    ]),
  );

  return (rows ?? []).map((r) => {
    const s = staffMap.get(r.staff_id as string);
    const statusRaw = String((r as { status?: string }).status ?? "active").toLowerCase();
    const assignmentType =
      normalizeAssignmentType(r.assignment_type) ??
      (r.assignment_type as EventStaffAssignmentType);
    return {
      id: r.id as string,
      event_id: r.event_id as string,
      staff_id: r.staff_id as string,
      staff_name: s?.name ?? null,
      staff_employee_code: s?.employee_code ?? null,
      staff_employment_type: s?.employment_type ?? null,
      staff_status: s?.status ?? null,
      staff_job_title: s?.job_title ?? null,
      staff_location_id: s?.location_id ?? null,
      assignment_type: assignmentType,
      role_label: (r.role_label as string) || "crew",
      event_role_id: (r.event_role_id as string | null | undefined) ?? null,
      hours_per_day:
        r.hours_per_day == null || r.hours_per_day === undefined
          ? null
          : Number(r.hours_per_day),
      day_rate_qar:
        r.day_rate_qar == null || r.day_rate_qar === undefined ? null : Number(r.day_rate_qar),
      date_from: r.date_from as string,
      date_to: r.date_to as string,
      pay_on_event_run: Boolean(r.pay_on_event_run),
      notes: (r.notes as string | null) ?? null,
      status: statusRaw === "closed" ? ("closed" as const) : ("active" as const),
      closed_at: ((r as { closed_at?: string | null }).closed_at as string | null) ?? null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    };
  });
}

async function syncEventCrewReadiness(
  context: AuthContext,
  eventId: string,
  met: boolean,
) {
  const { data: item } = await context.supabase
    .from("event_readiness_items")
    .select("id, is_complete")
    .eq("event_id", eventId)
    .eq("code", EVENT_CREW_READINESS_CODE)
    .maybeSingle();

  if (!item) {
    await context.supabase.from("event_readiness_items").insert({
      event_id: eventId,
      code: EVENT_CREW_READINESS_CODE,
      title: "Event crew assigned",
      category: "manpower",
      is_required: true,
      is_complete: met,
      completed_at: met ? new Date().toISOString() : null,
      weight: 8,
      phase_code: "staffing",
    });
    return;
  }

  if (Boolean(item.is_complete) === met) return;
  await context.supabase
    .from("event_readiness_items")
    .update({
      is_complete: met,
      completed_at: met ? new Date().toISOString() : null,
    })
    .eq("id", item.id);
}

export const getEventStaffAssignments = createAuthenticatedAction(
  EventIdSchema,
  async (data, context): Promise<EventStaffAssignmentsPayload> => {
    const event = await loadEventOrThrow(context, data.eventId);
    const assignments = await listAssignmentRows(context, data.eventId);
    const window = eventWindowDefaults(event);
    return {
      assignments,
      eventWindow: window,
      crewReadinessMet: eventCrewReadinessMet(assignments),
      counts: {
        total: assignments.length,
        joker: assignments.filter((a) => a.assignment_type === "joker").length,
        loaned: assignments.filter((a) => a.assignment_type === "loaned").length,
        event_hire: assignments.filter((a) => a.assignment_type === "event_hire").length,
      },
    };
  },
  { auth: { capability: "events.view" } },
);

const AssignmentTypeSchema = z.preprocess(
  (v) => normalizeAssignmentType(v) ?? v,
  z.enum(EVENT_STAFF_ASSIGNMENT_TYPES),
);

const UpsertAssignmentSchema = z.object({
  id: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  staff_id: z.string().uuid(),
  assignment_type: AssignmentTypeSchema,
  role_label: z.string().min(1).max(120).default("crew"),
  event_role_id: z.string().uuid().optional().nullable(),
  hours_per_day: z.number().min(1).max(24).optional().nullable(),
  day_rate_qar: z.number().min(0).optional().nullable(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pay_on_event_run: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const upsertEventStaffAssignment = createAuthenticatedAction(
  UpsertAssignmentSchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const dateErr = validateAssignmentDates(data.date_from, data.date_to);
    if (dateErr) throw new Error(dateErr);

    const existing = await listAssignmentRows(context, data.eventId);
    const overlap = findOverlappingAssignment(
      existing,
      {
        id: data.id,
        staff_id: data.staff_id,
        assignment_type: data.assignment_type,
        date_from: data.date_from,
        date_to: data.date_to,
      },
      data.id ?? null,
    );
    if (overlap) {
      throw new Error(
        `Overlapping assignment for this staff (${overlap.date_from}–${overlap.date_to}). Adjust dates or remove the existing row.`,
      );
    }

    const payOn =
      data.pay_on_event_run ?? defaultPayOnEventRun(data.assignment_type);
    const payload = {
      event_id: data.eventId,
      staff_id: data.staff_id,
      assignment_type: data.assignment_type,
      role_label: data.role_label.trim() || "crew",
      event_role_id: data.event_role_id ?? null,
      hours_per_day: data.hours_per_day ?? null,
      day_rate_qar: data.day_rate_qar ?? null,
      date_from: data.date_from,
      date_to: data.date_to,
      pay_on_event_run: payOn,
      notes: emptyText(data.notes),
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    let assignmentId = data.id ?? null;
    if (data.id) {
      const { error } = await context.supabase
        .from("event_staff_assignments")
        .update(payload)
        .eq("id", data.id)
        .eq("event_id", data.eventId);
      if (error && /event_role_id|hours_per_day|day_rate_qar|schema cache/i.test(error.message)) {
        const { event_role_id: _r, hours_per_day: _h, day_rate_qar: _d, ...legacy } = payload;
        const { error: legacyErr } = await context.supabase
          .from("event_staff_assignments")
          .update(legacy)
          .eq("id", data.id)
          .eq("event_id", data.eventId);
        if (legacyErr) throw legacyErr;
      } else if (error) throw error;
    } else {
      const { data: created, error } = await context.supabase
        .from("event_staff_assignments")
        .insert({ ...payload, created_by: context.userId })
        .select("id")
        .single();
      if (error && /event_role_id|hours_per_day|day_rate_qar|schema cache/i.test(error.message)) {
        const { event_role_id: _r, hours_per_day: _h, day_rate_qar: _d, ...legacy } = payload;
        const retry = await context.supabase
          .from("event_staff_assignments")
          .insert({ ...legacy, created_by: context.userId })
          .select("id")
          .single();
        if (retry.error) throw retry.error;
        assignmentId = retry.data.id as string;
      } else if (error) {
        throw error;
      } else {
        assignmentId = created.id as string;
      }
    }

    const after = await listAssignmentRows(context, data.eventId);
    await syncEventCrewReadiness(context, data.eventId, eventCrewReadinessMet(after));

    await writeEventAudit(context, {
      action: data.id ? "crew_update" : "crew_add",
      entityType: "event_staff_assignment",
      entityId: assignmentId,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: payload,
    });

    return { id: assignmentId };
  },
  { auth: { capability: "events.edit" } },
);

export const deleteEventStaffAssignment = createAuthenticatedAction(
  IdSchema,
  async (data, context) => {
    const { data: row } = await context.supabase
      .from("event_staff_assignments")
      .select("id, event_id, staff_id, assignment_type, role_label, date_from, date_to")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Assignment not found");
    const event = await loadEventOrThrow(context, row.event_id as string);
    const { error } = await context.supabase
      .from("event_staff_assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;

    const after = await listAssignmentRows(context, event.id as string);
    await syncEventCrewReadiness(context, event.id as string, eventCrewReadinessMet(after));

    await writeEventAudit(context, {
      action: "crew_remove",
      entityType: "event_staff_assignment",
      entityId: data.id,
      eventId: event.id as string,
      locationId: event.location_id as string,
      before: row,
    });
    return { ok: true };
  },
  { auth: { capability: "events.edit" } },
);

const CreateEventHireSchema = z.object({
  eventId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  jobTitle: z.string().max(200).optional(),
  role_label: z.string().min(1).max(120).default("crew"),
  event_role_id: z.string().uuid().optional().nullable(),
  hours_per_day: z.number().min(1).max(24).optional().nullable(),
  day_rate_qar: z.number().min(0).optional().nullable(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pay_on_event_run: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  phone: z.string().max(40).optional(),
  /** Override location; defaults to event venue location. */
  locationId: z.string().uuid().optional(),
});

/**
 * Create a temporary event-only staff record + assignment.
 * Requires events.edit (action gate) and people.edit_roster (extra check).
 * Does not grant site HR events.edit.
 */
export const createEventHireAndAssign = createAuthenticatedAction(
  CreateEventHireSchema,
  async (data, context) => {
    await requireCapability(context, "people.edit_roster");
    const event = await loadEventOrThrow(context, data.eventId);
    const dateErr = validateAssignmentDates(data.date_from, data.date_to);
    if (dateErr) throw new Error(dateErr);

    const locationId = data.locationId ?? (event.location_id as string);
    await assertLocationAccess(context, locationId);

    const defaults = eventHireEmploymentDefaults(data.date_from, data.date_to);
    const { data: locRow, error: locErr } = await context.supabase
      .from("locations")
      .select("code")
      .eq("id", locationId)
      .single();
    if (locErr) throw locErr;
    const locationCode = String(locRow?.code ?? "").trim().toUpperCase();
    if (!locationCode) throw new Error("Branch code not found");

    const codeRows = await (async () => {
      const all: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: batch, error } = await supabaseAdmin
          .from("staff")
          .select("employee_code")
          .order("id", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        for (const row of batch ?? []) {
          const c = String(row.employee_code ?? "").trim().toUpperCase();
          if (c) all.push(c);
        }
        if ((batch ?? []).length < 1000) break;
      }
      return all;
    })();

    const employee_code = resolveNewEmployeeCode(locationCode, codeRows, null, {
      jobTitle: data.jobTitle ?? defaults.jobTitle,
    });

    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from("staff")
      .insert({
        location_id: locationId,
        employee_code,
        full_name: data.fullName.trim(),
        job_title: (data.jobTitle?.trim() || defaults.jobTitle) + " · Event",
        department: "Event hire",
        hire_date: defaults.hireDate,
        status: defaults.status,
        phone: data.phone?.trim() || null,
        employment_type: defaults.employmentType,
      })
      .select("id")
      .single();
    if (staffErr) throw staffErr;
    const staffId = staffRow.id as string;

    const { error: extErr } = await supabaseAdmin.from("staff_profile_ext").upsert(
      {
        staff_id: staffId,
        contract_start: defaults.contractStart,
        contract_end: defaults.contractEnd,
        updated_by: context.userId,
      },
      { onConflict: "staff_id" },
    );
    if (extErr) throw extErr;

    await context.supabase.rpc("log_audit", {
      _action: "staff.created",
      _table_name: "staff",
      _row_id: staffId,
      _after: {
        employee_code,
        full_name: data.fullName.trim(),
        source: "event_hire",
        event_id: data.eventId,
      },
      _location_id: locationId,
      _metadata: { event_id: data.eventId },
    });

    const payOn = data.pay_on_event_run ?? defaultPayOnEventRun("event_hire");
    const hireNote =
      emptyText(data.notes) ??
      `Event-only hire for event ${data.eventId.slice(0, 8)}… (${data.date_from}–${data.date_to})`;

    const hirePayload = {
      event_id: data.eventId,
      staff_id: staffId,
      assignment_type: "event_hire" as const,
      role_label: data.role_label.trim() || "crew",
      event_role_id: data.event_role_id ?? null,
      hours_per_day: data.hours_per_day ?? null,
      day_rate_qar: data.day_rate_qar ?? null,
      date_from: data.date_from,
      date_to: data.date_to,
      pay_on_event_run: payOn,
      notes: hireNote,
      created_by: context.userId,
      updated_by: context.userId,
    };
    let assignmentInsert = await context.supabase
      .from("event_staff_assignments")
      .insert(hirePayload)
      .select("id")
      .single();
    if (
      assignmentInsert.error &&
      /event_role_id|hours_per_day|day_rate_qar|schema cache/i.test(assignmentInsert.error.message)
    ) {
      const { event_role_id: _r, hours_per_day: _h, day_rate_qar: _d, ...legacy } = hirePayload;
      assignmentInsert = await context.supabase
        .from("event_staff_assignments")
        .insert(legacy)
        .select("id")
        .single();
    }
    if (assignmentInsert.error) throw assignmentInsert.error;
    const assignment = assignmentInsert.data;
    if (!assignment) throw new Error("Failed to create assignment");

    const after = await listAssignmentRows(context, data.eventId);
    await syncEventCrewReadiness(context, data.eventId, eventCrewReadinessMet(after));

    await writeEventAudit(context, {
      action: "crew_event_hire",
      entityType: "event_staff_assignment",
      entityId: assignment.id as string,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: {
        staff_id: staffId,
        assignment_id: assignment.id,
        date_from: data.date_from,
        date_to: data.date_to,
      },
    });

    return { staffId, assignmentId: assignment.id as string };
  },
  { auth: { capability: "events.edit" } },
);

const BulkImportRowSchema = z.object({
  row: z.number().int().positive(),
  employee_code: z.string().max(64).nullable(),
  staff_name: z.string().max(200).nullable(),
  assignment_type: AssignmentTypeSchema,
  role_label: z.string().min(1).max(120),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).nullable(),
  pay_on_event_run: z.boolean(),
});

const BulkImportSchema = z.object({
  eventId: z.string().uuid(),
  rows: z.array(BulkImportRowSchema).min(1).max(500),
});

/**
 * Bulk-add crew assignments from a parsed CSV/Excel preview.
 * Matches staff by employee_code (preferred) or exact full_name (case-insensitive).
 */
export const bulkImportEventStaffAssignments = createAuthenticatedAction(
  BulkImportSchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const existing = await listAssignmentRows(context, data.eventId);
    const working: typeof existing = [...existing];

    const codes = [
      ...new Set(
        data.rows
          .map((r) => (r.employee_code ?? "").trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const names = [
      ...new Set(
        data.rows
          .filter((r) => !(r.employee_code ?? "").trim())
          .map((r) => (r.staff_name ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    const byCode = new Map<string, { id: string; full_name: string }>();
    const byName = new Map<string, { id: string; full_name: string }[]>();

    if (codes.length) {
      const { data: staffByCode, error } = await context.supabase
        .from("staff")
        .select("id, full_name, employee_code")
        .in("employee_code", codes)
        .is("deleted_at", null);
      if (error) throw error;
      for (const s of staffByCode ?? []) {
        const code = String(s.employee_code ?? "")
          .trim()
          .toUpperCase();
        if (code) byCode.set(code, { id: s.id as string, full_name: s.full_name as string });
      }
    }

    if (names.length) {
      for (const name of names) {
        const { data: staffByName, error } = await context.supabase
          .from("staff")
          .select("id, full_name, employee_code")
          .ilike("full_name", name.replace(/[%_]/g, ""))
          .is("deleted_at", null)
          .limit(10);
        if (error) throw error;
        for (const s of staffByName ?? []) {
          const key = String(s.full_name ?? "")
            .trim()
            .toLowerCase();
          if (key !== name) continue;
          const list = byName.get(key) ?? [];
          list.push({ id: s.id as string, full_name: s.full_name as string });
          byName.set(key, list);
        }
      }
    }

    const errors: { row: number; message: string }[] = [];
    let imported = 0;

    for (const row of data.rows as EventStaffingImportRow[]) {
      const code = (row.employee_code ?? "").trim().toUpperCase();
      let staffId: string | null = null;

      if (code) {
        const hit = byCode.get(code);
        if (!hit) {
          errors.push({ row: row.row, message: `No staff with employee_code ${code}` });
          continue;
        }
        staffId = hit.id;
      } else {
        const key = (row.staff_name ?? "").trim().toLowerCase();
        const hits = byName.get(key) ?? [];
        if (hits.length === 0) {
          errors.push({
            row: row.row,
            message: `No staff named "${row.staff_name}" — use employee_code for a unique match`,
          });
          continue;
        }
        if (hits.length > 1) {
          errors.push({
            row: row.row,
            message: `Multiple staff named "${row.staff_name}" — use employee_code`,
          });
          continue;
        }
        staffId = hits[0]!.id;
      }

      const dateErr = validateAssignmentDates(row.date_from, row.date_to);
      if (dateErr) {
        errors.push({ row: row.row, message: dateErr });
        continue;
      }

      const overlap = findOverlappingAssignment(working, {
        staff_id: staffId,
        assignment_type: row.assignment_type,
        date_from: row.date_from,
        date_to: row.date_to,
      });
      if (overlap) {
        errors.push({
          row: row.row,
          message: `Overlaps existing assignment ${overlap.date_from}–${overlap.date_to}`,
        });
        continue;
      }

      const payload = {
        event_id: data.eventId,
        staff_id: staffId,
        assignment_type: row.assignment_type,
        role_label: row.role_label.trim() || "crew",
        date_from: row.date_from,
        date_to: row.date_to,
        pay_on_event_run: row.pay_on_event_run,
        notes: emptyText(row.notes),
        created_by: context.userId,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      };

      const { data: created, error } = await context.supabase
        .from("event_staff_assignments")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        errors.push({ row: row.row, message: error.message });
        continue;
      }

      working.push({
        id: created.id as string,
        event_id: data.eventId,
        staff_id: staffId,
        staff_name: null,
        staff_employee_code: code || null,
        staff_employment_type: null,
        staff_status: null,
        staff_job_title: null,
        staff_location_id: null,
        assignment_type: row.assignment_type,
        role_label: payload.role_label,
        date_from: row.date_from,
        date_to: row.date_to,
        pay_on_event_run: row.pay_on_event_run,
        notes: payload.notes,
        status: "active",
        closed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      imported += 1;
    }

    const after = await listAssignmentRows(context, data.eventId);
    await syncEventCrewReadiness(context, data.eventId, eventCrewReadinessMet(after));

    await writeEventAudit(context, {
      action: "crew_bulk_import",
      entityType: "event_staff_assignment",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { imported, errors: errors.length, attempted: data.rows.length },
    });

    return { imported, errors };
  },
  { auth: { capability: "events.edit" } },
);

const BulkIdsSchema = z.object({
  eventId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/** Bulk-remove open/closed assignments (hard delete). Prefer bulk close when pay already ran. */
export const bulkDeleteEventStaffAssignments = createAuthenticatedAction(
  BulkIdsSchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const { data: rows, error } = await context.supabase
      .from("event_staff_assignments")
      .select("id")
      .eq("event_id", data.eventId)
      .in("id", data.ids);
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id as string);
    if (!ids.length) return { removed: 0 };

    const { error: delErr } = await context.supabase
      .from("event_staff_assignments")
      .delete()
      .eq("event_id", data.eventId)
      .in("id", ids);
    if (delErr) throw delErr;

    const after = await listAssignmentRows(context, data.eventId);
    await syncEventCrewReadiness(context, data.eventId, eventCrewReadinessMet(after));
    await writeEventAudit(context, {
      action: "crew_bulk_remove",
      entityType: "event_staff_assignment",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { removed: ids.length },
    });
    return { removed: ids.length };
  },
  { auth: { capability: "events.edit" } },
);

/** Bulk-close selected assignments (does not park event hires — use Event pay close for that). */
export const bulkCloseEventStaffAssignments = createAuthenticatedAction(
  BulkIdsSchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const nowIso = new Date().toISOString();
    const closedOn = nowIso.slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("event_staff_assignments")
      .select("id, status, notes")
      .eq("event_id", data.eventId)
      .in("id", data.ids);
    if (error) throw error;

    let closed = 0;
    for (const row of rows ?? []) {
      if (String(row.status ?? "active").toLowerCase() === "closed") continue;
      const notes = String(row.notes ?? "");
      const stamp = `Closed via bulk ${closedOn}`;
      const nextNotes = notes.includes("Closed via") ? notes : notes ? `${notes}\n${stamp}` : stamp;
      const { error: updErr } = await context.supabase
        .from("event_staff_assignments")
        .update({
          status: "closed",
          closed_at: nowIso,
          closed_by: context.userId,
          notes: nextNotes,
          updated_by: context.userId,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("event_id", data.eventId);
      if (updErr) {
        if (/status|closed_at|schema cache/i.test(updErr.message)) {
          await context.supabase
            .from("event_staff_assignments")
            .update({ notes: nextNotes, updated_by: context.userId, updated_at: nowIso })
            .eq("id", row.id);
        } else {
          throw updErr;
        }
      }
      closed += 1;
    }

    await writeEventAudit(context, {
      action: "crew_bulk_close",
      entityType: "event_staff_assignment",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { closed, attempted: data.ids.length },
    });
    return { closed };
  },
  { auth: { capability: "events.edit" } },
);

/** Bulk-reopen selected closed assignments (does not un-park hires — use Event pay reopen for that). */
export const bulkReopenEventStaffAssignments = createAuthenticatedAction(
  BulkIdsSchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const nowIso = new Date().toISOString();
    const reopenedOn = nowIso.slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("event_staff_assignments")
      .select("id, status, notes")
      .eq("event_id", data.eventId)
      .in("id", data.ids);
    if (error) throw error;

    let reopened = 0;
    for (const row of rows ?? []) {
      if (String(row.status ?? "active").toLowerCase() !== "closed") continue;
      const notes = String(row.notes ?? "");
      const stamp = `Reopened via bulk ${reopenedOn}`;
      const nextNotes = notes.includes("Reopened via") ? notes : notes ? `${notes}\n${stamp}` : stamp;
      const { error: updErr } = await context.supabase
        .from("event_staff_assignments")
        .update({
          status: "active",
          closed_at: null,
          closed_by: null,
          notes: nextNotes,
          updated_by: context.userId,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("event_id", data.eventId);
      if (updErr) throw updErr;
      reopened += 1;
    }

    await writeEventAudit(context, {
      action: "crew_bulk_reopen",
      entityType: "event_staff_assignment",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { reopened, attempted: data.ids.length },
    });
    return { reopened };
  },
  { auth: { capability: "events.edit" } },
);

/** Bulk-update date window for selected assignments (same from/to applied to all). */
export const bulkUpdateEventStaffAssignmentDates = createAuthenticatedAction(
  BulkIdsSchema.extend({
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const dateErr = validateAssignmentDates(data.date_from, data.date_to);
    if (dateErr) throw new Error(dateErr);

    const existing = await listAssignmentRows(context, data.eventId);
    const selected = existing.filter((a) => data.ids.includes(a.id));
    if (!selected.length) return { updated: 0 };

    const working = existing.map((a) =>
      data.ids.includes(a.id)
        ? { ...a, date_from: data.date_from, date_to: data.date_to }
        : a,
    );
    for (const row of selected) {
      const overlap = findOverlappingAssignment(
        working,
        {
          id: row.id,
          staff_id: row.staff_id,
          assignment_type: row.assignment_type,
          date_from: data.date_from,
          date_to: data.date_to,
        },
        row.id,
      );
      if (overlap) {
        throw new Error(
          `Overlap for ${row.staff_name ?? row.staff_id} with ${overlap.date_from}–${overlap.date_to}`,
        );
      }
    }

    const nowIso = new Date().toISOString();
    const { error } = await context.supabase
      .from("event_staff_assignments")
      .update({
        date_from: data.date_from,
        date_to: data.date_to,
        updated_by: context.userId,
        updated_at: nowIso,
      })
      .eq("event_id", data.eventId)
      .in("id", data.ids);
    if (error) throw error;

    await writeEventAudit(context, {
      action: "crew_bulk_dates",
      entityType: "event_staff_assignment",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { updated: selected.length, date_from: data.date_from, date_to: data.date_to },
    });
    return { updated: selected.length };
  },
  { auth: { capability: "events.edit" } },
);
