"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pickNearestFence } from "@/lib/attendance-hr/geofence";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import { decideSelfCheck, type SelfCheckDenyReason, type SelfCheckKind } from "@/lib/attendance-hr/self-check-in";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

const selfCheckAuth = { auth: { anyCapability: ["hr.employee_app" as const, "attendance.view" as const] } };

export type SelfCheckState = {
  enabled: boolean;
  punchesToday: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  checkedInLocationLabel: string | null;
  checkedOutLocationLabel: string | null;
};

export type SelfCheckRecordResult =
  | {
      recorded: true;
      punchAt: string;
      kind: SelfCheckKind;
      attendanceDate: string;
      locationId: string;
      locationLabel: string;
    }
  | { recorded: false; reason: SelfCheckDenyReason | "no_location" | "outside_geofence" };

function qatarToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function columnMissing(message: string | undefined): boolean {
  return Boolean(message && /can_self_check_in|schema cache/i.test(message));
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

type StaffGate = {
  id: string;
  locationId: string | null;
  employeeCode: string | null;
  enabled: boolean;
};

type PunchRow = {
  punch_at: string;
  location_id: string | null;
  locationLabel: string | null;
};

async function loadGate(userId: string): Promise<StaffGate | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, location_id, employee_code, can_self_check_in")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (columnMissing(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data?.id) return null;
  return {
    id: String(data.id),
    locationId: data.location_id ? String(data.location_id) : null,
    employeeCode: data.employee_code ? String(data.employee_code) : null,
    enabled: Boolean(data.can_self_check_in),
  };
}

async function openPunches(staffId: string, day: string): Promise<PunchRow[]> {
  const { data, error } = await supabaseAdmin
    .from("attendance_logs")
    .select("punch_at, excluded_from_calc, probable_duplicate, location_id, locations(code, name)")
    .eq("staff_id", staffId)
    .eq("attendance_date", day)
    .order("punch_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => !row.excluded_from_calc && !row.probable_duplicate && row.punch_at)
    .map((row) => {
      const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      return {
        punch_at: String(row.punch_at),
        location_id: row.location_id ? String(row.location_id) : null,
        locationLabel: loc
          ? formatLocationLabel(
              (loc as { code?: string } | null)?.code,
              (loc as { name?: string } | null)?.name,
            )
          : null,
      };
    });
}

function stateFromPunches(enabled: boolean, punches: PunchRow[]): SelfCheckState {
  const first = punches[0];
  const last = punches.length >= 2 ? punches[punches.length - 1] : null;
  return {
    enabled,
    punchesToday: punches.length,
    checkedInAt: first?.punch_at ?? null,
    checkedOutAt: last?.punch_at ?? null,
    checkedInLocationLabel: first?.locationLabel ?? null,
    checkedOutLocationLabel: last?.locationLabel ?? null,
  };
}

async function resolvePunchLocation(input: {
  homeLocationId: string | null;
  latitude?: number;
  longitude?: number;
}): Promise<{ locationId: string | null; locationLabel: string | null; geofenceName: string | null; inside: boolean | null; distanceMeters: number | null }> {
  const homeId = input.homeLocationId;
  let homeLabel: string | null = null;
  if (homeId) {
    const { data: home } = await supabaseAdmin.from("locations").select("code, name").eq("id", homeId).maybeSingle();
    if (home) homeLabel = formatLocationLabel(home.code, home.name);
  }

  if (input.latitude == null || input.longitude == null || !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    return {
      locationId: homeId,
      locationLabel: homeLabel,
      geofenceName: null,
      inside: null,
      distanceMeters: null,
    };
  }

  const { data: fences, error } = await supabaseAdmin
    .from("attendance_geofences")
    .select("id, location_id, name, latitude, longitude, radius_meters, mode, active, locations(code, name)")
    .eq("active", true);
  if (error && !tableMissing(error.message)) throw new Error(error.message);

  const active = (fences ?? []).map((row) => {
    const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    return {
      id: row.id as string,
      locationId: row.location_id as string,
      name: row.name as string,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      radiusMeters: Number(row.radius_meters),
      mode: (row.mode as "operate" | "restrict") ?? "operate",
      locationLabel: formatLocationLabel(
        (loc as { code?: string } | null)?.code,
        (loc as { name?: string } | null)?.name,
      ),
    };
  });

  const nearest = pickNearestFence({ latitude: input.latitude, longitude: input.longitude }, active);
  if (!nearest) {
    return {
      locationId: homeId,
      locationLabel: homeLabel,
      geofenceName: null,
      inside: null,
      distanceMeters: null,
    };
  }

  // Prefer the nearest active geo site (branch or warehouse) when the person is inside the fence.
  if (nearest.evaluation.inside || nearest.evaluation.mode === "restrict") {
    return {
      locationId: nearest.fence.locationId,
      locationLabel: nearest.fence.locationLabel,
      geofenceName: nearest.fence.name,
      inside: nearest.evaluation.inside,
      distanceMeters: nearest.evaluation.distanceMeters,
    };
  }

  // Outside every operate fence: keep home for the punch, but report distance for the payload.
  return {
    locationId: homeId ?? nearest.fence.locationId,
    locationLabel: homeLabel ?? nearest.fence.locationLabel,
    geofenceName: nearest.fence.name,
    inside: false,
    distanceMeters: nearest.evaluation.distanceMeters,
  };
}

export const getMySelfCheck = createAuthenticatedActionNoInput(
  async (context): Promise<SelfCheckState> => {
    const gate = await loadGate(context.userId);
    if (!gate?.enabled) return stateFromPunches(false, []);
    const punches = await openPunches(gate.id, qatarToday());
    return stateFromPunches(true, punches);
  },
  selfCheckAuth,
);

export const recordSelfCheck = createAuthenticatedAction(
  z.object({
    kind: z.enum(["in", "out"]),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyMeters: z.number().min(0).max(50000).nullable().optional(),
  }),
  async (data, context): Promise<SelfCheckRecordResult> => {
    const gate = await loadGate(context.userId);
    const day = qatarToday();
    const punches = gate?.enabled ? await openPunches(gate.id, day) : [];
    const decision = decideSelfCheck({
      linked: Boolean(gate),
      enabled: Boolean(gate?.enabled),
      kind: data.kind,
      punchesToday: punches.length,
    });
    if (!decision.allow) return { recorded: false, reason: decision.reason };

    const resolved = await resolvePunchLocation({
      homeLocationId: gate?.locationId ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
    });
    if (!resolved.locationId) return { recorded: false, reason: "no_location" };

    const now = new Date();
    const punchAt = now.toISOString();
    const attendanceDate = qatarToday(now);
    const again = await openPunches(gate!.id, attendanceDate);
    const confirm = decideSelfCheck({
      linked: true,
      enabled: true,
      kind: data.kind,
      punchesToday: again.length,
    });
    if (!confirm.allow) return { recorded: false, reason: confirm.reason };

    const { data: locRow } = await supabaseAdmin
      .from("locations")
      .select("code, name")
      .eq("id", resolved.locationId)
      .maybeSingle();
    const locationLabel =
      resolved.locationLabel ??
      (locRow ? formatLocationLabel(locRow.code, locRow.name) : "—");

    const { error } = await supabaseAdmin.from("attendance_logs").insert({
      location_id: resolved.locationId,
      staff_id: gate!.id,
      user_id: context.userId,
      biometric_user_id: gate!.employeeCode,
      punch_at: punchAt,
      punch_type: data.kind,
      in_out_status: data.kind === "in" ? 0 : 1,
      source: "self_check",
      attendance_date: attendanceDate,
      excluded_from_calc: false,
      probable_duplicate: false,
      raw_payload: {
        via: "self_check",
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        accuracy_meters: data.accuracyMeters ?? null,
        geofence_name: resolved.geofenceName,
        inside_geofence: resolved.inside,
        distance_meters: resolved.distanceMeters,
        location_label: locationLabel,
      },
    });
    if (error) {
      if (error.code === "23505" || /duplicate key|unique constraint/i.test(error.message)) {
        return { recorded: false, reason: data.kind === "in" ? "already_in" : "already_out" };
      }
      throw new Error(error.message);
    }

    try {
      await recalculateAttendanceRange(
        supabaseAdmin as unknown as Parameters<typeof recalculateAttendanceRange>[0],
        resolved.locationId,
        attendanceDate,
        attendanceDate,
        { staffIds: [gate!.id] },
      );
    } catch (err) {
      console.error("[self-check] attendance recalculation failed", err instanceof Error ? err.message : "error");
    }

    return {
      recorded: true,
      punchAt,
      kind: data.kind,
      attendanceDate,
      locationId: resolved.locationId,
      locationLabel,
    };
  },
  selfCheckAuth,
);
