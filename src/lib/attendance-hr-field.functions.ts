"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createAuthenticatedAction, createAuthenticatedActionNoInput, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import { DEFAULT_GEOFENCE_RADIUS_METERS, evaluateGeofence, pickNearestFence, SITE_GEOFENCE_DEFAULTS } from "@/lib/attendance-hr/geofence";
import { DEFAULT_HR_NOTIFY_TOGGLES } from "@/lib/attendance-hr/hr-notify";
import { dispatchHrNotify } from "@/lib/attendance-hr/hr-notify-dispatch";
import { aggregatePayrollRows, type PayrollDayInput } from "@/lib/attendance-hr/payroll";
import { DEFAULT_RULES } from "@/lib/attendance-hr/constants";

const FACE_BUCKET = "staff-faces";

async function assertSite(context: AuthContext, locationId: string) {
  if (canUserDo(context.roles ?? [], "attendance.view_all")) return;
  await assertLocationAccess(context, locationId);
}

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

const defaultFieldSettings = {
  defaultGeofenceRadiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
  notifyMissedPunch: DEFAULT_HR_NOTIFY_TOGGLES.notifyMissedPunch,
  notifyLate: DEFAULT_HR_NOTIFY_TOGGLES.notifyLate,
  notifyGeofenceExit: DEFAULT_HR_NOTIFY_TOGGLES.notifyGeofenceExit,
  notifyCorrections: DEFAULT_HR_NOTIFY_TOGGLES.notifyCorrections,
  requireGpsOnCheckin: true,
  requireFaceOnCheckin: false,
  faceLivenessRequired: true,
  duplicateWindowSeconds: DEFAULT_RULES.duplicateWindowSeconds,
};

async function readFieldSettings(context: AuthContext) {
  const [{ data: row, error }, { data: rules }] = await Promise.all([
    context.supabase.from("hr_field_settings").select("*").limit(1).maybeSingle(),
    context.supabase.from("attendance_rule_sets").select("duplicate_window_seconds, scope").order("scope").limit(5),
  ]);
  if (error && !tableMissing(error.message)) throw error;
  const globalRule = (rules ?? []).find((r) => r.scope === "global");
  return {
    id: row?.id ?? null,
    companyId: row?.company_id ?? null,
    ...defaultFieldSettings,
    defaultGeofenceRadiusMeters: Number(row?.default_geofence_radius_meters ?? DEFAULT_GEOFENCE_RADIUS_METERS),
    notifyMissedPunch: row?.notify_missed_punch !== false,
    notifyLate: row?.notify_late !== false,
    notifyGeofenceExit: row?.notify_geofence_exit !== false,
    notifyCorrections: row?.notify_corrections !== false,
    requireGpsOnCheckin: row?.require_gps_on_checkin !== false,
    requireFaceOnCheckin: Boolean(row?.require_face_on_checkin),
    faceLivenessRequired: row?.face_liveness_required !== false,
    duplicateWindowSeconds: Number(globalRule?.duplicate_window_seconds ?? DEFAULT_RULES.duplicateWindowSeconds),
    knownCoordinates: SITE_GEOFENCE_DEFAULTS,
  };
}

export const getHrFieldSettings = createAuthenticatedActionNoInput(
  async (context) => readFieldSettings(context),
  { auth: { capability: "attendance.view" } },
);

export const saveHrFieldSettings = createAuthenticatedAction(
  z.object({
    defaultGeofenceRadiusMeters: z.number().int().min(20).max(20000).default(DEFAULT_GEOFENCE_RADIUS_METERS),
    notifyMissedPunch: z.boolean().default(true),
    notifyLate: z.boolean().default(true),
    notifyGeofenceExit: z.boolean().default(true),
    notifyCorrections: z.boolean().default(true),
    requireGpsOnCheckin: z.boolean().default(true),
    requireFaceOnCheckin: z.boolean().default(false),
    faceLivenessRequired: z.boolean().default(true),
    duplicateWindowSeconds: z.number().int().min(0).max(600).optional(),
  }),
  async (data, context) => {
    const { data: company } = await context.supabase.from("hr_companies").select("id").eq("active", true).limit(1).maybeSingle();
    const payload = {
      company_id: company?.id ?? null,
      default_geofence_radius_meters: data.defaultGeofenceRadiusMeters,
      notify_missed_punch: data.notifyMissedPunch,
      notify_late: data.notifyLate,
      notify_geofence_exit: data.notifyGeofenceExit,
      notify_corrections: data.notifyCorrections,
      require_gps_on_checkin: data.requireGpsOnCheckin,
      require_face_on_checkin: data.requireFaceOnCheckin,
      face_liveness_required: data.faceLivenessRequired,
    };
    const existing = await context.supabase.from("hr_field_settings").select("id").limit(1).maybeSingle();
    if (existing.data?.id) {
      const { error } = await context.supabase.from("hr_field_settings").update(payload).eq("id", existing.data.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("hr_field_settings").insert(payload);
      if (error) throw error;
    }
    if (data.duplicateWindowSeconds != null) {
      const { data: globalRule } = await context.supabase
        .from("attendance_rule_sets")
        .select("id")
        .eq("scope", "global")
        .limit(1)
        .maybeSingle();
      if (globalRule?.id) {
        await context.supabase
          .from("attendance_rule_sets")
          .update({ duplicate_window_seconds: data.duplicateWindowSeconds })
          .eq("id", globalRule.id);
      }
    }
    return { ok: true };
  },
  { auth: { capability: "attendance.configure" } },
);

export const listAttendanceGeofences = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("attendance_geofences")
      .select("id, location_id, name, latitude, longitude, radius_meters, mode, active, notes, locations(id, code, name, region)")
      .order("name");
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (data ?? []).map((row) => {
      const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      return {
        id: row.id as string,
        locationId: row.location_id as string,
        name: row.name as string,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        radiusMeters: Number(row.radius_meters),
        mode: (row.mode as "operate" | "restrict") ?? "operate",
        active: Boolean(row.active),
        notes: (row.notes as string | null) ?? null,
        locationCode: (loc as { code?: string } | null)?.code ?? null,
        locationName: (loc as { name?: string } | null)?.name ?? null,
        locationRegion: (loc as { region?: string } | null)?.region ?? null,
      };
    });
  },
  { auth: { capability: "attendance.view" } },
);

export const saveAttendanceGeofence = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    name: z.string().min(1).max(80),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusMeters: z.number().int().min(20).max(20000).default(DEFAULT_GEOFENCE_RADIUS_METERS),
    mode: z.enum(["operate", "restrict"]).default("operate"),
    active: z.boolean().default(true),
    notes: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    await assertSite(context, data.locationId);
    const payload = {
      location_id: data.locationId,
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      radius_meters: data.radiusMeters,
      mode: data.mode,
      active: data.active,
      notes: data.notes ?? null,
    };
    const { error } = await context.supabase.from("attendance_geofences").upsert(payload, { onConflict: "location_id" });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "attendance.configure" } },
);

export const listStaffLocationEvents = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    limit: z.number().int().min(1).max(200).default(80),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("staff_location_events")
      .select(
        "id, staff_id, location_id, geofence_id, latitude, longitude, accuracy_meters, inside_geofence, distance_meters, event_type, recorded_at, source, queued_offline, face_status, face_liveness_passed, staff(full_name, employee_code, is_roaming), locations(code, name)",
      )
      .order("recorded_at", { ascending: false })
      .limit(data.limit);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((row) => {
      const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      return {
        id: row.id as string,
        staffId: row.staff_id as string,
        staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
        employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
        isRoaming: Boolean((staff as { is_roaming?: boolean } | null)?.is_roaming),
        locationId: (row.location_id as string | null) ?? null,
        locationLabel: loc
          ? `${(loc as { code?: string }).code ?? ""} ${(loc as { name?: string }).name ?? ""}`.trim()
          : null,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        accuracyMeters: row.accuracy_meters == null ? null : Number(row.accuracy_meters),
        insideGeofence: row.inside_geofence as boolean | null,
        distanceMeters: row.distance_meters == null ? null : Number(row.distance_meters),
        eventType: String(row.event_type),
        recordedAt: String(row.recorded_at),
        source: String(row.source ?? "web"),
        queuedOffline: Boolean(row.queued_offline),
        faceStatus: String(row.face_status ?? "not_required"),
        faceLivenessPassed: row.face_liveness_passed as boolean | null,
      };
    });
  },
  { auth: { capability: "attendance.view" } },
);

export const listStaffLastKnownLocations = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("staff_location_events")
      .select(
        "id, staff_id, location_id, latitude, longitude, inside_geofence, distance_meters, event_type, recorded_at, staff(full_name, employee_code, is_roaming, location_id), locations(code, name)",
      )
      .order("recorded_at", { ascending: false })
      .limit(400);
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    const seen = new Set<string>();
    const out: Array<{
      staffId: string;
      staffName: string | null;
      employeeCode: string | null;
      isRoaming: boolean;
      locationLabel: string | null;
      latitude: number;
      longitude: number;
      insideGeofence: boolean | null;
      distanceMeters: number | null;
      eventType: string;
      recordedAt: string;
    }> = [];
    for (const row of data ?? []) {
      const staffId = String(row.staff_id);
      if (seen.has(staffId)) continue;
      seen.add(staffId);
      const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      out.push({
        staffId,
        staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
        employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
        isRoaming: Boolean((staff as { is_roaming?: boolean } | null)?.is_roaming),
        locationLabel: loc
          ? `${(loc as { code?: string }).code ?? ""} ${(loc as { name?: string }).name ?? ""}`.trim()
          : null,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        insideGeofence: row.inside_geofence as boolean | null,
        distanceMeters: row.distance_meters == null ? null : Number(row.distance_meters),
        eventType: String(row.event_type),
        recordedAt: String(row.recorded_at),
      });
    }
    return out;
  },
  { auth: { capability: "attendance.view" } },
);

function decodeImageDataUrl(raw: string): { bytes: Buffer; contentType: string } {
  const match = raw.trim().match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error("Photo must be a JPEG, PNG, or WebP data URL.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 900_000) throw new Error("Photo is too large.");
  if (bytes.length < 80) throw new Error("Photo is empty.");
  return { bytes, contentType: match[1].toLowerCase() };
}

async function storeFacePhoto(path: string, dataUrl: string) {
  const { bytes, contentType } = decodeImageDataUrl(dataUrl);
  const { error } = await supabaseAdmin.storage.from(FACE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export const submitFieldCheckIn = createAuthenticatedAction(
  z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(50000).nullable().optional(),
    eventType: z.enum(["check_in", "check_out", "ping"]).default("check_in"),
    locationId: z.string().uuid().nullable().optional(),
    clientEventId: z.string().uuid().optional(),
    recordedAt: z.string().optional(),
    queuedOffline: z.boolean().optional(),
    faceLivenessPassed: z.boolean().nullable().optional(),
    photoBase64: z.string().max(1_400_000).nullable().optional(),
  }),
  async (data, context) => {
    const staff = await myStaff(context);
    if (!staff) {
      throw new ForbiddenError("Your login is not linked to a staff record, so GPS check-in is not available.");
    }
    const settings = await readFieldSettings(context);
    if (settings.requireFaceOnCheckin && data.eventType !== "ping") {
      if (settings.faceLivenessRequired && data.faceLivenessPassed !== true) {
        throw new Error("Face liveness check is required for this check-in.");
      }
    }
    const { data: fences, error: fenceErr } = await context.supabase
      .from("attendance_geofences")
      .select("id, location_id, name, latitude, longitude, radius_meters, mode, active")
      .eq("active", true);
    if (fenceErr && !tableMissing(fenceErr.message)) throw fenceErr;

    const point = { latitude: data.latitude, longitude: data.longitude };
    const active = (fences ?? []).map((row) => ({
      id: row.id as string,
      locationId: row.location_id as string,
      name: row.name as string,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      radiusMeters: Number(row.radius_meters),
      mode: (row.mode as "operate" | "restrict") ?? "operate",
    }));
    const preferred = data.locationId ? active.filter((f) => f.locationId === data.locationId) : active;
    const nearest = pickNearestFence(point, preferred.length ? preferred : active);
    const evaluation = nearest ? nearest.evaluation : data.locationId
      ? evaluateGeofence(point, {
          latitude: Number.NaN,
          longitude: Number.NaN,
          radiusMeters: settings.defaultGeofenceRadiusMeters,
        })
      : null;

    const locationId = nearest?.fence.locationId ?? data.locationId ?? staff.location_id;
    if (locationId) await assertSite(context, locationId);

    let eventType = data.eventType as string;
    if (nearest?.evaluation.violation) {
      eventType = nearest.evaluation.eventType === "restricted" ? "restricted" : "geofence_exit";
    }

    const clientEventId = data.clientEventId ?? crypto.randomUUID();
    if (data.clientEventId) {
      const { data: existing } = await context.supabase
        .from("staff_location_events")
        .select("id")
        .eq("client_event_id", data.clientEventId)
        .maybeSingle();
      if (existing?.id) return { id: existing.id as string, duplicate: true, eventType, inside: nearest?.evaluation.inside ?? null };
    }

    let photoPath: string | null = null;
    let faceStatus = "not_required";
    if (data.photoBase64) {
      photoPath = await storeFacePhoto(`${staff.id}/${clientEventId}.jpg`, data.photoBase64);
      faceStatus = data.faceLivenessPassed === false ? "liveness_failed" : "captured";
    } else if (settings.requireFaceOnCheckin && data.eventType !== "ping") {
      faceStatus = data.faceLivenessPassed === false ? "liveness_failed" : "captured";
    }

    const { data: row, error } = await context.supabase
      .from("staff_location_events")
      .insert({
        staff_id: staff.id,
        location_id: locationId,
        geofence_id: nearest?.fence.id ?? null,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy_meters: data.accuracyMeters ?? null,
        inside_geofence: nearest ? nearest.evaluation.inside : null,
        distance_meters: nearest?.evaluation.distanceMeters ?? null,
        event_type: eventType,
        client_event_id: clientEventId,
        recorded_at: data.recordedAt ?? new Date().toISOString(),
        source: data.queuedOffline ? "offline_sync" : "web",
        queued_offline: Boolean(data.queuedOffline),
        face_liveness_passed: data.faceLivenessPassed ?? null,
        face_status: faceStatus,
        photo_path: photoPath,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (nearest?.evaluation.violation) {
      await dispatchHrNotify({
        kind: nearest.evaluation.eventType === "restricted" ? "restricted" : "geofence_exit",
        staffName: staff.full_name,
        locationName: nearest.fence.name,
        distanceMeters: nearest.evaluation.distanceMeters,
        locationId,
        sourceId: row.id,
      });
    }

    return {
      id: row.id as string,
      duplicate: false,
      eventType,
      inside: nearest?.evaluation.inside ?? null,
      distanceMeters: nearest?.evaluation.distanceMeters ?? null,
      locationId,
      violation: nearest?.evaluation.violation ?? false,
    };
  },
  { auth: { capability: "attendance.view" } },
);

export const getStaffFaceEnrollment = createAuthenticatedAction(
  z.object({ staffId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    const mine = await myStaff(context);
    const staffId = data.staffId ?? mine?.id ?? null;
    if (!staffId) return { staffId: null, status: "none" as const, enrolledAt: null, livenessPassed: false };
    if (data.staffId && data.staffId !== mine?.id && !canUserDo(context.roles ?? [], "attendance.configure") && !canUserDo(context.roles ?? [], "people.edit_roster")) {
      throw new ForbiddenError("You cannot view another employee's face enrollment.");
    }
    const { data: row, error } = await context.supabase
      .from("staff_face_enrollments")
      .select("staff_id, status, enrolled_at, liveness_passed, storage_path")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (error && !tableMissing(error.message)) throw error;
    return {
      staffId,
      status: row?.status === "enrolled" ? ("enrolled" as const) : row?.status === "revoked" ? ("revoked" as const) : ("none" as const),
      enrolledAt: row?.enrolled_at ? String(row.enrolled_at) : null,
      livenessPassed: Boolean(row?.liveness_passed),
      hasPhoto: Boolean(row?.storage_path),
    };
  },
  { auth: { capability: "attendance.view" } },
);

export const saveStaffFaceEnrollment = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().nullable().optional(),
    photoBase64: z.string().max(1_400_000),
    livenessPassed: z.boolean().default(false),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    const staffId = data.staffId ?? mine?.id ?? null;
    if (!staffId) throw new ForbiddenError("No staff record to enroll.");
    const editingOther = Boolean(data.staffId && data.staffId !== mine?.id);
    if (editingOther && !canUserDo(context.roles ?? [], "attendance.configure") && !canUserDo(context.roles ?? [], "people.edit_roster")) {
      throw new ForbiddenError("You cannot enroll another employee's face.");
    }
    const path = await storeFacePhoto(`${staffId}/enrollment.jpg`, data.photoBase64);
    const { error } = await context.supabase.from("staff_face_enrollments").upsert({
      staff_id: staffId,
      storage_path: path,
      status: "enrolled",
      liveness_passed: data.livenessPassed,
      enrolled_at: new Date().toISOString(),
      enrolled_by: context.userId,
      notes: "Client-side liveness only. Identity match is not claimed.",
    });
    if (error) throw error;
    return { ok: true, status: "enrolled" as const };
  },
  { auth: { capability: "attendance.view" } },
);

export const getPayrollAttendanceSummary = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("attendance_daily_summary")
      .select("staff_id, status, late_minutes, missed_punch, overtime_minutes, worked_minutes, punch_count")
      .gte("work_date", data.dateFrom)
      .lte("work_date", data.dateTo)
      .not("staff_id", "is", null)
      .limit(20000);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const staffIds = [...new Set((rows ?? []).map((r) => r.staff_id as string).filter(Boolean))];
    const names = new Map<string, { full_name: string; employee_code: string }>();
    for (let i = 0; i < staffIds.length; i += 200) {
      const chunk = staffIds.slice(i, i + 200);
      const { data: staffRows } = await context.supabase.from("staff").select("id, full_name, employee_code").in("id", chunk);
      for (const s of staffRows ?? []) {
        names.set(s.id, { full_name: s.full_name, employee_code: s.employee_code });
      }
    }
    const days: PayrollDayInput[] = (rows ?? []).map((row) => {
      const staff = names.get(String(row.staff_id));
      return {
        staff_id: row.staff_id as string,
        staff_name: staff?.full_name ?? null,
        employee_code: staff?.employee_code ?? null,
        status: String(row.status ?? ""),
        late_minutes: Number(row.late_minutes ?? 0),
        missed_punch: Boolean(row.missed_punch),
        overtime_minutes: Number(row.overtime_minutes ?? 0),
        worked_minutes: Number(row.worked_minutes ?? 0),
        punch_count: Number(row.punch_count ?? 0),
      };
    });
    const summary = aggregatePayrollRows(days);
    return {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      readyCount: summary.filter((r) => r.payrollReady).length,
      blockedCount: summary.filter((r) => !r.payrollReady).length,
      rows: summary,
    };
  },
  { auth: { capability: "attendance.view" } },
);

export const notifyAttendanceDeviations = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("attendance_daily_summary")
      .select("id, staff_id, location_id, work_date, status, late_minutes, missed_punch")
      .gte("work_date", data.dateFrom)
      .lte("work_date", data.dateTo)
      .not("staff_id", "is", null)
      .limit(2000);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const staffIds = [...new Set((rows ?? []).map((r) => r.staff_id as string))];
    const names = new Map<string, string>();
    if (staffIds.length) {
      const { data: staffRows } = await context.supabase.from("staff").select("id, full_name").in("id", staffIds.slice(0, 500));
      for (const s of staffRows ?? []) names.set(s.id, s.full_name);
    }
    let sent = 0;
    for (const row of rows ?? []) {
      const staffName = names.get(String(row.staff_id)) ?? "Staff";
      if (row.missed_punch || row.status === "missed_punch") {
        sent += await dispatchHrNotify({
          kind: "missed_punch",
          staffName,
          workDate: String(row.work_date).slice(0, 10),
          locationId: row.location_id as string,
          sourceId: row.id as string,
        });
      } else if (Number(row.late_minutes ?? 0) > 0 || row.status === "late") {
        sent += await dispatchHrNotify({
          kind: "late",
          staffName,
          workDate: String(row.work_date).slice(0, 10),
          minutes: Number(row.late_minutes ?? 0),
          locationId: row.location_id as string,
          sourceId: row.id as string,
        });
      }
    }
    return { sent };
  },
  { auth: { capability: "attendance.approve" } },
);

export const getFieldCheckInContext = createAuthenticatedActionNoInput(
  async (context) => {
    const staff = await myStaff(context);
    const settings = await readFieldSettings(context);
    let enrollment: { staffId: string | null; status: "none" | "enrolled" | "revoked"; enrolledAt: string | null; livenessPassed: boolean; hasPhoto?: boolean } = {
      staffId: staff?.id ?? null,
      status: "none",
      enrolledAt: null,
      livenessPassed: false,
    };
    if (staff?.id) {
      const { data: row, error } = await context.supabase
        .from("staff_face_enrollments")
        .select("staff_id, status, enrolled_at, liveness_passed, storage_path")
        .eq("staff_id", staff.id)
        .maybeSingle();
      if (error && !tableMissing(error.message)) throw error;
      enrollment = {
        staffId: staff.id,
        status: row?.status === "enrolled" ? "enrolled" : row?.status === "revoked" ? "revoked" : "none",
        enrolledAt: row?.enrolled_at ? String(row.enrolled_at) : null,
        livenessPassed: Boolean(row?.liveness_passed),
        hasPhoto: Boolean(row?.storage_path),
      };
    }
    return {
      staff: staff
        ? { id: staff.id, fullName: staff.full_name, employeeCode: staff.employee_code, locationId: staff.location_id }
        : null,
      settings,
      enrollment,
    };
  },
  { auth: { capability: "attendance.view" } },
);
