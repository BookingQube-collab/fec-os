"use server";

import { z } from "zod";

import { parseCsv } from "@/lib/csv-parse";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const LocFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .default({});

const ATTENDANCE_STATUSES = ["present", "absent", "late", "early_leave", "missed_punch", "overtime"] as const;

export const listAttendanceDevices = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("attendance_devices")
      .select("id, location_id, device_code, device_name, vendor, active, last_sync_at")
      .order("device_name");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "attendance.view" } },
);

export const registerAttendanceDevice = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    deviceCode: z.string().min(1).max(50),
    deviceName: z.string().min(1).max(200),
    vendor: z.string().max(50).default("zkteco"),
    ipAddress: z.string().max(50).optional(),
    serialNumber: z.string().max(100).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const { data: row, error } = await context.supabase
      .from("attendance_devices")
      .insert({
        location_id: data.locationId,
        device_code: data.deviceCode,
        device_name: data.deviceName,
        vendor: data.vendor,
        ip_address: data.ipAddress ?? null,
        serial_number: data.serialNumber ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "attendance.manage_devices" } },
);

export const listAttendanceDailySummary = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    const from = data.dateFrom ?? new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const to = data.dateTo ?? new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("attendance_daily_summary")
      .select("id, location_id, staff_id, work_date, status, late_minutes, early_leave_minutes, overtime_minutes, missed_punch, actual_in, actual_out, scheduled_in, scheduled_out")
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: false });
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows?.length) return [];

    const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
    const { data: staff } = staffIds.length
      ? await context.supabase.from("staff").select("id, full_name, employee_code").in("id", staffIds)
      : { data: [] };
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));

    return rows.map((r) => ({
      ...r,
      staff: r.staff_id ? staffMap.get(r.staff_id) ?? null : null,
    }));
  },
  { defaultInput: {}, auth: { capability: "attendance.view" } },
);

export const listAttendanceExceptions = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("attendance_exceptions")
      .select("id, summary_id, location_id, staff_id, exception_type, description, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows?.length) return [];

    const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
    const { data: staff } = staffIds.length
      ? await context.supabase.from("staff").select("id, full_name").in("id", staffIds)
      : { data: [] };
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));
    return rows.map((r) => ({ ...r, staff: r.staff_id ? staffMap.get(r.staff_id) ?? null : null }));
  },
  { defaultInput: {}, auth: { capability: "attendance.view" } },
);

export const importAttendanceCsv = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    csvText: z.string().min(10).max(2_000_000),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const rows = parseCsv(data.csvText);
    let inserted = 0;

    for (const row of rows) {
      const biometricId = row.biometric_user_id ?? row.employee_code ?? row.user_id;
      const punchAt = row.punch_at ?? row.timestamp ?? row.datetime;
      if (!biometricId || !punchAt) continue;

      let staffId: string | null = null;
      const { data: staff } = await context.supabase
        .from("staff")
        .select("id")
        .eq("location_id", data.locationId)
        .eq("employee_code", biometricId)
        .maybeSingle();
      staffId = staff?.id ?? null;

      const { error } = await context.supabase.from("attendance_logs").insert({
        location_id: data.locationId,
        staff_id: staffId,
        biometric_user_id: biometricId,
        punch_at: new Date(punchAt).toISOString(),
        punch_type: (row.punch_type ?? row.type ?? "in").toLowerCase(),
        source: "csv_import",
        raw_payload: row,
      });
      if (!error) inserted += 1;
    }

    await context.supabase.rpc("log_audit", {
      _action: "attendance.csv_imported",
      _table_name: "attendance_logs",
      _row_id: data.locationId,
      _after: { rows: inserted },
      _metadata: {},
    });

    return { inserted, total: rows.length };
  },
  { auth: { capability: "attendance.import" } },
);

export const requestAttendanceCorrection = createAuthenticatedAction(
  z.object({
    summaryId: z.string().uuid(),
    exceptionType: z.enum(ATTENDANCE_STATUSES),
    description: z.string().max(500),
    correctionIn: z.string().datetime().optional(),
    correctionOut: z.string().datetime().optional(),
  }),
  async (data, context) => {
    const { data: summary, error: sErr } = await context.supabase
      .from("attendance_daily_summary")
      .select("location_id, staff_id")
      .eq("id", data.summaryId)
      .single();
    if (sErr) throw sErr;
    await assertLocationAccess(context, summary.location_id);

    const { data: row, error } = await context.supabase
      .from("attendance_exceptions")
      .insert({
        summary_id: data.summaryId,
        location_id: summary.location_id,
        staff_id: summary.staff_id,
        exception_type: data.exceptionType,
        description: data.description,
        requested_by: context.userId,
        correction_in: data.correctionIn ?? null,
        correction_out: data.correctionOut ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "attendance.correct" } },
);

export const approveAttendanceCorrection = createAuthenticatedAction(
  z.object({ exceptionId: z.string().uuid() }),
  async (data, context) => {
    const { data: exc, error: eErr } = await context.supabase
      .from("attendance_exceptions")
      .select("id, summary_id, location_id, correction_in, correction_out")
      .eq("id", data.exceptionId)
      .single();
    if (eErr) throw eErr;
    await assertLocationAccess(context, exc.location_id);

    const { error: updErr } = await context.supabase
      .from("attendance_exceptions")
      .update({ status: "approved", approved_by: context.userId })
      .eq("id", data.exceptionId);
    if (updErr) throw updErr;

    if (exc.correction_in || exc.correction_out) {
      await context.supabase
        .from("attendance_daily_summary")
        .update({
          actual_in: exc.correction_in ?? undefined,
          actual_out: exc.correction_out ?? undefined,
          status: "corrected",
        })
        .eq("id", exc.summary_id);
    }

    return { ok: true };
  },
  { auth: { capability: "attendance.approve" } },
);

export const createAttendanceSummary = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    staffId: z.string().uuid(),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(ATTENDANCE_STATUSES).default("present"),
    lateMinutes: z.number().int().min(0).default(0),
    missedPunch: z.boolean().default(false),
    actualIn: z.string().datetime().optional(),
    actualOut: z.string().datetime().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const { data: row, error } = await context.supabase
      .from("attendance_daily_summary")
      .insert({
        location_id: data.locationId,
        staff_id: data.staffId,
        work_date: data.workDate,
        status: data.status,
        late_minutes: data.lateMinutes,
        missed_punch: data.missedPunch,
        actual_in: data.actualIn ?? null,
        actual_out: data.actualOut ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { capability: "attendance.correct" } },
);

export const updateAttendanceSummary = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(ATTENDANCE_STATUSES).optional(),
    lateMinutes: z.number().int().min(0).optional(),
    missedPunch: z.boolean().optional(),
    actualIn: z.string().datetime().nullable().optional(),
    actualOut: z.string().datetime().nullable().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("attendance_daily_summary")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const patch: {
      status?: (typeof ATTENDANCE_STATUSES)[number];
      late_minutes?: number;
      missed_punch?: boolean;
      actual_in?: string | null;
      actual_out?: string | null;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.lateMinutes !== undefined) patch.late_minutes = data.lateMinutes;
    if (data.missedPunch !== undefined) patch.missed_punch = data.missedPunch;
    if (data.actualIn !== undefined) patch.actual_in = data.actualIn;
    if (data.actualOut !== undefined) patch.actual_out = data.actualOut;

    const { error } = await context.supabase
      .from("attendance_daily_summary")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "attendance.correct" } },
);

export const deleteAttendanceSummary = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("attendance_daily_summary")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const { error } = await context.supabase
      .from("attendance_daily_summary")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "attendance.correct" } },
);

export const generateAttendanceSummary = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const dayStart = `${data.workDate}T00:00:00+03:00`;
    const dayEnd = `${data.workDate}T23:59:59+03:00`;
    const graceMs = 10 * 60 * 1000;

    const [{ data: shifts }, { data: logs }] = await Promise.all([
      context.supabase
        .from("shifts")
        .select("id, user_id, starts_at, ends_at, clock_in_at, clock_out_at")
        .eq("location_id", data.locationId)
        .gte("starts_at", dayStart)
        .lte("starts_at", dayEnd),
      context.supabase
        .from("attendance_logs")
        .select("staff_id, punch_at, punch_type")
        .eq("location_id", data.locationId)
        .gte("punch_at", dayStart)
        .lte("punch_at", dayEnd),
    ]);

    let processed = 0;
    for (const shift of shifts ?? []) {
      if (!shift.user_id) continue;

      const { data: staff } = await context.supabase
        .from("staff")
        .select("id")
        .eq("user_id", shift.user_id)
        .eq("location_id", data.locationId)
        .maybeSingle();
      const staffId = staff?.id ?? null;
      if (!staffId) continue;

      const staffLogs = (logs ?? []).filter((l) => l.staff_id === staffId);
      const ins = staffLogs.filter((l) => l.punch_type === "in").map((l) => new Date(l.punch_at).getTime());
      const outs = staffLogs.filter((l) => l.punch_type === "out").map((l) => new Date(l.punch_at).getTime());

      const actualIn = ins.length ? new Date(Math.min(...ins)).toISOString() : shift.clock_in_at;
      const actualOut = outs.length ? new Date(Math.max(...outs)).toISOString() : shift.clock_out_at;

      let status = "present";
      let lateMinutes = 0;
      if (!actualIn && new Date(shift.starts_at) < new Date()) status = "absent";
      else if (actualIn) {
        const late = new Date(actualIn).getTime() - new Date(shift.starts_at).getTime() - graceMs;
        if (late > 0) {
          status = "late";
          lateMinutes = Math.round(late / 60000);
        }
      }

      const missedPunch = !actualIn || !actualOut;

      await context.supabase.from("attendance_daily_summary").upsert(
        {
          location_id: data.locationId,
          staff_id: staffId,
          user_id: shift.user_id,
          work_date: data.workDate,
          shift_id: shift.id,
          scheduled_in: shift.starts_at,
          scheduled_out: shift.ends_at,
          actual_in: actualIn,
          actual_out: actualOut,
          status,
          late_minutes: lateMinutes,
          missed_punch: missedPunch,
        },
        { onConflict: "location_id,staff_id,work_date" },
      );
      processed += 1;
    }

    return { processed };
  },
  { auth: { capability: "attendance.import" } },
);
