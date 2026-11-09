"use server";

/**
 * HOO-only demo seed / delete for People event workforce.
 * Event-scoped only — does NOT write monthly roster / attendance_roster_assignments.
 */

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  assertDemoDeleteConfirmation,
  buildDemoStaffPool,
  demoPunchIsos,
  demoPunchPattern,
  demoShiftTimesForRole,
  EVENT_WORKFORCE_DEMO_DEPARTMENT,
  EVENT_WORKFORCE_DEMO_MARKER,
  EVENT_WORKFORCE_DEMO_ROLE_CATALOG,
  mayManageEventWorkforceDemo,
  notesIsDemo,
  validateDemoDateRange,
  type DemoStaffSpec,
} from "@/lib/events/event-workforce-demo";
import {
  deriveEventDayStatus,
  enumerateDatesInclusive,
  normalizeTimeHHMM,
} from "@/lib/events/event-schedule";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Uuid = z.string().uuid();

function assertHoo(context: AuthContext) {
  const roles = context.roles ?? [];
  const jobTitle = context.access?.jobTitle ?? null;
  if (!mayManageEventWorkforceDemo({ roles, jobTitle })) {
    throw new ForbiddenError(
      "Only Head of Operations can seed or delete event workforce demo data.",
    );
  }
}

async function loadEventOrThrow(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("events")
    .select(
      "id, location_id, name, event_name, event_number, event_start, event_end, venue_access, setup_start, dismantle_end",
    )
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Event not found");
  if (!data.location_id) throw new Error("Event has no location — set the event venue first.");
  await assertLocationAccess(context, data.location_id as string);
  return data;
}

async function writeEventAudit(
  context: AuthContext,
  entry: {
    action: string;
    entityType: string;
    eventId: string;
    locationId: string | null;
    after?: unknown;
  },
) {
  await context.supabase.from("event_audit_logs").insert({
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType,
    event_id: entry.eventId,
    location_id: entry.locationId,
    after: (entry.after ?? null) as Json,
    metadata: { demo: true } as Json,
  });
}

async function ensureDemoStaffPool(locationId: string, userId: string): Promise<
  Array<DemoStaffSpec & { id: string }>
> {
  const pool = buildDemoStaffPool();
  const codes = pool.map((p) => p.code);
  const { data: existing, error } = await supabaseAdmin
    .from("staff")
    .select("id, employee_code, full_name, location_id, department, deleted_at")
    .in("employee_code", codes);
  if (error) throw error;

  const byCode = new Map(
    (existing ?? [])
      .filter((r) => !r.deleted_at)
      .map((r) => [String(r.employee_code).trim().toUpperCase(), r]),
  );

  const resolved: Array<DemoStaffSpec & { id: string }> = [];
  const toInsert: Array<Record<string, unknown>> = [];

  for (const spec of pool) {
    const found = byCode.get(spec.code);
    if (found) {
      resolved.push({ ...spec, id: found.id as string });
      continue;
    }
    toInsert.push({
      location_id: locationId,
      employee_code: spec.code,
      full_name: spec.fullName,
      job_title: `${spec.jobTitle} · Event demo`,
      department: EVENT_WORKFORCE_DEMO_DEPARTMENT,
      staff_role: spec.staffRole,
      employment_type: "temporary",
      status: "active",
      hire_date: new Date().toISOString().slice(0, 10),
      is_roaming: true,
    });
  }

  if (toInsert.length) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("staff")
      .insert(toInsert)
      .select("id, employee_code");
    if (insErr) throw insErr;
    for (const row of inserted ?? []) {
      const code = String(row.employee_code).trim().toUpperCase();
      const spec = pool.find((p) => p.code === code);
      if (spec) resolved.push({ ...spec, id: row.id as string });
    }
    // Profile ext marker (optional).
    const extRows = (inserted ?? []).map((r) => ({
      staff_id: r.id as string,
      updated_by: userId,
    }));
    if (extRows.length) {
      await supabaseAdmin.from("staff_profile_ext").upsert(extRows, { onConflict: "staff_id" });
    }
  }

  if (resolved.length !== pool.length) {
    // Re-fetch any race winners.
    const { data: again, error: againErr } = await supabaseAdmin
      .from("staff")
      .select("id, employee_code")
      .in("employee_code", codes)
      .is("deleted_at", null);
    if (againErr) throw againErr;
    const map = new Map(
      (again ?? []).map((r) => [String(r.employee_code).trim().toUpperCase(), r.id as string]),
    );
    return pool.map((spec) => {
      const id = map.get(spec.code);
      if (!id) throw new Error(`Failed to create demo staff ${spec.code}`);
      return { ...spec, id };
    });
  }

  return resolved;
}

async function ensureDemoRoles(
  context: AuthContext,
  eventId: string,
): Promise<Map<string, string>> {
  const { data: existing, error } = await context.supabase
    .from("event_roles")
    .select("id, code, kind, default_day_rate_qar, is_active")
    .eq("event_id", eventId);
  if (error) {
    if (/event_roles|schema cache|does not exist/i.test(error.message)) {
      throw new Error("Event roles table missing — apply latest migrations.");
    }
    throw error;
  }

  const byCode = new Map((existing ?? []).map((r) => [String(r.code).toLowerCase(), r]));
  const roleIdByCode = new Map<string, string>();

  for (const draft of EVENT_WORKFORCE_DEMO_ROLE_CATALOG) {
    const cur = byCode.get(draft.code);
    if (cur) {
      const { error: updErr } = await context.supabase
        .from("event_roles")
        .update({
          name: draft.name,
          kind: draft.kind,
          default_hours_per_day: draft.default_hours_per_day,
          default_day_rate_qar: draft.default_day_rate_qar,
          sort_order: draft.sort_order,
          is_active: true,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cur.id);
      if (updErr) throw updErr;
      roleIdByCode.set(draft.code.toLowerCase(), cur.id as string);
      continue;
    }
    const { data: inserted, error: insErr } = await context.supabase
      .from("event_roles")
      .insert({
        event_id: eventId,
        code: draft.code,
        name: draft.name,
        kind: draft.kind,
        default_hours_per_day: draft.default_hours_per_day,
        default_day_rate_qar: draft.default_day_rate_qar,
        sort_order: draft.sort_order,
        is_active: true,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, code")
      .single();
    if (insErr) throw insErr;
    roleIdByCode.set(String(inserted!.code).toLowerCase(), inserted!.id as string);
  }

  return roleIdByCode;
}

async function deleteDemoScopedForEvent(
  context: AuthContext,
  eventId: string,
  locationId: string,
): Promise<{
  attendanceSummaries: number;
  attendanceLogs: number;
  shifts: number;
  assignments: number;
  rolesRemoved: number;
}> {
  // 1) Event-tagged attendance summaries (event-scoped — not monthly roster).
  const { data: summaries, error: sumErr } = await supabaseAdmin
    .from("attendance_daily_summary")
    .select("id, hr_remarks")
    .eq("event_id", eventId);
  if (sumErr && !/event_id|schema cache/i.test(sumErr.message)) throw sumErr;

  // Prefer demo-marked; if none marked, clear all event-tagged rows for this event only.
  const markedSummaryIds = (summaries ?? [])
    .filter((s) => notesIsDemo(s.hr_remarks as string | null))
    .map((s) => s.id as string);
  const deleteSummaryIds = markedSummaryIds.length
    ? markedSummaryIds
    : (summaries ?? []).map((s) => s.id as string);

  // 2) Event-tagged punches (source or raw_payload marker).
  let logCount = 0;
  {
    const { data: logs, error: logErr } = await supabaseAdmin
      .from("attendance_logs")
      .select("id, source, raw_payload")
      .eq("event_id", eventId);
    if (logErr && !/event_id|schema cache/i.test(logErr.message)) throw logErr;
    const demoLogs = (logs ?? []).filter((l) => {
      if (String(l.source ?? "") === "event_demo") return true;
      const raw = l.raw_payload as { note?: string } | null;
      return notesIsDemo(raw?.note);
    });
    const ids = (demoLogs.length ? demoLogs : logs ?? []).map((l) => l.id as string);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await supabaseAdmin.from("attendance_logs").delete().in("id", chunk);
      if (error) throw error;
      logCount += chunk.length;
    }
  }

  for (let i = 0; i < deleteSummaryIds.length; i += 200) {
    const chunk = deleteSummaryIds.slice(i, i + 200);
    const { error } = await supabaseAdmin.from("attendance_daily_summary").delete().in("id", chunk);
    if (error) throw error;
  }

  // 3) Demo schedule slots (notes marker); fall back to all slots for event if unmarked.
  let shiftCount = 0;
  {
    const { data: slots, error } = await context.supabase
      .from("event_schedule_slots")
      .select("id, notes")
      .eq("event_id", eventId);
    if (error) throw error;
    const marked = (slots ?? []).filter((s) => notesIsDemo(s.notes));
    const ids = (marked.length ? marked : slots ?? []).map((s) => s.id as string);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error: delErr } = await context.supabase
        .from("event_schedule_slots")
        .delete()
        .in("id", chunk);
      if (delErr) throw delErr;
      shiftCount += chunk.length;
    }
  }

  // 4) Demo assignments.
  let assignmentCount = 0;
  const demoStaffIds = new Set<string>();
  {
    const { data: rows, error } = await context.supabase
      .from("event_staff_assignments")
      .select("id, notes, staff_id")
      .eq("event_id", eventId);
    if (error) throw error;
    const marked = (rows ?? []).filter((r) => notesIsDemo(r.notes));
    const target = marked.length ? marked : [];
    for (const r of target) {
      if (r.staff_id) demoStaffIds.add(r.staff_id as string);
    }
    const ids = target.map((r) => r.id as string);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error: delErr } = await context.supabase
        .from("event_staff_assignments")
        .delete()
        .in("id", chunk);
      if (delErr) throw delErr;
      assignmentCount += chunk.length;
    }
  }

  // 5) Soft-remove demo-only roles that no longer have assignments (keep catalog defaults if still used).
  let rolesRemoved = 0;
  {
    const { data: roles, error } = await context.supabase
      .from("event_roles")
      .select("id, code")
      .eq("event_id", eventId);
    if (error && !/event_roles|schema cache/i.test(error.message)) throw error;
    const { data: remaining } = await context.supabase
      .from("event_staff_assignments")
      .select("event_role_id")
      .eq("event_id", eventId);
    const used = new Set(
      (remaining ?? []).map((r) => r.event_role_id as string | null).filter(Boolean),
    );
    // Only delete cashier if we added it for demo and nothing else uses it; deactivate labour rate resets optional.
    for (const role of roles ?? []) {
      if (String(role.code).toLowerCase() !== "cashier") continue;
      if (used.has(role.id as string)) continue;
      const { error: delErr } = await context.supabase
        .from("event_roles")
        .delete()
        .eq("id", role.id);
      if (!delErr) rolesRemoved += 1;
    }
  }

  void locationId;
  void demoStaffIds;
  return {
    attendanceSummaries: deleteSummaryIds.length,
    attendanceLogs: logCount,
    shifts: shiftCount,
    assignments: assignmentCount,
    rolesRemoved,
  };
}

export type SeedEventWorkforceDemoResult = {
  eventId: string;
  eventName: string;
  locationId: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  staffEnsured: number;
  rolesUpserted: number;
  assignments: number;
  shifts: number;
  attendanceDays: number;
  punches: number;
};

/**
 * Seed demo roles, crew, shifts, and attendance for one event across From–To.
 * Does not touch monthly roster tables.
 */
export const seedEventWorkforceDemo = createAuthenticatedAction(
  z.object({
    eventId: Uuid,
    dateFrom: Ymd,
    dateTo: Ymd,
  }),
  async (data, context): Promise<SeedEventWorkforceDemoResult> => {
    assertHoo(context);
    const rangeErr = validateDemoDateRange(data.dateFrom, data.dateTo);
    if (rangeErr) throw new Error(rangeErr);

    const event = await loadEventOrThrow(context, data.eventId);
    const locationId = event.location_id as string;
    const days = enumerateDatesInclusive(data.dateFrom, data.dateTo);

    // Clear prior demo rows for this event so re-seed is idempotent (event-scoped only).
    await deleteDemoScopedForEvent(context, data.eventId, locationId);

    const staff = await ensureDemoStaffPool(locationId, context.userId);
    const roleIdByCode = await ensureDemoRoles(context, data.eventId);

    // Assignments for the selected range only.
    const assignmentRows = staff.map((s) => ({
      event_id: data.eventId,
      staff_id: s.id,
      assignment_type: "event_hire" as const,
      role_label: s.roleCode,
      event_role_id: roleIdByCode.get(s.roleCode) ?? null,
      hours_per_day: s.bucket === "labour" ? 10 : null,
      day_rate_qar: s.dayRateQar,
      date_from: data.dateFrom,
      date_to: data.dateTo,
      pay_on_event_run: true,
      notes: `${EVENT_WORKFORCE_DEMO_MARKER} Demo assignment`,
      status: "active",
      created_by: context.userId,
      updated_by: context.userId,
    }));

    const assignmentIdByStaff = new Map<string, string>();
    for (let i = 0; i < assignmentRows.length; i += 100) {
      const chunk = assignmentRows.slice(i, i + 100);
      let res = await context.supabase
        .from("event_staff_assignments")
        .insert(chunk)
        .select("id, staff_id");
      if (
        res.error &&
        /event_role_id|hours_per_day|day_rate_qar|schema cache/i.test(res.error.message)
      ) {
        const legacy = chunk.map(
          ({ event_role_id: _r, hours_per_day: _h, day_rate_qar: _d, ...rest }) => rest,
        );
        res = await context.supabase
          .from("event_staff_assignments")
          .insert(legacy)
          .select("id, staff_id");
      }
      if (res.error) throw res.error;
      for (const row of res.data ?? []) {
        assignmentIdByStaff.set(row.staff_id as string, row.id as string);
      }
    }

    // Shifts for each day in From–To.
    const slotRows: Array<Record<string, unknown>> = [];
    staff.forEach((s, staffIndex) => {
      const times = demoShiftTimesForRole(s.roleCode);
      for (const workDate of days) {
        slotRows.push({
          event_id: data.eventId,
          staff_id: s.id,
          assignment_id: assignmentIdByStaff.get(s.id) ?? null,
          work_date: workDate,
          scheduled_in: `${times.inHm}:00`,
          scheduled_out: `${times.outHm}:00`,
          location_id: locationId,
          role_label: s.roleCode,
          event_role_id: roleIdByCode.get(s.roleCode) ?? null,
          hours_per_day: s.bucket === "labour" ? 10 : null,
          day_rate_qar: s.dayRateQar,
          notes: `${EVENT_WORKFORCE_DEMO_MARKER} idx=${staffIndex}`,
          created_by: context.userId,
          updated_by: context.userId,
        });
      }
    });

    let shiftsInserted = 0;
    for (let i = 0; i < slotRows.length; i += 100) {
      const chunk = slotRows.slice(i, i + 100);
      let res = await context.supabase.from("event_schedule_slots").insert(chunk);
      if (
        res.error &&
        /event_role_id|hours_per_day|day_rate_qar|schema cache/i.test(res.error.message)
      ) {
        const legacy = chunk.map(
          ({ event_role_id: _r, hours_per_day: _h, day_rate_qar: _d, ...rest }) => rest,
        );
        res = await context.supabase.from("event_schedule_slots").insert(legacy);
      }
      if (res.error) {
        if (!/duplicate|unique/i.test(res.error.message)) throw res.error;
        for (const row of chunk) {
          const one = await context.supabase.from("event_schedule_slots").insert(row);
          if (!one.error) shiftsInserted += 1;
          else if (!/duplicate|unique/i.test(one.error.message)) throw one.error;
        }
        continue;
      }
      shiftsInserted += chunk.length;
    }

    // Attendance punches + daily summaries tagged with event_id only (not monthly roster).
    let punches = 0;
    let attendanceDays = 0;
    const punchRows: Array<Record<string, unknown>> = [];
    const summaryRows: Array<Record<string, unknown>> = [];

    staff.forEach((s, staffIndex) => {
      const times = demoShiftTimesForRole(s.roleCode);
      days.forEach((workDate, dayIndex) => {
        const pattern = demoPunchPattern(staffIndex, dayIndex);
        const { inIso, outIso } = demoPunchIsos({
          workDate,
          scheduledInHm: times.inHm,
          scheduledOutHm: times.outHm,
          pattern,
        });
        const derived = deriveEventDayStatus({
          actualIn: inIso,
          actualOut: outIso,
          workDate,
          scheduledIn: normalizeTimeHHMM(times.inHm),
          scheduledOut: normalizeTimeHHMM(times.outHm),
          graceMinutes: 10,
        });

        if (inIso) {
          punchRows.push({
            location_id: locationId,
            staff_id: s.id,
            attendance_date: workDate,
            punch_at: inIso,
            punch_type: "in",
            source: "event_demo",
            biometric_user_id: s.code,
            device_user_name: s.fullName,
            event_id: data.eventId,
            raw_payload: {
              note: EVENT_WORKFORCE_DEMO_MARKER,
              pattern,
            },
          });
          punches += 1;
        }
        if (outIso) {
          punchRows.push({
            location_id: locationId,
            staff_id: s.id,
            attendance_date: workDate,
            punch_at: outIso,
            punch_type: "out",
            source: "event_demo",
            biometric_user_id: s.code,
            device_user_name: s.fullName,
            event_id: data.eventId,
            raw_payload: {
              note: EVENT_WORKFORCE_DEMO_MARKER,
              pattern,
            },
          });
          punches += 1;
        }

        summaryRows.push({
          location_id: locationId,
          staff_id: s.id,
          work_date: workDate,
          subject_key: `staff:${s.id}`,
          event_id: data.eventId,
          status: derived.status,
          scheduled_in: derived.scheduledInIso,
          scheduled_out: derived.scheduledOutIso,
          actual_in: inIso,
          actual_out: outIso,
          late_minutes: derived.lateMinutes,
          worked_minutes: derived.workedMinutes,
          overtime_minutes: derived.overtimeMinutes,
          missed_punch: derived.missedPunch,
          punch_count: (inIso ? 1 : 0) + (outIso ? 1 : 0),
          biometric_user_id: s.code,
          hr_remarks: EVENT_WORKFORCE_DEMO_MARKER,
          updated_at: new Date().toISOString(),
        });
        attendanceDays += 1;
      });
    });

    for (let i = 0; i < punchRows.length; i += 100) {
      const chunk = punchRows.slice(i, i + 100);
      const { error } = await supabaseAdmin.from("attendance_logs").insert(chunk);
      if (error) {
        // Types may lag event_id column — retry without event_id then update.
        if (/event_id|schema cache/i.test(error.message)) {
          const stripped = chunk.map(({ event_id: _e, ...rest }) => rest);
          const { error: e2 } = await supabaseAdmin.from("attendance_logs").insert(stripped);
          if (e2) throw e2;
        } else {
          throw error;
        }
      }
    }

    for (let i = 0; i < summaryRows.length; i += 80) {
      const chunk = summaryRows.slice(i, i + 80);
      const { error } = await supabaseAdmin
        .from("attendance_daily_summary")
        .upsert(chunk, { onConflict: "location_id,subject_key,work_date" });
      if (error) throw error;
    }

    await writeEventAudit(context, {
      action: "workforce_demo_seed",
      entityType: "event_workforce_demo",
      eventId: data.eventId,
      locationId,
      after: {
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        days: days.length,
        staff: staff.length,
        shifts: shiftsInserted,
        attendanceDays,
        punches,
      },
    });

    return {
      eventId: data.eventId,
      eventName: String(event.name || event.event_name || "Event"),
      locationId,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      days: days.length,
      staffEnsured: staff.length,
      rolesUpserted: roleIdByCode.size,
      assignments: assignmentRows.length,
      shifts: shiftsInserted,
      attendanceDays,
      punches,
    };
  },
  { auth: { anyCapability: ["events.edit", "events.view", "attendance.view", "people.view_roster"] } },
);

export type DeleteEventWorkforceDemoResult = {
  eventId: string;
  attendanceSummaries: number;
  attendanceLogs: number;
  shifts: number;
  assignments: number;
  rolesRemoved: number;
};

/**
 * Delete demo (or all event-tagged) attendance, shifts, and demo assignments for an event.
 * Does not delete the event. Does not touch monthly roster.
 */
export const deleteEventWorkforceDemo = createAuthenticatedAction(
  z.object({
    eventId: Uuid,
    confirmation: z.string().max(80),
    /** When true, clears all event-tagged attendance + all shifts + all assignments (strong). */
    wipeAllEventWorkforce: z.boolean().optional(),
  }),
  async (data, context): Promise<DeleteEventWorkforceDemoResult> => {
    assertHoo(context);
    assertDemoDeleteConfirmation(data.confirmation);
    const event = await loadEventOrThrow(context, data.eventId);
    const locationId = event.location_id as string;

    if (data.wipeAllEventWorkforce) {
      // Strong wipe: all event-tagged attendance/logs, all shifts, all assignments — still not the event / monthly roster.
      let attendanceLogs = 0;
      {
        const { data: logs, error } = await supabaseAdmin
          .from("attendance_logs")
          .select("id")
          .eq("event_id", data.eventId);
        if (error && !/event_id|schema cache/i.test(error.message)) throw error;
        const ids = (logs ?? []).map((l) => l.id as string);
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { error: delErr } = await supabaseAdmin
            .from("attendance_logs")
            .delete()
            .in("id", chunk);
          if (delErr) throw delErr;
          attendanceLogs += chunk.length;
        }
      }

      let attendanceSummaries = 0;
      {
        const { data: rows, error } = await supabaseAdmin
          .from("attendance_daily_summary")
          .select("id")
          .eq("event_id", data.eventId);
        if (error && !/event_id|schema cache/i.test(error.message)) throw error;
        const ids = (rows ?? []).map((r) => r.id as string);
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { error: delErr } = await supabaseAdmin
            .from("attendance_daily_summary")
            .delete()
            .in("id", chunk);
          if (delErr) throw delErr;
          attendanceSummaries += chunk.length;
        }
      }

      const { data: slots, error: slotErr } = await context.supabase
        .from("event_schedule_slots")
        .select("id")
        .eq("event_id", data.eventId);
      if (slotErr) throw slotErr;
      const slotIds = (slots ?? []).map((s) => s.id as string);
      for (let i = 0; i < slotIds.length; i += 200) {
        const chunk = slotIds.slice(i, i + 200);
        const { error } = await context.supabase
          .from("event_schedule_slots")
          .delete()
          .in("id", chunk);
        if (error) throw error;
      }

      const { data: assigns, error: asgErr } = await context.supabase
        .from("event_staff_assignments")
        .select("id")
        .eq("event_id", data.eventId);
      if (asgErr) throw asgErr;
      const asgIds = (assigns ?? []).map((a) => a.id as string);
      for (let i = 0; i < asgIds.length; i += 200) {
        const chunk = asgIds.slice(i, i + 200);
        const { error } = await context.supabase
          .from("event_staff_assignments")
          .delete()
          .in("id", chunk);
        if (error) throw error;
      }

      // Roles: delete all for this event (user asked roles wipe).
      let rolesRemoved = 0;
      {
        const { data: roles, error } = await context.supabase
          .from("event_roles")
          .select("id")
          .eq("event_id", data.eventId);
        if (error && !/event_roles|schema cache/i.test(error.message)) throw error;
        const ids = (roles ?? []).map((r) => r.id as string);
        if (ids.length) {
          const { error: delErr } = await context.supabase
            .from("event_roles")
            .delete()
            .in("id", ids);
          if (delErr) throw delErr;
          rolesRemoved = ids.length;
        }
      }

      await writeEventAudit(context, {
        action: "workforce_demo_wipe",
        entityType: "event_workforce_demo",
        eventId: data.eventId,
        locationId,
        after: {
          attendanceSummaries,
          attendanceLogs,
          shifts: slotIds.length,
          assignments: asgIds.length,
          rolesRemoved,
        },
      });

      return {
        eventId: data.eventId,
        attendanceSummaries,
        attendanceLogs,
        shifts: slotIds.length,
        assignments: asgIds.length,
        rolesRemoved,
      };
    }

    const result = await deleteDemoScopedForEvent(context, data.eventId, locationId);
    await writeEventAudit(context, {
      action: "workforce_demo_delete",
      entityType: "event_workforce_demo",
      eventId: data.eventId,
      locationId,
      after: result,
    });
    return { eventId: data.eventId, ...result };
  },
  { auth: { anyCapability: ["events.edit", "events.view", "attendance.view", "people.view_roster"] } },
);
