import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { isActiveRosterStaff } from "@/lib/staff-status";

import { calculateDailyAttendance, markProbableDuplicates } from "./calculate";
import {
  ATTENDANCE_FILE_BUCKET,
  DEFAULT_RULES,
  DEFAULT_SHIFT,
  MAX_UPLOAD_BYTES,
  type AttendanceRuleInput,
  type ShiftTemplateInput,
} from "./constants";
import { enumerateYmd } from "./dashboard";
import { expectedRowsForDay, isWorkDateCovered } from "./roster-expected";
import { ATTENDANCE_TALLY_UPLOAD_NOTE } from "./roster-upload";
import { encryptFileBuffer, hasAttendanceFileKey } from "./file-crypto";
import { subjectKey } from "./keys";
import {
  BIOMETRIC_USER_CONFLICT,
  type MergedBiometricUser,
} from "./mapping-merge";
import { previewAttendanceFile } from "./preview";

export {
  BIOMETRIC_USER_CONFLICT,
  buildPunchRows,
  canonicalBiometricUserId,
  lookupStaffByBiometric,
  mergeBiometricUsersById,
  staffByBiometricFromMappings,
} from "./mapping-merge";
export type { ExistingBiometricUser, IncomingBiometricUser, MergedBiometricUser } from "./mapping-merge";

export function canViewAllAttendance(roles: AppRole[]): boolean {
  return canUserDo(roles, "attendance.view_all");
}

export async function assertAttendanceLocation(context: AuthContext, locationId: string) {
  if (canViewAllAttendance(context.roles ?? [])) return;
  await assertLocationAccess(context, locationId);
}

export function assertNotSelfApprove(context: AuthContext, requestedBy: string) {
  if (context.userId === requestedBy && !canUserDo(context.roles ?? [], "attendance.configure")) {
    throw new ForbiddenError("You cannot approve your own attendance correction.");
  }
}

export { previewAttendanceFile };

export async function persistOriginalFile(context: AuthContext, importFileId: string, buffer: Buffer) {
  const payload = hasAttendanceFileKey() ? encryptFileBuffer(buffer) : buffer;
  const path = `${importFileId}.bin`;
  const { error } = await context.supabase.storage.from(ATTENDANCE_FILE_BUCKET).upload(path, payload, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  return { path, encrypted: hasAttendanceFileKey(), byteSize: buffer.length };
}

export async function persistMergedBiometricUsers(
  supabase: AuthContext["supabase"],
  input: {
    companyId: string;
    locationId: string;
    deviceId: string;
    merged: MergedBiometricUser[];
  },
) {
  const updates = input.merged.filter((row) => !row.isNew);
  const inserts = input.merged.filter((row) => row.isNew);

  for (const row of updates) {
    const patch: Record<string, unknown> = { device_name: row.deviceName };
    if (row.nameChanged || row.previousDeviceName) {
      patch.previous_device_name = row.previousDeviceName;
    }
    const { error } = await supabase
      .from("attendance_biometric_users")
      .update(patch)
      .eq("company_id", input.companyId)
      .eq("location_id", input.locationId)
      .eq("device_id", input.deviceId)
      .eq("biometric_user_id", row.biometricUserId);
    if (error && patch.previous_device_name !== undefined && /previous_device_name/i.test(error.message)) {
      const retry = await supabase
        .from("attendance_biometric_users")
        .update({ device_name: row.deviceName })
        .eq("company_id", input.companyId)
        .eq("location_id", input.locationId)
        .eq("device_id", input.deviceId)
        .eq("biometric_user_id", row.biometricUserId);
      if (retry.error) throw retry.error;
    } else if (error) {
      throw error;
    }
  }

  if (!inserts.length) return;

  const { error } = await supabase.from("attendance_biometric_users").upsert(
    inserts.map((row) => ({
      company_id: input.companyId,
      location_id: input.locationId,
      device_id: input.deviceId,
      biometric_user_id: row.biometricUserId,
      device_name: row.deviceName,
    })),
    { onConflict: BIOMETRIC_USER_CONFLICT, ignoreDuplicates: false, defaultToNull: false },
  );
  if (error) throw error;
}

export function dailyFromPunches(
  punches: Array<{ punchAt: string; probableDuplicate?: boolean; excludedFromCalc?: boolean }>,
  workDate: string,
  scheduled: boolean,
  shift: ShiftTemplateInput | null,
  rules: AttendanceRuleInput = DEFAULT_RULES,
) {
  return calculateDailyAttendance(punches, {
    workDate,
    scheduled,
    shift: shift ?? DEFAULT_SHIFT,
    rules,
  });
}

function toShift(row: Record<string, unknown> | null | undefined): ShiftTemplateInput {
  if (!row) return DEFAULT_SHIFT;
  return {
    name: String(row.name ?? DEFAULT_SHIFT.name),
    startTime: String(row.start_time ?? DEFAULT_SHIFT.startTime).slice(0, 5),
    endTime: String(row.end_time ?? DEFAULT_SHIFT.endTime).slice(0, 5),
    overnight: Boolean(row.overnight),
    graceMinutes: Number(row.grace_minutes ?? DEFAULT_SHIFT.graceMinutes),
    breakMinutes: Number(row.break_minutes ?? DEFAULT_SHIFT.breakMinutes),
    minWorkMinutes: Number(row.min_work_minutes ?? DEFAULT_SHIFT.minWorkMinutes),
    overtimeAfterMinutes: Number(row.overtime_after_minutes ?? DEFAULT_SHIFT.overtimeAfterMinutes),
    earlyInWindowMinutes: Number(row.early_in_window_minutes ?? DEFAULT_SHIFT.earlyInWindowMinutes),
    lateOutWindowMinutes: Number(row.late_out_window_minutes ?? DEFAULT_SHIFT.lateOutWindowMinutes),
    dayCutoffTime: String(row.day_cutoff_time ?? DEFAULT_SHIFT.dayCutoffTime).slice(0, 5),
  };
}

export async function recalculateAttendanceRange(
  supabase: AuthContext["supabase"],
  locationId: string,
  dateFrom: string,
  dateTo: string,
) {
  const [{ data: logs, error }, { data: roster }, { data: holidays }, { data: leaves }, { data: shifts }, { data: ruleRows }, { data: staffRows }] =
    await Promise.all([
      supabase
        .from("attendance_logs")
        .select("staff_id, biometric_user_id, device_id, punch_at, probable_duplicate, excluded_from_calc, attendance_date")
        .eq("location_id", locationId)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo),
      supabase
        .from("attendance_roster_assignments")
        .select("staff_id, work_date, shift_template_id, is_week_off")
        .eq("location_id", locationId)
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo),
      supabase.from("attendance_holidays").select("holiday_date, name, location_id").gte("holiday_date", dateFrom).lte("holiday_date", dateTo),
      supabase
        .from("attendance_leave_records")
        .select("staff_id, leave_date, leave_type")
        .eq("location_id", locationId)
        .gte("leave_date", dateFrom)
        .lte("leave_date", dateTo),
      supabase.from("attendance_shift_templates").select("*").eq("active", true),
      supabase.from("attendance_rule_sets").select("*").order("scope"),
      supabase.from("staff").select("id, location_id, status").is("deleted_at", null).limit(5000),
    ]);
  let coveragePeriods: Array<{ start: string; end: string }> = [];
  try {
    const { data: uploads } = await supabase
      .from("daily_ops_roster_uploads")
      .select("period_start, period_end, notes")
      .eq("location_id", locationId)
      .eq("notes", ATTENDANCE_TALLY_UPLOAD_NOTE);
    coveragePeriods = (uploads ?? [])
      .filter((row) => row.period_start && row.period_end)
      .map((row) => ({ start: String(row.period_start).slice(0, 10), end: String(row.period_end).slice(0, 10) }));
  } catch {
    coveragePeriods = [];
  }
  if (error) throw error;

  const ruleRow = (ruleRows ?? []).find((r) => r.location_id === locationId)
    ?? (ruleRows ?? []).find((r) => r.scope === "global")
    ?? null;
  const rules: AttendanceRuleInput = {
    ...DEFAULT_RULES,
    duplicateWindowSeconds: Number(ruleRow?.duplicate_window_seconds ?? DEFAULT_RULES.duplicateWindowSeconds),
    autoMapEmployeeCode: Boolean(ruleRow?.auto_map_employee_code ?? DEFAULT_RULES.autoMapEmployeeCode),
    absentRequiresRoster: ruleRow?.absent_requires_roster != null ? Boolean(ruleRow.absent_requires_roster) : DEFAULT_RULES.absentRequiresRoster,
    oddPunchesNeedReview: ruleRow?.odd_punches_need_review != null ? Boolean(ruleRow.odd_punches_need_review) : DEFAULT_RULES.oddPunchesNeedReview,
    extraPunchesNeedReview: Boolean(ruleRow?.extra_punches_need_review ?? DEFAULT_RULES.extraPunchesNeedReview),
    timezone: String(ruleRow?.timezone ?? DEFAULT_RULES.timezone),
  };

  const shiftById = new Map((shifts ?? []).map((s) => [String(s.id), toShift(s as Record<string, unknown>)]));
  const fallbackShift = toShift((shifts ?? []).find((s) => !s.location_id) as Record<string, unknown> | undefined);
  const rosterByKey = new Map((roster ?? []).map((r) => [`${r.staff_id}|${r.work_date}`, r]));
  const leaveByKey = new Map((leaves ?? []).map((r) => [`${r.staff_id}|${r.leave_date}`, r]));
  const holidayByDate = new Map(
    (holidays ?? []).filter((h) => !h.location_id || h.location_id === locationId).map((h) => [String(h.holiday_date), String(h.name)]),
  );

  const groups = new Map<string, NonNullable<typeof logs>>();
  for (const log of logs ?? []) {
    const day = String(log.attendance_date ?? "").slice(0, 10);
    if (!day) continue;
    const subject = subjectKey(log.staff_id as string | null, String(log.device_id ?? ""), String(log.biometric_user_id ?? ""));
    const list = groups.get(`${subject}|${day}`) ?? [];
    list.push(log);
    groups.set(`${subject}|${day}`, list);
  }

  let processed = 0;
  for (const [key, punches] of groups) {
    const [subject, workDate] = key.split("|");
    const sample = punches[0];
    const staffId = (sample.staff_id as string | null) ?? null;
    const rosterRow = staffId ? rosterByKey.get(`${staffId}|${workDate}`) : undefined;
    const leaveRow = staffId ? leaveByKey.get(`${staffId}|${workDate}`) : undefined;
    const shift = rosterRow?.shift_template_id ? shiftById.get(String(rosterRow.shift_template_id)) ?? fallbackShift : fallbackShift;
    const marked = markProbableDuplicates(
      punches.map((p) => ({
        punchAt: p.punch_at as string,
        probableDuplicate: Boolean(p.probable_duplicate),
        excludedFromCalc: Boolean(p.excluded_from_calc),
      })),
      rules.duplicateWindowSeconds,
    );
    const calc = calculateDailyAttendance(marked, {
      workDate,
      scheduled: Boolean(rosterRow) && !rosterRow?.is_week_off,
      weekOff: Boolean(rosterRow?.is_week_off),
      holidayName: holidayByDate.get(workDate) ?? null,
      leaveType: (leaveRow?.leave_type as "annual_leave" | "sick_leave" | "unpaid_leave" | null) ?? null,
      shift,
      rules,
    });
    const { error: upsertError } = await supabase.from("attendance_daily_summary").upsert(
      {
        location_id: locationId,
        staff_id: staffId,
        work_date: workDate,
        subject_key: subject,
        actual_in: calc.actualIn,
        actual_out: calc.actualOut,
        status: calc.status,
        status_flags: calc.statusFlags,
        late_minutes: calc.lateMinutes,
        early_leave_minutes: calc.earlyLeaveMinutes,
        overtime_minutes: calc.overtimeMinutes,
        missed_punch: calc.missedPunch,
        punch_count: calc.validPunchCount,
        raw_punch_times: calc.rawPunchTimes,
        worked_minutes: calc.workedMinutes,
        regular_minutes: calc.regularMinutes,
        exception_reason: calc.exceptionReason,
        biometric_user_id: sample.biometric_user_id,
        device_id: sample.device_id,
        shift_template_id: rosterRow?.shift_template_id ?? null,
      },
      { onConflict: "location_id,subject_key,work_date" },
    );
    if (upsertError) throw upsertError;
    processed += 1;
  }

  let workStaffIds: string[] = [];
  try {
    const { data: links } = await supabase.from("staff_work_locations").select("staff_id").eq("location_id", locationId);
    workStaffIds = [...new Set((links ?? []).map((row) => String(row.staff_id)).filter(Boolean))];
  } catch {
    workStaffIds = [];
  }
  const workIdSet = new Set(workStaffIds);
  const fallbackStaffIds = (staffRows ?? [])
    .filter((row) => isActiveRosterStaff(row.status) && (row.location_id === locationId || workIdSet.has(row.id)))
    .map((row) => row.id);
  const covered = new Set<string>();
  for (const [key, punches] of groups) {
    const workDate = key.split("|").at(-1) ?? "";
    const staffId = (punches[0]?.staff_id as string | null) ?? null;
    if (staffId && workDate) covered.add(`${staffId}|${workDate}`);
  }

  for (const workDate of enumerateYmd(dateFrom, dateTo)) {
    const dayRoster = (roster ?? [])
      .filter((row) => String(row.work_date).slice(0, 10) === workDate)
      .map((row) => ({
        staff_id: String(row.staff_id),
        work_date: workDate,
        shift_template_id: (row.shift_template_id as string | null) ?? null,
        is_week_off: Boolean(row.is_week_off),
      }));
    const expected = expectedRowsForDay({
      workDate,
      dayRoster,
      fallbackStaffIds,
      coveredByUpload: isWorkDateCovered(workDate, coveragePeriods),
    });
    for (const rosterRow of expected) {
      const staffId = String(rosterRow.staff_id);
      if (covered.has(`${staffId}|${workDate}`)) continue;
      const leaveRow = leaveByKey.get(`${staffId}|${workDate}`);
      const shift = rosterRow.shift_template_id
        ? shiftById.get(String(rosterRow.shift_template_id)) ?? fallbackShift
        : fallbackShift;
      const calc = calculateDailyAttendance([], {
        workDate,
        scheduled: !rosterRow.is_week_off,
        weekOff: Boolean(rosterRow.is_week_off),
        holidayName: holidayByDate.get(workDate) ?? null,
        leaveType: (leaveRow?.leave_type as "annual_leave" | "sick_leave" | "unpaid_leave" | null) ?? null,
        shift,
        rules,
      });
      const { error: upsertError } = await supabase.from("attendance_daily_summary").upsert(
        {
          location_id: locationId,
          staff_id: staffId,
          work_date: workDate,
          subject_key: subjectKey(staffId, "", ""),
          actual_in: calc.actualIn,
          actual_out: calc.actualOut,
          status: calc.status,
          status_flags: calc.statusFlags,
          late_minutes: calc.lateMinutes,
          early_leave_minutes: calc.earlyLeaveMinutes,
          overtime_minutes: calc.overtimeMinutes,
          missed_punch: calc.missedPunch,
          punch_count: calc.validPunchCount,
          raw_punch_times: calc.rawPunchTimes,
          worked_minutes: calc.workedMinutes,
          regular_minutes: calc.regularMinutes,
          exception_reason: calc.exceptionReason,
          biometric_user_id: null,
          device_id: null,
          shift_template_id: rosterRow.shift_template_id ?? null,
        },
        { onConflict: "location_id,subject_key,work_date" },
      );
      if (upsertError) throw upsertError;
      covered.add(`${staffId}|${workDate}`);
      processed += 1;
    }
  }

  return { processed };
}

export const UPLOAD_LIMIT_BYTES = MAX_UPLOAD_BYTES;
