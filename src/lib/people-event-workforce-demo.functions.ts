"use server";

/**
 * HOO-only demo seed / delete for People event workforce.
 * Event-scoped only — does NOT write monthly roster / attendance_roster_assignments.
 */

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
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
  resolveDemoSeedPayWindow,
  validateDemoDateRange,
  type DemoStaffSpec,
} from "@/lib/events/event-workforce-demo";
import {
  eventPayrollBatchLabel,
  eventPeriodMonthAnchor,
  resolveEventPayPeriodWindow,
} from "@/lib/events/event-payroll";
import {
  deriveEventDayStatus,
  enumerateDatesInclusive,
  normalizeTimeHHMM,
} from "@/lib/events/event-schedule";
import { generatePayrollLines } from "@/lib/hr-payroll.functions";
import { canUserDo } from "@/lib/rbac";
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

async function ensureDemoStaffPool(
  locationId: string,
  userId: string,
  hireDate: string,
): Promise<Array<DemoStaffSpec & { id: string }>> {
  const pool = buildDemoStaffPool();
  const codes = pool.map((p) => p.code);
  const { data: existing, error } = await supabaseAdmin
    .from("staff")
    .select("id, employee_code, full_name, location_id, department, deleted_at, hire_date")
    .in("employee_code", codes);
  if (error) throw error;

  const byCode = new Map(
    (existing ?? [])
      .filter((r) => !r.deleted_at)
      .map((r) => [String(r.employee_code).trim().toUpperCase(), r]),
  );

  const resolved: Array<DemoStaffSpec & { id: string }> = [];
  const toInsert: TablesInsert<"staff">[] = [];
  const hireBackfillIds: string[] = [];

  for (const spec of pool) {
    const found = byCode.get(spec.code);
    if (found) {
      resolved.push({ ...spec, id: found.id as string });
      const existingHire = found.hire_date ? String(found.hire_date).slice(0, 10) : null;
      // Keep hire on/before the seed window so generate proration does not zero paid days.
      if (!existingHire || existingHire > hireDate) hireBackfillIds.push(found.id as string);
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
      hire_date: hireDate,
      is_roaming: true,
    });
  }

  if (hireBackfillIds.length) {
    for (let i = 0; i < hireBackfillIds.length; i += 100) {
      const chunk = hireBackfillIds.slice(i, i + 100);
      const { error: hireErr } = await supabaseAdmin
        .from("staff")
        .update({ hire_date: hireDate, updated_at: new Date().toISOString() })
        .in("id", chunk);
      if (hireErr && !/hire_date|schema cache/i.test(hireErr.message)) throw hireErr;
    }
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

async function deleteIdsInChunks(
  table:
    | "attendance_logs"
    | "attendance_daily_summary"
    | "event_schedule_slots"
    | "event_staff_assignments"
    | "event_roles"
    | "hr_payroll_periods",
  ids: string[],
  client: "admin" | "user",
  context: AuthContext,
): Promise<number> {
  let removed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const db = client === "admin" ? supabaseAdmin : context.supabase;
    const { error } = await db.from(table).delete().in("id", chunk);
    if (error) throw error;
    removed += chunk.length;
  }
  return removed;
}

/**
 * Clear event payroll period(s) + cascaded hr_payroll_lines for one event.
 * Force-deletes even advanced statuses so demo reset is not stuck on a QAR 0 shell.
 * Does not touch monthly (period_kind=monthly) payroll.
 */
async function deleteEventPayrollForEvent(
  context: AuthContext,
  eventId: string,
): Promise<{ periodsRemoved: number; linesRemoved: number }> {
  const { data: periods, error } = await supabaseAdmin
    .from("hr_payroll_periods")
    .select("id")
    .eq("period_kind", "event")
    .eq("event_id", eventId);
  if (error) {
    if (/period_kind|event_id|schema cache|does not exist/i.test(error.message)) {
      return { periodsRemoved: 0, linesRemoved: 0 };
    }
    throw error;
  }
  const periodIds = (periods ?? []).map((p) => p.id as string);
  if (!periodIds.length) return { periodsRemoved: 0, linesRemoved: 0 };

  let linesRemoved = 0;
  {
    const { data: lines, error: lineErr } = await supabaseAdmin
      .from("hr_payroll_lines")
      .select("id")
      .in("period_id", periodIds);
    if (lineErr && !/hr_payroll_lines|schema cache|does not exist/i.test(lineErr.message)) {
      throw lineErr;
    }
    linesRemoved = (lines ?? []).length;
  }

  for (const periodId of periodIds) {
    // Release OT / air-ticket links before period delete (same as deletePayrollPeriod).
    await supabaseAdmin
      .from("hr_ot_claims")
      .update({
        status: "gm_approved",
        payroll_posted_by: null,
        payroll_posted_at: null,
        payroll_period_id: null,
      })
      .eq("payroll_period_id", periodId)
      .eq("status", "payroll_posted");
    await supabaseAdmin
      .from("hr_air_ticket_issues")
      .update({
        payroll_payment_status: "unpaid",
        payroll_period_id: null,
      })
      .eq("payroll_period_id", periodId)
      .in("payroll_payment_status", ["pending", "unpaid"]);
  }

  const periodsRemoved = await deleteIdsInChunks(
    "hr_payroll_periods",
    periodIds,
    "admin",
    context,
  );
  return { periodsRemoved, linesRemoved };
}

/**
 * Full event-scoped workforce wipe for one event (selected via ?eventId=).
 * Clears attendance, shifts, assignments, roles, and event payroll — never monthly roster.
 */
async function wipeEventWorkforceForEvent(
  context: AuthContext,
  eventId: string,
  options?: { demoMarkedOnly?: boolean },
): Promise<{
  attendanceSummaries: number;
  attendanceLogs: number;
  shifts: number;
  assignments: number;
  rolesRemoved: number;
  payrollPeriods: number;
  payrollLines: number;
}> {
  const demoOnly = options?.demoMarkedOnly === true;

  // 1) Event-tagged attendance summaries.
  const { data: summaries, error: sumErr } = await supabaseAdmin
    .from("attendance_daily_summary")
    .select("id, hr_remarks")
    .eq("event_id", eventId);
  if (sumErr && !/event_id|schema cache/i.test(sumErr.message)) throw sumErr;

  const markedSummaryIds = (summaries ?? [])
    .filter((s) => notesIsDemo(s.hr_remarks as string | null))
    .map((s) => s.id as string);
  const deleteSummaryIds =
    demoOnly && markedSummaryIds.length
      ? markedSummaryIds
      : (summaries ?? []).map((s) => s.id as string);

  // 2) Event-tagged punches.
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
    const ids = (
      demoOnly && demoLogs.length ? demoLogs : logs ?? []
    ).map((l) => l.id as string);
    logCount = await deleteIdsInChunks("attendance_logs", ids, "admin", context);
  }

  const attendanceSummaries = await deleteIdsInChunks(
    "attendance_daily_summary",
    deleteSummaryIds,
    "admin",
    context,
  );

  // 3) Schedule slots — demo-marked first; otherwise all for this event.
  let shiftCount = 0;
  {
    const { data: slots, error } = await context.supabase
      .from("event_schedule_slots")
      .select("id, notes")
      .eq("event_id", eventId);
    if (error) throw error;
    const marked = (slots ?? []).filter((s) => notesIsDemo(s.notes));
    const ids = (
      demoOnly && marked.length ? marked : slots ?? []
    ).map((s) => s.id as string);
    shiftCount = await deleteIdsInChunks("event_schedule_slots", ids, "user", context);
  }

  // 4) Assignments — demo-marked first; fall back to all so Crew is empty after delete.
  let assignmentCount = 0;
  {
    const { data: rows, error } = await context.supabase
      .from("event_staff_assignments")
      .select("id, notes")
      .eq("event_id", eventId);
    if (error) throw error;
    const marked = (rows ?? []).filter((r) => notesIsDemo(r.notes));
    const ids = (
      demoOnly && marked.length ? marked : rows ?? []
    ).map((r) => r.id as string);
    assignmentCount = await deleteIdsInChunks(
      "event_staff_assignments",
      ids,
      "user",
      context,
    );
  }

  // 5) Roles — hard-clear when full wipe (seed recreates catalog). Demo-only: drop unused roles.
  let rolesRemoved = 0;
  {
    const { data: roles, error } = await context.supabase
      .from("event_roles")
      .select("id, code")
      .eq("event_id", eventId);
    if (error && !/event_roles|schema cache/i.test(error.message)) throw error;
    if (!demoOnly) {
      const ids = (roles ?? []).map((r) => r.id as string);
      if (ids.length) {
        rolesRemoved = await deleteIdsInChunks("event_roles", ids, "user", context);
      }
    } else {
      const { data: remaining } = await context.supabase
        .from("event_staff_assignments")
        .select("event_role_id")
        .eq("event_id", eventId);
      const used = new Set(
        (remaining ?? []).map((r) => r.event_role_id as string | null).filter(Boolean),
      );
      const catalogCodes = new Set(
        EVENT_WORKFORCE_DEMO_ROLE_CATALOG.map((r) => r.code.toLowerCase()),
      );
      const ids = (roles ?? [])
        .filter((r) => {
          if (used.has(r.id as string)) return false;
          return catalogCodes.has(String(r.code).toLowerCase());
        })
        .map((r) => r.id as string);
      if (ids.length) {
        rolesRemoved = await deleteIdsInChunks("event_roles", ids, "user", context);
      }
    }
  }

  // 6) Event payroll periods + lines (so Payroll is not stuck with empty QAR 0).
  const payroll = await deleteEventPayrollForEvent(context, eventId);

  return {
    attendanceSummaries,
    attendanceLogs: logCount,
    shifts: shiftCount,
    assignments: assignmentCount,
    rolesRemoved,
    payrollPeriods: payroll.periodsRemoved,
    payrollLines: payroll.linesRemoved,
  };
}

/**
 * Create (or replace) an event pay period on the event open window and generate lines.
 * Period dates match createEventPayrollPeriod so Create & generate does not sync away
 * from seeded assignment/attendance windows. Uses payroll.generate when available;
 * otherwise inserts demo day-rate lines via admin.
 */
async function ensureDemoEventPayroll(
  context: AuthContext,
  input: {
    eventId: string;
    eventName: string;
    locationId: string;
    /** Event open window (period date_from / date_to). */
    periodFrom: string;
    periodTo: string;
    /** Seed attendance / assignment window (must overlap period). */
    seedFrom: string;
    seedTo: string;
  },
): Promise<{
  periodId: string | null;
  payrollLines: number;
  generatedVia: "payroll.generate" | "demo_day_rates" | "skipped";
  hint: string | null;
}> {
  await deleteEventPayrollForEvent(context, input.eventId);

  const label = eventPayrollBatchLabel(input.eventName);
  const month = eventPeriodMonthAnchor(input.periodFrom);
  const { data: period, error: periodErr } = await supabaseAdmin
    .from("hr_payroll_periods")
    .insert({
      month,
      date_from: input.periodFrom,
      date_to: input.periodTo,
      status: "draft",
      currency: "QAR",
      notes: `${EVENT_WORKFORCE_DEMO_MARKER} Demo event pay run ${input.periodFrom}→${input.periodTo} (seed ${input.seedFrom}→${input.seedTo})`,
      created_by: context.userId,
      period_kind: "event",
      event_id: input.eventId,
      display_name: label,
      source: "event_generated",
    })
    .select("id")
    .single();
  if (periodErr) {
    if (/period_kind|event_id|schema cache|does not exist/i.test(periodErr.message)) {
      return {
        periodId: null,
        payrollLines: 0,
        generatedVia: "skipped",
        hint: "Event payroll tables missing — apply latest migrations, then Generate on Payroll.",
      };
    }
    throw periodErr;
  }
  const periodId = period.id as string;

  await writeEventAudit(context, {
    action: "workforce_demo_payroll_period",
    entityType: "hr_payroll_period",
    eventId: input.eventId,
    locationId: input.locationId,
    after: {
      periodId,
      dateFrom: input.periodFrom,
      dateTo: input.periodTo,
      seedFrom: input.seedFrom,
      seedTo: input.seedTo,
    },
  });

  if (canUserDo(context.roles ?? [], "payroll.generate")) {
    try {
      const gen = await generatePayrollLines({ periodId });
      return {
        periodId,
        payrollLines: gen.inserted,
        generatedVia: "payroll.generate",
        hint:
          gen.inserted > 0
            ? null
            : gen.blockers
              ? `Pay period created but Generate inserted 0 lines — eligible ${gen.blockers.eligibleStaff}, overlapping pay-on-event ${gen.blockers.overlappingOpenWindow}, attendance days ${gen.blockers.attendanceDays}, with rates ${gen.blockers.staffWithDayRate}.`
              : "Pay period created but Generate inserted 0 lines — check assignments / day rates on Payroll.",
      };
    } catch (e) {
      // Fall through to demo day-rate lines so Payroll still shows amounts.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Missing capability|Forbidden|payroll\.generate/i.test(msg)) {
        // Non-auth failure: still try demo lines.
      }
    }
  }

  const lines = await insertDemoDayRatePayrollLines(context, {
    periodId,
    eventId: input.eventId,
    dateFrom: input.periodFrom,
    dateTo: input.periodTo,
  });
  return {
    periodId,
    payrollLines: lines,
    generatedVia: "demo_day_rates",
    hint:
      lines > 0
        ? null
        : "Pay period created with no lines — open Payroll and click Generate if you have payroll.generate.",
  };
}

/** Lightweight day-rate × paid attendance days so HOO can test Payroll without payroll.generate. */
async function insertDemoDayRatePayrollLines(
  context: AuthContext,
  input: { periodId: string; eventId: string; dateFrom: string; dateTo: string },
): Promise<number> {
  const { data: assigns, error: asgErr } = await supabaseAdmin
    .from("event_staff_assignments")
    .select("staff_id, day_rate_qar, pay_on_event_run, date_from, date_to")
    .eq("event_id", input.eventId)
    .eq("pay_on_event_run", true);
  if (asgErr) throw asgErr;

  const rateByStaff = new Map<string, number>();
  for (const a of assigns ?? []) {
    const staffId = a.staff_id as string;
    const from = String(a.date_from).slice(0, 10);
    const to = String(a.date_to).slice(0, 10);
    if (to < input.dateFrom || from > input.dateTo) continue;
    const rate = a.day_rate_qar == null ? 0 : Number(a.day_rate_qar);
    if (!(rate > 0)) continue;
    rateByStaff.set(staffId, rate);
  }
  if (!rateByStaff.size) return 0;

  const staffIds = [...rateByStaff.keys()];
  const { data: summaries, error: sumErr } = await supabaseAdmin
    .from("attendance_daily_summary")
    .select("staff_id, work_date, status, worked_minutes")
    .eq("event_id", input.eventId)
    .gte("work_date", input.dateFrom)
    .lte("work_date", input.dateTo)
    .in("staff_id", staffIds);
  if (sumErr && !/event_id|schema cache/i.test(sumErr.message)) throw sumErr;

  const paidDaysByStaff = new Map<string, number>();
  for (const row of summaries ?? []) {
    const status = String(row.status ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const paid =
      status === "present" ||
      status === "late" ||
      status === "overtime" ||
      status === "short_hours" ||
      (Number(row.worked_minutes ?? 0) > 0 &&
        (status === "incomplete" || status === "missed_punch"));
    if (!paid) continue;
    const staffId = row.staff_id as string;
    paidDaysByStaff.set(staffId, (paidDaysByStaff.get(staffId) ?? 0) + 1);
  }

  const inserts: TablesInsert<"hr_payroll_lines">[] = [];
  for (const [staffId, dayRate] of rateByStaff) {
    const workedDays = paidDaysByStaff.get(staffId) ?? 0;
    if (workedDays <= 0) continue;
    const gross = Math.round((dayRate * workedDays + Number.EPSILON) * 100) / 100;
    inserts.push({
      period_id: input.periodId,
      staff_id: staffId,
      payment_method: "cash",
      earnings: [
        {
          code: "basic",
          label: "Daily rate × paid days",
          amountQar: gross,
          meta: { dayRateQar: dayRate, workedDays, demo: true },
        },
      ] as unknown as Json,
      deductions: [] as unknown as Json,
      gross_qar: gross,
      net_qar: gross,
      wps_eligible: false,
      working_days: workedDays,
      notes: EVENT_WORKFORCE_DEMO_MARKER,
      snapshot: {
        presentDays: workedDays,
        dayRateQar: dayRate,
        demo: true,
        workingDays: workedDays,
        grossSalary: gross,
      } as unknown as Json,
      line_source: "generated",
    });
  }

  for (let i = 0; i < inserts.length; i += 80) {
    const chunk = inserts.slice(i, i + 80);
    const { error } = await supabaseAdmin.from("hr_payroll_lines").insert(chunk);
    if (error) throw error;
  }
  void context;
  return inserts.length;
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
  payrollPeriodId: string | null;
  payrollLines: number;
  payrollGeneratedVia: "payroll.generate" | "demo_day_rates" | "skipped";
  payrollHint: string | null;
};

async function runSeedEventWorkforceDemo(
  data: { eventId: string; dateFrom: string; dateTo: string },
  context: AuthContext,
): Promise<SeedEventWorkforceDemoResult> {
    const rangeErr = validateDemoDateRange(data.dateFrom, data.dateTo);
    if (rangeErr) throw new Error(rangeErr);

    const event = await loadEventOrThrow(context, data.eventId);
    const locationId = event.location_id as string;
    const eventName = String(event.name || event.event_name || "Event");
    const eventDates = {
      event_start: (event.event_start as string | null) ?? null,
      event_end: (event.event_end as string | null) ?? null,
      venue_access: (event.venue_access as string | null) ?? null,
      setup_start: (event.setup_start as string | null) ?? null,
      dismantle_end: (event.dismantle_end as string | null) ?? null,
    };
    // After wipe there is no workforce span yet — prefer declared open dates.
    const payWindow = resolveEventPayPeriodWindow({ event: eventDates });
    const open = payWindow.open;
    // Align seed assignments/attendance with the same window Create & generate uses.
    const seedWindow = resolveDemoSeedPayWindow({
      requestedFrom: data.dateFrom,
      requestedTo: data.dateTo,
      openFrom: payWindow.dateFrom,
      openTo: payWindow.dateTo,
    });
    const dateFrom = seedWindow.dateFrom;
    const dateTo = seedWindow.dateTo;
    const days = enumerateDatesInclusive(dateFrom, dateTo);

    // Full wipe so re-seed is idempotent (event-scoped only — includes payroll).
    await wipeEventWorkforceForEvent(context, data.eventId);

    const staff = await ensureDemoStaffPool(locationId, context.userId, dateFrom);
    const roleIdByCode = await ensureDemoRoles(context, data.eventId);

    // Day rates on compensation so Generate lines can pay even if assignment rate columns lag.
    const compensationRows = staff
      .filter((s) => s.dayRateQar != null && s.dayRateQar > 0)
      .map((s) => ({
        staff_id: s.id,
        daily_rate_qar: s.dayRateQar,
        monthly_salary_qar: null as number | null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }));
    for (let i = 0; i < compensationRows.length; i += 100) {
      const chunk = compensationRows.slice(i, i + 100);
      const { error: compErr } = await supabaseAdmin
        .from("staff_compensation")
        .upsert(chunk, { onConflict: "staff_id" });
      if (compErr && !/staff_compensation|schema cache|does not exist/i.test(compErr.message)) {
        throw compErr;
      }
    }

    // Assignments for the open-aligned seed window (must overlap event pay period).
    const assignmentRows = staff.map((s) => ({
      event_id: data.eventId,
      staff_id: s.id,
      assignment_type: "event_hire" as const,
      role_label: s.roleCode,
      event_role_id: roleIdByCode.get(s.roleCode) ?? null,
      hours_per_day: 10,
      day_rate_qar: s.dayRateQar,
      date_from: dateFrom,
      date_to: dateTo,
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
    type SlotInsert = TablesInsert<"event_schedule_slots">;
    const slotRows: SlotInsert[] = [];
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
        const legacy: SlotInsert[] = chunk.map(
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
    type PunchInsert = TablesInsert<"attendance_logs">;
    type SummaryInsert = TablesInsert<"attendance_daily_summary">;
    const punchRows: PunchInsert[] = [];
    const summaryRows: SummaryInsert[] = [];

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
        // Runtime schema may lag event_id column — retry without event_id.
        if (/event_id|schema cache/i.test(error.message)) {
          const stripped: PunchInsert[] = chunk.map(({ event_id: _e, ...rest }) => rest);
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

    // Period dates must match seeded assignment/attendance window (not a wider open
    // range) so Create & generate does not sync away from eligible staff.
    const payroll = await ensureDemoEventPayroll(context, {
      eventId: data.eventId,
      eventName,
      locationId,
      periodFrom: dateFrom,
      periodTo: dateTo,
      seedFrom: dateFrom,
      seedTo: dateTo,
    });

    const windowHintParts: string[] = [];
    if (seedWindow.usedOpenFallback) {
      windowHintParts.push(
        `Requested From–To was outside event open dates — seeded ${dateFrom}→${dateTo} (open window).`,
      );
    } else if (seedWindow.clippedToMaxDays) {
      windowHintParts.push(`Seed clipped to ${days.length} days within event open dates.`);
    } else if (dateFrom !== data.dateFrom || dateTo !== data.dateTo) {
      windowHintParts.push(`Seed aligned to event open overlap ${dateFrom}→${dateTo}.`);
    }
    const payrollHint = [payroll.hint, ...windowHintParts].filter(Boolean).join(" ") || null;

    await writeEventAudit(context, {
      action: "workforce_demo_seed",
      entityType: "event_workforce_demo",
      eventId: data.eventId,
      locationId,
      after: {
        requestedFrom: data.dateFrom,
        requestedTo: data.dateTo,
        dateFrom,
        dateTo,
        openFrom: open.dateFrom,
        openTo: open.dateTo,
        days: days.length,
        staff: staff.length,
        shifts: shiftsInserted,
        attendanceDays,
        punches,
        payrollPeriodId: payroll.periodId,
        payrollLines: payroll.payrollLines,
        payrollGeneratedVia: payroll.generatedVia,
        usedOpenFallback: seedWindow.usedOpenFallback,
      },
    });

    return {
      eventId: data.eventId,
      eventName,
      locationId,
      dateFrom,
      dateTo,
      days: days.length,
      staffEnsured: staff.length,
      rolesUpserted: roleIdByCode.size,
      assignments: assignmentRows.length,
      shifts: shiftsInserted,
      attendanceDays,
      punches,
      payrollPeriodId: payroll.periodId,
      payrollLines: payroll.payrollLines,
      payrollGeneratedVia: payroll.generatedVia,
      payrollHint,
    };
}

/**
 * Seed demo roles, crew, shifts, attendance, and event payroll for one event across From–To.
 * Fully clears prior event workforce + event payroll first. Does not touch monthly roster.
 */
export const seedEventWorkforceDemo = createAuthenticatedAction(
  z.object({
    eventId: Uuid,
    dateFrom: Ymd,
    dateTo: Ymd,
  }),
  async (data, context): Promise<SeedEventWorkforceDemoResult> => {
    assertHoo(context);
    return runSeedEventWorkforceDemo(data, context);
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
  payrollPeriods: number;
  payrollLines: number;
};

/**
 * Delete attendance, shifts, assignments, roles, and event payroll for the selected event.
 * Does not delete the event. Does not touch monthly roster / Place Vendôme monthly data.
 */
export const deleteEventWorkforceDemo = createAuthenticatedAction(
  z.object({
    eventId: Uuid,
    confirmation: z.string().max(80),
    /**
     * When true (default), clears all event-scoped workforce + payroll.
     * When false, prefers demo-marked rows but still falls back to full event wipe
     * for assignments/shifts/attendance when markers are absent, and always clears payroll.
     */
    wipeAllEventWorkforce: z.boolean().optional(),
  }),
  async (data, context): Promise<DeleteEventWorkforceDemoResult> => {
    assertHoo(context);
    assertDemoDeleteConfirmation(data.confirmation);
    const event = await loadEventOrThrow(context, data.eventId);
    const locationId = event.location_id as string;

    const wipeAll = data.wipeAllEventWorkforce !== false;
    const result = await wipeEventWorkforceForEvent(context, data.eventId, {
      demoMarkedOnly: !wipeAll,
    });

    await writeEventAudit(context, {
      action: wipeAll ? "workforce_demo_wipe" : "workforce_demo_delete",
      entityType: "event_workforce_demo",
      eventId: data.eventId,
      locationId,
      after: result,
    });
    return { eventId: data.eventId, ...result };
  },
  { auth: { anyCapability: ["events.edit", "events.view", "attendance.view", "people.view_roster"] } },
);

/**
 * Convenience: full wipe then seed for the current From–To (same as Seed after strengthened clear).
 */
export const resetAndSeedEventWorkforceDemo = createAuthenticatedAction(
  z.object({
    eventId: Uuid,
    dateFrom: Ymd,
    dateTo: Ymd,
    confirmation: z.string().max(80),
  }),
  async (data, context): Promise<SeedEventWorkforceDemoResult> => {
    assertHoo(context);
    assertDemoDeleteConfirmation(data.confirmation);
    // runSeed already full-wipes then dumps; confirmation gates the Reset & seed UX.
    return runSeedEventWorkforceDemo(
      {
        eventId: data.eventId,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      },
      context,
    );
  },
  { auth: { anyCapability: ["events.edit", "events.view", "attendance.view", "people.view_roster"] } },
);
