"use server";

import { z } from "zod";

import { canUserDo, type AppRole } from "@/lib/rbac";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { assertAttendanceRosterLocation } from "@/lib/attendance-hr/roster-apply";
import {
  loadActiveShiftTemplates,
  resolveOrCreateShiftTemplate,
} from "@/lib/attendance-hr/roster-amend";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import { parseTimeCell } from "@/lib/attendance-hr/roster-upload";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function parseHm(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return parseTimeCell(value) ?? (/^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null);
}

export type RosterRegisterRow = {
  id: string;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  qid: string | null;
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftTemplateId: string | null;
  isWeekOff: boolean;
  source: string;
};

function assertCanAmendRoster(roles: AppRole[] | string[] | undefined) {
  const list = (roles ?? []) as AppRole[];
  if (
    canUserDo(list, "people.import_roster") ||
    canUserDo(list, "people.edit_roster") ||
    canUserDo(list, "daily_ops.roster.upload")
  ) {
    return;
  }
  throw new ForbiddenError("Forbidden: missing capability to amend the shift roster.");
}

function assertCanViewRosterRegister(roles: AppRole[] | string[] | undefined) {
  const list = (roles ?? []) as AppRole[];
  if (
    canUserDo(list, "people.view_roster") ||
    canUserDo(list, "people.import_roster") ||
    canUserDo(list, "people.edit_roster") ||
    canUserDo(list, "daily_ops.roster.upload") ||
    canUserDo(list, "attendance.view")
  ) {
    return;
  }
  throw new ForbiddenError("Forbidden: missing capability to view the shift roster.");
}

export const listUploadedRosterAssignments = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    staffId: z.string().uuid().nullable().optional(),
    dateFrom: ymd,
    dateTo: ymd,
    /** When true, only upload + amend rows (legacy import register). */
    sourceUploadOnly: z.boolean().optional().default(false),
    /** Optional single-source filter. Ignored when sourceUploadOnly is true. */
    source: z.enum(["upload", "amend", "manual"]).nullable().optional(),
  }),
  async (data, context) => {
    assertCanViewRosterRegister(context.roles);
    if (data.locationId) await assertAttendanceRosterLocation(context, data.locationId);

    let q = context.supabase
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date, shift_template_id, is_week_off, source, created_at")
      .gte("work_date", data.dateFrom)
      .lte("work_date", data.dateTo)
      .order("work_date", { ascending: true })
      .order("staff_id", { ascending: true })
      .limit(5000);

    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.staffId) q = q.eq("staff_id", data.staffId);
    if (data.sourceUploadOnly) q = q.in("source", ["upload", "amend"]);
    else if (data.source) q = q.eq("source", data.source);

    const { data: rows, error } = await q;
    if (error) throw error;
    const assignments = rows ?? [];

    const staffIds = [...new Set(assignments.map((row) => String(row.staff_id)).filter(Boolean))];
    const locationIds = [...new Set(assignments.map((row) => String(row.location_id)).filter(Boolean))];
    const shiftIds = [
      ...new Set(
        assignments
          .map((row) => row.shift_template_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [staffRes, locRes, shiftRes] = await Promise.all([
      staffIds.length
        ? context.supabase.from("staff").select("id, full_name, employee_code, qid").in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
      locationIds.length
        ? context.supabase.from("locations").select("id, code, name").in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      shiftIds.length
        ? context.supabase
            .from("attendance_shift_templates")
            .select("id, start_time, end_time, name")
            .in("id", shiftIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (staffRes.error) throw staffRes.error;
    if (locRes.error) throw locRes.error;
    if (shiftRes.error) throw shiftRes.error;

    const staffById = new Map((staffRes.data ?? []).map((row) => [String(row.id), row]));
    const locById = new Map((locRes.data ?? []).map((row) => [String(row.id), row]));
    const shiftById = new Map((shiftRes.data ?? []).map((row) => [String(row.id), row]));

    const mapped: RosterRegisterRow[] = assignments.map((row) => {
      const staff = staffById.get(String(row.staff_id));
      const loc = locById.get(String(row.location_id));
      const shift = row.shift_template_id ? shiftById.get(String(row.shift_template_id)) : undefined;
      return {
        id: String(row.id),
        locationId: String(row.location_id),
        locationCode: (loc?.code as string | null | undefined) ?? null,
        locationName: (loc?.name as string | null | undefined) ?? null,
        staffId: String(row.staff_id),
        staffName: (staff?.full_name as string | null | undefined) ?? null,
        employeeCode: (staff?.employee_code as string | null | undefined) ?? null,
        qid: (staff?.qid as string | null | undefined) ?? null,
        workDate: String(row.work_date).slice(0, 10),
        shiftStart: shift?.start_time ? String(shift.start_time).slice(0, 5) : null,
        shiftEnd: shift?.end_time ? String(shift.end_time).slice(0, 5) : null,
        shiftTemplateId: (row.shift_template_id as string | null) ?? null,
        isWeekOff: Boolean(row.is_week_off),
        source: String(row.source ?? "manual"),
      };
    });

    return {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      count: mapped.length,
      rows: mapped,
    };
  },
  {
    auth: {
      anyCapability: [
        "people.view_roster",
        "people.import_roster",
        "people.edit_roster",
        "daily_ops.roster.upload",
        "attendance.view",
      ],
    },
  },
);

export const updateRosterAssignment = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    shiftStart: z.string().nullable().optional(),
    shiftEnd: z.string().nullable().optional(),
    isWeekOff: z.boolean().optional(),
  }),
  async (data, context) => {
    assertCanAmendRoster(context.roles);

    const { data: existing, error: fetchErr } = await context.supabase
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date, shift_template_id, is_week_off, source")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw fetchErr ?? new Error("Roster row not found");

    await assertAttendanceRosterLocation(context, existing.location_id);

    const isWeekOff = data.isWeekOff ?? Boolean(existing.is_week_off);
    let shiftTemplateId: string | null = null;
    let shiftStart: string | null = null;
    let shiftEnd: string | null = null;

    if (!isWeekOff) {
      const shifts = await loadActiveShiftTemplates(context.supabase);
      const current = shifts.find((s) => s.id === existing.shift_template_id);
      const incomingStart = data.shiftStart !== undefined ? parseHm(data.shiftStart) : undefined;
      const incomingEnd = data.shiftEnd !== undefined ? parseHm(data.shiftEnd) : undefined;
      shiftStart = incomingStart !== undefined ? incomingStart : (current ? String(current.start_time).slice(0, 5) : null);
      shiftEnd = incomingEnd !== undefined ? incomingEnd : (current ? String(current.end_time).slice(0, 5) : null);
      if (!shiftStart || !shiftEnd) {
        throw new Error("On-duty rows need both shift start and end times.");
      }
      const resolved = await resolveOrCreateShiftTemplate(context.supabase, {
        locationId: existing.location_id,
        shiftStart,
        shiftEnd,
        shifts,
      });
      shiftTemplateId = resolved.shiftTemplateId;
    }

    const { error: updErr } = await context.supabase
      .from("attendance_roster_assignments")
      .update({
        is_week_off: isWeekOff,
        shift_template_id: isWeekOff ? null : shiftTemplateId,
        source: existing.source === "upload" || existing.source === "amend" ? "amend" : existing.source,
      })
      .eq("id", data.id);
    if (updErr) throw updErr;

    const workDate = String(existing.work_date).slice(0, 10);
    await recalculateAttendanceRange(context.supabase, existing.location_id, workDate, workDate, {
      staffIds: [existing.staff_id],
    });

    return {
      id: data.id,
      isWeekOff,
      shiftStart: isWeekOff ? null : shiftStart,
      shiftEnd: isWeekOff ? null : shiftEnd,
      shiftTemplateId: isWeekOff ? null : shiftTemplateId,
    };
  },
  { auth: { anyCapability: ["people.import_roster", "people.edit_roster", "daily_ops.roster.upload"] } },
);

export const deleteRosterAssignment = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    assertCanAmendRoster(context.roles);

    const { data: existing, error: fetchErr } = await context.supabase
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw fetchErr ?? new Error("Roster row not found");

    await assertAttendanceRosterLocation(context, existing.location_id);

    const { error: delErr } = await context.supabase
      .from("attendance_roster_assignments")
      .delete()
      .eq("id", data.id);
    if (delErr) throw delErr;

    const workDate = String(existing.work_date).slice(0, 10);
    await recalculateAttendanceRange(context.supabase, existing.location_id, workDate, workDate, {
      staffIds: [existing.staff_id],
    });

    return { ok: true as const, id: data.id };
  },
  { auth: { anyCapability: ["people.import_roster", "people.edit_roster", "daily_ops.roster.upload"] } },
);
