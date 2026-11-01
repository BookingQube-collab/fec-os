"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import { DEFAULT_GEOFENCE_RADIUS_METERS, evaluateGeofence, pickNearestFence, SITE_GEOFENCE_DEFAULTS } from "@/lib/attendance-hr/geofence";
import { DEFAULT_HR_NOTIFY_TOGGLES } from "@/lib/attendance-hr/hr-notify";
import { dispatchHrNotify } from "@/lib/attendance-hr/hr-notify-dispatch";
import { ATTENDANCE_DAILY_LIST_PAGE_SIZE, DEFAULT_RULES } from "@/lib/attendance-hr/constants";
import {
  aggregatePayrollRows,
  includeStaffInPayrollAttendanceSummary,
  type PayrollDayInput,
} from "@/lib/attendance-hr/payroll";
import { withPayrollScheduleContext } from "@/lib/attendance-hr/payroll-schedule-context.server";
import { collectPagedRows } from "@/lib/attendance-hr/roster-register-scope";
import {
  PAYROLL_VISIBLE_OT_STATUSES,
  sumVisibleOtMinutesByStaff,
} from "@/lib/hr-payroll";
import { LOCATION_KIND_WAREHOUSE, normalizeLocationKind } from "@/lib/locations/kind";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { resolveSelfStaffId } from "@/lib/attendance-hr/self-staff";
import { resolveFaceEnrollmentTarget } from "@/lib/attendance-hr/face-enrollment";
import { resolveStaffProfileReadAccess } from "@/lib/staff-profile-access.server";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";

const FACE_BUCKET = "staff-faces";

async function assertSite(context: AuthContext, locationId: string) {
  if (canUserDo(context.roles ?? [], "attendance.view_all")) return;
  await assertLocationAccess(context, locationId);
}

async function myStaff(context: AuthContext) {
  const linked = await loadLinkedStaffRecord(context.userId);
  if (!linked?.id) return null;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id")
    .eq("id", linked.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
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

type GeofenceListRow = {
  id: string | null;
  locationId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  mode: "operate" | "restrict";
  active: boolean;
  notes: string | null;
  locationCode: string | null;
  locationName: string | null;
  locationRegion: string | null;
  locationKind: string;
};

export const listAttendanceGeofences = createAuthenticatedActionNoInput(
  async (context): Promise<GeofenceListRow[]> => {
    let data: Array<Record<string, unknown>> | null = null;
    {
      const withKind = await context.supabase
        .from("attendance_geofences")
        .select("id, location_id, name, latitude, longitude, radius_meters, mode, active, notes, locations(id, code, name, region, kind)")
        .order("name");
      if (withKind.error) {
        if (tableMissing(withKind.error.message)) return [];
        if (!/kind|schema cache|column/i.test(withKind.error.message ?? "")) throw withKind.error;
        const legacy = await context.supabase
          .from("attendance_geofences")
          .select("id, location_id, name, latitude, longitude, radius_meters, mode, active, notes, locations(id, code, name, region)")
          .order("name");
        if (legacy.error) {
          if (tableMissing(legacy.error.message)) return [];
          throw legacy.error;
        }
        data = (legacy.data ?? []) as Array<Record<string, unknown>>;
      } else {
        data = (withKind.data ?? []) as Array<Record<string, unknown>>;
      }
    }
    const byLocation = new Map<string, GeofenceListRow>();
    for (const row of data ?? []) {
      const locRaw = row.locations;
      const loc = Array.isArray(locRaw) ? locRaw[0] : locRaw;
      const locationId = row.location_id as string;
      byLocation.set(locationId, {
        id: row.id as string,
        locationId,
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
        locationKind: normalizeLocationKind((loc as { kind?: string } | null)?.kind),
      });
    }

    // Warehouses must appear in the geo list even before a fence row exists (not as branches).
    const { data: warehouses, error: whErr } = await context.supabase
      .from("locations")
      .select("id, code, name, region, kind")
      .eq("kind", LOCATION_KIND_WAREHOUSE)
      .eq("status", "active")
      .order("code");
    if (whErr && !/kind|schema cache|column/i.test(whErr.message ?? "")) throw whErr;
    for (const loc of warehouses ?? []) {
      const locationId = String(loc.id);
      if (byLocation.has(locationId)) continue;
      const code = String(loc.code ?? "");
      const known = code ? SITE_GEOFENCE_DEFAULTS[code] : null;
      byLocation.set(locationId, {
        id: null,
        locationId,
        name: String(loc.name ?? code) || "Warehouse",
        latitude: known?.latitude ?? 0,
        longitude: known?.longitude ?? 0,
        radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
        mode: "operate",
        active: false,
        notes: null,
        locationCode: code || null,
        locationName: (loc.name as string | null) ?? null,
        locationRegion: (loc.region as string | null) ?? null,
        locationKind: LOCATION_KIND_WAREHOUSE,
      });
    }

    return [...byLocation.values()].sort((a, b) =>
      (a.locationCode ?? a.name).localeCompare(b.locationCode ?? b.name),
    );
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
          ? formatLocationLabel((loc as { code?: string }).code, (loc as { name?: string }).name)
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
          ? formatLocationLabel((loc as { code?: string }).code, (loc as { name?: string }).name)
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
  if (error) {
    const msg = error.message || "Storage upload failed";
    if (/bucket|not found|does not exist/i.test(msg)) {
      throw new Error("Face photo storage bucket is missing. Apply the HR field attendance migration.");
    }
    throw new Error(msg);
  }
  return path;
}

export const submitFieldCheckIn = createAuthenticatedAction(
  z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(50000).nullable().optional(),
    eventType: z.enum(["check_in", "check_out", "ping"]).default("check_in"),
    locationId: z.string().uuid().nullable().optional(),
    staffId: z.string().uuid().nullable().optional(),
    clientEventId: z.string().uuid().optional(),
    recordedAt: z.string().optional(),
    queuedOffline: z.boolean().optional(),
    faceLivenessPassed: z.boolean().nullable().optional(),
    photoBase64: z.string().max(1_400_000).nullable().optional(),
  }),
  async (data, context) => {
    const staff = await myStaff(context);
    resolveSelfStaffId({ linkedStaffId: staff?.id ?? null, requestedStaffId: data.staffId ?? null });
    if (!staff) throw new ForbiddenError("Your login is not linked to a staff record, so GPS check-in is not available.");
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
    // GPS-resolved fences (including warehouse) are punch sites, not branch access grants.
    // Only enforce site access when the operator explicitly picked a branch location.
    if (data.locationId && !nearest) await assertSite(context, data.locationId);

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
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

/** Safe action: never throws across the wire (avoids Next.js production 500 POSTs / RSC digests). */
export const getStaffFaceEnrollment = createSafeAuthenticatedAction(
  z.object({ staffId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    const mine = await myStaff(context);
    const staffId = data.staffId ?? mine?.id ?? null;
    if (!staffId) {
      return { staffId: null, status: "none" as const, enrolledAt: null, livenessPassed: false, hasPhoto: false };
    }
    const viewingOther = Boolean(data.staffId && data.staffId !== mine?.id);
    if (viewingOther) {
      // Same gate as staff profile GET — roster editors, HR, HoO, linked managers.
      await resolveStaffProfileReadAccess(context, staffId);
    }
    // Service role after access check: RLS is self-or-level≥55; team managers may be below that.
    const { data: row, error } = await supabaseAdmin
      .from("staff_face_enrollments")
      .select("staff_id, status, enrolled_at, liveness_passed, storage_path")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (error && !tableMissing(error.message)) {
      // Soft-fail so profile / field UIs do not surface Next.js RSC digest toasts.
      return { staffId, status: "none" as const, enrolledAt: null, livenessPassed: false, hasPhoto: false };
    }
    return {
      staffId,
      status: row?.status === "enrolled" ? ("enrolled" as const) : row?.status === "revoked" ? ("revoked" as const) : ("none" as const),
      enrolledAt: row?.enrolled_at ? String(row.enrolled_at) : null,
      livenessPassed: Boolean(row?.liveness_passed),
      hasPhoto: Boolean(row?.storage_path),
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

/** Safe action: never throws across the wire (avoids Next.js production RSC digest toasts). */
export const saveStaffFaceEnrollment = createSafeAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().nullable().optional(),
    photoBase64: z.string().max(1_400_000),
    livenessPassed: z.boolean().default(false),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    const canEnrollOthers =
      canUserDo(context.roles ?? [], "attendance.configure") || canUserDo(context.roles ?? [], "people.edit_roster");
    const target = resolveFaceEnrollmentTarget({
      linkedStaffId: mine?.id ?? null,
      requestedStaffId: data.staffId ?? null,
      canEnrollOthers,
    });
    if (!target.ok) {
      if (target.reason === "no_staff") {
        throw new ForbiddenError(
          "Your login is not linked to a staff record, so face enrollment is not available.",
        );
      }
      throw new ForbiddenError("You cannot enroll another employee's face.");
    }
    const staffId = target.staffId;

    const { data: staffRow, error: staffErr } = await context.supabase
      .from("staff")
      .select("id")
      .eq("id", staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr && !tableMissing(staffErr.message)) throw staffErr;
    if (!staffRow) {
      throw new ForbiddenError("Staff record not found for face enrollment.");
    }

    const path = await storeFacePhoto(`${staffId}/enrollment.jpg`, data.photoBase64);
    // Service role after auth checks — avoids RLS edge cases breaking linked-staff enroll.
    const { error } = await supabaseAdmin.from("staff_face_enrollments").upsert({
      staff_id: staffId,
      storage_path: path,
      status: "enrolled",
      liveness_passed: data.livenessPassed,
      enrolled_at: new Date().toISOString(),
      enrolled_by: context.userId,
      notes: "Client-side liveness only. Identity match is not claimed.",
    });
    if (error) {
      if (tableMissing(error.message)) {
        throw new Error("Face enrollment tables are not set up yet. Apply the HR field attendance migration.");
      }
      throw error;
    }
    return { status: "enrolled" as const, staffId };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

export const getPayrollAttendanceSummary = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    // Service role after payroll.view + site checks: HR attendance access does not imply
    // staff RLS (user_can_access_location has no HR bypass). Join staff/locations here.
    // Always load all sites in the cycle, then collapse staff+date (listing does the same).
    // Location filter = which staff appear, not "only count punches at this site".
    // PostgREST max_rows ~1000: .limit(50000) still returns one page and undercounts Present.
    type PayrollSummaryStaffJoin = {
      full_name?: string | null;
      employee_code?: string | null;
      employment_type?: string | null;
      flexible_attendance?: boolean | null;
      hire_date?: string | null;
      deleted_at?: string | null;
    };
    type PayrollSummaryAttRow = {
      staff_id: string | null;
      location_id: string | null;
      work_date: string | null;
      status: string | null;
      late_minutes: number | null;
      missed_punch: boolean | null;
      overtime_minutes: number | null;
      worked_minutes: number | null;
      punch_count: number | null;
      actual_in: string | null;
      actual_out: string | null;
      scheduled_in: string | null;
      scheduled_out: string | null;
      staff: PayrollSummaryStaffJoin | PayrollSummaryStaffJoin[] | null;
      locations:
        | { code?: string | null; name?: string | null }
        | Array<{ code?: string | null; name?: string | null }>
        | null;
    };
    const rows = await collectPagedRows(async (from, to) => {
      const { data: page, error } = await supabaseAdmin
        .from("attendance_daily_summary")
        .select(
          "staff_id, location_id, work_date, status, late_minutes, missed_punch, overtime_minutes, worked_minutes, punch_count, actual_in, actual_out, scheduled_in, scheduled_out, staff(full_name, employee_code, employment_type, flexible_attendance, hire_date, deleted_at), locations(code, name)",
        )
        .gte("work_date", data.dateFrom)
        .lte("work_date", data.dateTo)
        .not("staff_id", "is", null)
        .order("work_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (page ?? []) as PayrollSummaryAttRow[];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);

    const locLabelById = new Map<string, string>();
    if (data.locationId) {
      const { data: locRow } = await supabaseAdmin
        .from("locations")
        .select("id, code, name")
        .eq("id", data.locationId)
        .maybeSingle();
      if (locRow) locLabelById.set(String(locRow.id), formatLocationLabel(locRow.code, locRow.name));
    }

    const staffAtFilterLoc = new Set<string>();
    const staffLocVotes = new Map<string, Map<string, number>>();
    const days: PayrollDayInput[] = [];
    for (const row of rows) {
      const staffJoin = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      // Soft-deleted merge archives (e.g. Lilam KDS-CC-STF02) — keeper already owns the person.
      if (staffJoin?.deleted_at) continue;

      const staffId = String(row.staff_id);
      const locationId = row.location_id ? String(row.location_id) : "";
      if (data.locationId && locationId === data.locationId) staffAtFilterLoc.add(staffId);
      if (locationId) {
        const votes = staffLocVotes.get(staffId) ?? new Map<string, number>();
        votes.set(locationId, (votes.get(locationId) ?? 0) + 1);
        staffLocVotes.set(staffId, votes);
      }
      const locJoin = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      if (locationId && locJoin && !locLabelById.has(locationId)) {
        locLabelById.set(
          locationId,
          formatLocationLabel(
            (locJoin as { code?: string } | null)?.code,
            (locJoin as { name?: string } | null)?.name,
          ),
        );
      }
      const fullName = String(staffJoin?.full_name ?? "").trim();
      const employeeCode = String(staffJoin?.employee_code ?? "");
      const employmentType = staffJoin?.employment_type ?? null;
      const flexible = Boolean(staffJoin?.flexible_attendance);
      const hireDate = staffJoin?.hire_date ?? null;
      days.push({
        staff_id: staffId,
        staff_name: fullName || null,
        employee_code: employeeCode || null,
        work_date: row.work_date ? String(row.work_date).slice(0, 10) : null,
        status: String(row.status ?? ""),
        late_minutes: Number(row.late_minutes ?? 0),
        missed_punch: Boolean(row.missed_punch),
        overtime_minutes: Number(row.overtime_minutes ?? 0),
        worked_minutes: Number(row.worked_minutes ?? 0),
        punch_count: Number(row.punch_count ?? 0),
        actual_in: row.actual_in ? String(row.actual_in) : null,
        actual_out: row.actual_out ? String(row.actual_out) : null,
        scheduled_in: row.scheduled_in ? String(row.scheduled_in) : null,
        scheduled_out: row.scheduled_out ? String(row.scheduled_out) : null,
        employment_type: employmentType,
        flexible_attendance: flexible,
        hire_date: hireDate ? String(hireDate).slice(0, 10) : null,
      });
    }

    // Ops / F&B / Cafe (and attendance) OT claims — show submitted pipeline hours, not punch OT alone.
    const otRows = await collectPagedRows(async (from, to) => {
      const { data: page, error } = await supabaseAdmin
        .from("hr_ot_claims")
        .select("staff_id, status, claimed_minutes, approved_minutes, work_date")
        .gte("work_date", data.dateFrom)
        .lte("work_date", data.dateTo)
        .in("status", [...PAYROLL_VISIBLE_OT_STATUSES])
        .order("work_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return page ?? [];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
    const submittedOtByStaff = sumVisibleOtMinutesByStaff(
      otRows.map((r) => ({
        staff_id: r.staff_id as string,
        status: String(r.status),
        claimed_minutes: Number(r.claimed_minutes ?? 0),
        approved_minutes: r.approved_minutes == null ? null : Number(r.approved_minutes),
      })),
    );

    // Roster week-off / leave overlay — raw daily_summary often keeps missed_punch on rest days.
    const scheduledDays = await withPayrollScheduleContext(days, {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });

    const filterLabel = data.locationId ? (locLabelById.get(data.locationId) ?? "—") : null;
    let summary = aggregatePayrollRows(scheduledDays).map((row) => {
      const submittedOtMinutes = submittedOtByStaff.get(row.staffId) ?? 0;
      const withOt = { ...row, submittedOtMinutes };
      if (filterLabel) return { ...withOt, locationLabel: filterLabel };
      const votes = staffLocVotes.get(row.staffId);
      let bestId = "";
      let bestN = -1;
      if (votes) {
        for (const [lid, n] of votes) {
          if (n > bestN) {
            bestId = lid;
            bestN = n;
          }
        }
      }
      return { ...withOt, locationLabel: (bestId && locLabelById.get(bestId)) || "—" };
    });
    if (data.locationId) {
      summary = summary.filter((row) => staffAtFilterLoc.has(row.staffId));
    }
    // Drop terminated/resigned ghosts: 0 paid days and no leave/punches/OT/exceptions.
    summary = summary.filter(includeStaffInPayrollAttendanceSummary);
    return {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      readyCount: summary.filter((r) => r.payrollReady).length,
      blockedCount: summary.filter((r) => !r.payrollReady).length,
      rows: summary,
    };
  },
  { auth: { capability: "payroll.view" } },
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
      // Soft-fail: never crash Field / employee pages over enrollment status.
      if (!error || tableMissing(error.message)) {
        enrollment = {
          staffId: staff.id,
          status: row?.status === "enrolled" ? "enrolled" : row?.status === "revoked" ? "revoked" : "none",
          enrolledAt: row?.enrolled_at ? String(row.enrolled_at) : null,
          livenessPassed: Boolean(row?.liveness_passed),
          hasPhoto: Boolean(row?.storage_path),
        };
      }
    }
    return {
      staff: staff
        ? { id: staff.id, fullName: staff.full_name, employeeCode: staff.employee_code, locationId: staff.location_id }
        : null,
      settings,
      enrollment,
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);
