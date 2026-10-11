"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import { decideSelfCheck, type SelfCheckDenyReason, type SelfCheckKind } from "@/lib/attendance-hr/self-check-in";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

const selfCheckAuth = { auth: { anyCapability: ["hr.employee_app" as const, "attendance.view" as const] } };

export type SelfCheckState = {
  enabled: boolean;
  punchesToday: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};

export type SelfCheckRecordResult =
  | { recorded: true; punchAt: string; kind: SelfCheckKind; attendanceDate: string }
  | { recorded: false; reason: SelfCheckDenyReason | "no_location" };

function qatarToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function columnMissing(message: string | undefined): boolean {
  return Boolean(message && /can_self_check_in|schema cache/i.test(message));
}

type StaffGate = {
  id: string;
  locationId: string | null;
  employeeCode: string | null;
  enabled: boolean;
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

async function openPunches(staffId: string, day: string): Promise<Array<{ punch_at: string }>> {
  const { data, error } = await supabaseAdmin
    .from("attendance_logs")
    .select("punch_at, excluded_from_calc, probable_duplicate")
    .eq("staff_id", staffId)
    .eq("attendance_date", day)
    .order("punch_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => !row.excluded_from_calc && !row.probable_duplicate && row.punch_at)
    .map((row) => ({ punch_at: String(row.punch_at) }));
}

function stateFromPunches(enabled: boolean, punches: Array<{ punch_at: string }>): SelfCheckState {
  return {
    enabled,
    punchesToday: punches.length,
    checkedInAt: punches[0]?.punch_at ?? null,
    checkedOutAt: punches.length >= 2 ? punches[punches.length - 1].punch_at : null,
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
  z.object({ kind: z.enum(["in", "out"]) }),
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
    if (!gate?.locationId) return { recorded: false, reason: "no_location" };

    const now = new Date();
    const punchAt = now.toISOString();
    const attendanceDate = qatarToday(now);
    const again = await openPunches(gate.id, attendanceDate);
    const confirm = decideSelfCheck({
      linked: true,
      enabled: true,
      kind: data.kind,
      punchesToday: again.length,
    });
    if (!confirm.allow) return { recorded: false, reason: confirm.reason };

    const { error } = await supabaseAdmin.from("attendance_logs").insert({
      location_id: gate.locationId,
      staff_id: gate.id,
      user_id: context.userId,
      biometric_user_id: gate.employeeCode,
      punch_at: punchAt,
      punch_type: data.kind,
      in_out_status: data.kind === "in" ? 0 : 1,
      source: "self_check",
      attendance_date: attendanceDate,
      excluded_from_calc: false,
      probable_duplicate: false,
      raw_payload: { via: "self_check" },
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
        gate.locationId,
        attendanceDate,
        attendanceDate,
        { staffIds: [gate.id] },
      );
    } catch (err) {
      console.error("[self-check] attendance recalculation failed", err instanceof Error ? err.message : "error");
    }

    return { recorded: true, punchAt, kind: data.kind, attendanceDate };
  },
  selfCheckAuth,
);
