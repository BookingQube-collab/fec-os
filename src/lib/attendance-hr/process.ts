import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { isActiveRosterStaff } from "@/lib/staff-status";

import { calculateDailyAttendance, markProbableDuplicates } from "./calculate";
import {
  ATTENDANCE_DAILY_LIST_PAGE_SIZE,
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
import {
  crossSiteAnchorNeedsSummaryWrite,
  expandFlexibleBiometricPairsByDeviceName,
  flexibleDayHasQualifyingPunches,
  flexibleDayRecalcAction,
  flexibleNoPunchWriteAtLocation,
  staffUsesCrossSiteDayMerge,
  type FlexibleCrossSitePunch,
} from "./flexible-cross-site";
import { deviceLogUserPairsOrFilter } from "./device-logs";
import { normalizeShiftHm, scheduledIsoFromHm } from "./late-punch";
import {
  applyAttendanceShiftPolicy,
  isStandingWeeklyOff,
  resolveReportingAndBuffer,
  resolveWeekOff,
  type StaffFlexibleTiming,
  type StaffHoursPolicy,
} from "./shift-policy";

/** Page past PostgREST max_rows (~1000). Bare selects silently truncate a full site-month. */
async function fetchAllPaged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
    const { data, error } = await run(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
  }
  return out;
}

function hasShiftHm(time: string | null | undefined): boolean {
  return Boolean(normalizeShiftHm(time));
}

function scheduledBounds(workDate: string, shift: ShiftTemplateInput | null) {
  if (!shift || !hasShiftHm(shift.startTime)) {
    return { scheduled_in: null as string | null, scheduled_out: null as string | null };
  }
  const start = normalizeShiftHm(shift.startTime)!;
  const end = normalizeShiftHm(shift.endTime) ?? shift.endTime;
  return {
    scheduled_in: scheduledIsoFromHm(workDate, start),
    scheduled_out: hasShiftHm(end)
      ? scheduledIsoFromHm(workDate, end, shift.overnight ? 1 : 0)
      : null,
  };
}

type RosterDayRow = {
  staff_id: string;
  work_date: string;
  shift_template_id: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  is_week_off: boolean;
};

/** Prefer assignment clock times, then linked template — never invent DEFAULT 08:00 as roster start. */
function shiftForRosterDay(
  rosterRow: RosterDayRow | undefined,
  shiftById: Map<string, ShiftTemplateInput>,
): ShiftTemplateInput | null {
  if (!rosterRow || rosterRow.is_week_off) return null;
  const startFromRow = normalizeShiftHm(rosterRow.shift_start ?? null);
  const endFromRow = normalizeShiftHm(rosterRow.shift_end ?? null);
  if (rosterRow.shift_template_id) {
    const template = shiftById.get(String(rosterRow.shift_template_id));
    if (template) {
      return {
        ...template,
        startTime: startFromRow ?? template.startTime,
        endTime: endFromRow ?? template.endTime,
      };
    }
  }
  if (startFromRow && endFromRow) {
    return {
      ...DEFAULT_SHIFT,
      name: `${startFromRow}–${endFromRow}`,
      startTime: startFromRow,
      endTime: endFromRow,
      overnight: startFromRow > endFromRow,
    };
  }
  if (startFromRow) {
    return {
      ...DEFAULT_SHIFT,
      name: startFromRow,
      startTime: startFromRow,
      endTime: endFromRow ?? DEFAULT_SHIFT.endTime,
    };
  }
  return null;
}

export { buildPunchRows } from "./build-punch-rows";
export {
  BIOMETRIC_USER_CONFLICT,
  canonicalBiometricUserId,
  deviceNameByBiometricFromMappings,
  lookupStaffByBiometric,
  mergeBiometricUsersById,
  missingPunchBiometricIds,
  staffByBiometricFromMappings,
  stubBiometricUsersForIds,
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
  options?: { staffIds?: string[] },
) {
  const staffScope = options?.staffIds?.length ? [...new Set(options.staffIds.filter(Boolean))] : null;

  const buildLogsQuery = () => {
    let q = supabase
      .from("attendance_logs")
      .select(
        "id, staff_id, biometric_user_id, device_id, punch_at, probable_duplicate, excluded_from_calc, attendance_date, device_user_name",
      )
      .eq("location_id", locationId)
      .gte("attendance_date", dateFrom)
      .lte("attendance_date", dateTo)
      .order("id", { ascending: true });
    // Staff-scoped confirm must still see unmapped punches so bio / device_name
    // aliasing can attach them to the uploaded cafe staff.
    if (staffScope) {
      q = q.or(`staff_id.in.(${staffScope.join(",")}),staff_id.is.null`);
    }
    return q;
  };
  const buildRosterQuery = () => {
    let q = supabase
      .from("attendance_roster_assignments")
      .select("staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off")
      .eq("location_id", locationId)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("id", { ascending: true });
    if (staffScope) q = q.in("staff_id", staffScope);
    return q;
  };
  const buildLeaveQuery = () => {
    let q = supabase
      .from("attendance_leave_records")
      .select("staff_id, leave_date, leave_type")
      .eq("location_id", locationId)
      .gte("leave_date", dateFrom)
      .lte("leave_date", dateTo)
      .order("leave_date", { ascending: true })
      .order("staff_id", { ascending: true });
    if (staffScope) q = q.in("staff_id", staffScope);
    return q;
  };

  const [logs, roster, holidaysRes, leaves, shiftsRes, ruleRowsRes, staffRowsRes, locationRowRes, siteSettingRes] =
    await Promise.all([
      fetchAllPaged<Record<string, unknown>>((from, to) => buildLogsQuery().range(from, to)),
      fetchAllPaged<Record<string, unknown>>((from, to) => buildRosterQuery().range(from, to)),
      supabase.from("attendance_holidays").select("holiday_date, name, location_id").gte("holiday_date", dateFrom).lte("holiday_date", dateTo),
      fetchAllPaged<Record<string, unknown>>((from, to) => buildLeaveQuery().range(from, to)),
      supabase.from("attendance_shift_templates").select("*").eq("active", true),
      supabase.from("attendance_rule_sets").select("*").order("scope"),
      staffScope
        ? supabase
            .from("staff")
            .select(
              "id, location_id, status, employment_type, is_roaming, flexible_attendance, reporting_time_minutes, buffer_minutes, expected_hours, break_minutes, weekly_off_weekday",
            )
            .in("id", staffScope)
            .is("deleted_at", null)
        : supabase
            .from("staff")
            .select(
              "id, location_id, status, employment_type, is_roaming, flexible_attendance, reporting_time_minutes, buffer_minutes, expected_hours, break_minutes, weekly_off_weekday",
            )
            .is("deleted_at", null)
            .limit(5000),
      supabase.from("locations").select("id, code").eq("id", locationId).maybeSingle(),
      supabase
        .from("attendance_site_settings")
        .select("break_minutes, reporting_time_minutes, buffer_minutes, permanent_hours, secondment_hours, joker_hours")
        .eq("location_id", locationId)
        .maybeSingle(),
    ]);
  if (holidaysRes.error) throw holidaysRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (ruleRowsRes.error) throw ruleRowsRes.error;
  if (staffRowsRes.error) throw staffRowsRes.error;
  const holidays = holidaysRes.data;
  const shifts = shiftsRes.data;
  const ruleRows = ruleRowsRes.data;
  const staffRows = staffRowsRes.data;
  const locationRow = locationRowRes.data;
  const siteSetting = siteSettingRes.data;
  const locationCode = locationRow?.code ? String(locationRow.code) : null;
  const sitePolicy = (siteSetting ?? null) as {
    break_minutes?: number | null;
    reporting_time_minutes?: number | null;
    buffer_minutes?: number | null;
    permanent_hours?: number | null;
    secondment_hours?: number | null;
    joker_hours?: number | null;
  } | null;
  const breakMinutesOverride =
    sitePolicy?.break_minutes != null ? Number(sitePolicy.break_minutes) : null;
  const reportingTimeMinutesOverride =
    sitePolicy?.reporting_time_minutes != null ? Number(sitePolicy.reporting_time_minutes) : null;
  const bufferMinutesOverride =
    sitePolicy?.buffer_minutes != null ? Number(sitePolicy.buffer_minutes) : null;
  const permanentHours =
    sitePolicy?.permanent_hours != null ? Number(sitePolicy.permanent_hours) : null;
  const secondmentHours =
    sitePolicy?.secondment_hours != null ? Number(sitePolicy.secondment_hours) : null;
  const jokerHours = sitePolicy?.joker_hours != null ? Number(sitePolicy.joker_hours) : null;
  const employmentByStaffId = new Map(
    (staffRows ?? []).map((row) => [String(row.id), (row as { employment_type?: string | null }).employment_type ?? null]),
  );
  const homeLocationByStaffId = new Map(
    (staffRows ?? []).map((row) => [
      String(row.id),
      (row as { location_id?: string | null }).location_id
        ? String((row as { location_id?: string | null }).location_id)
        : "",
    ]),
  );
  const flexibleByStaffId = new Map<string, StaffFlexibleTiming>(
    (staffRows ?? []).map((row) => {
      const r = row as {
        flexible_attendance?: boolean | null;
        reporting_time_minutes?: number | null;
        buffer_minutes?: number | null;
      };
      return [
        String(row.id),
        {
          flexibleAttendance: Boolean(r.flexible_attendance),
          reportingTimeMinutes: r.reporting_time_minutes ?? null,
          bufferMinutes: r.buffer_minutes ?? null,
        } satisfies StaffFlexibleTiming,
      ];
    }),
  );
  const hoursPolicyByStaffId = new Map<string, StaffHoursPolicy>(
    (staffRows ?? []).map((row) => {
      const r = row as {
        expected_hours?: number | null;
        break_minutes?: number | null;
        weekly_off_weekday?: number | null;
      };
      return [
        String(row.id),
        {
          expectedHours: r.expected_hours == null ? null : Number(r.expected_hours),
          breakMinutes: r.break_minutes == null ? null : Number(r.break_minutes),
          weeklyOffWeekday: r.weekly_off_weekday == null ? null : Number(r.weekly_off_weekday),
        } satisfies StaffHoursPolicy,
      ];
    }),
  );
  const roamingByStaffId = new Map(
    (staffRows ?? []).map((row) => [
      String(row.id),
      Boolean((row as { is_roaming?: boolean | null }).is_roaming),
    ]),
  );
  const workLocationCountByStaffId = new Map<string, number>();
  {
    const ids = (staffRows ?? []).map((row) => String(row.id)).filter(Boolean);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: links, error: linkErr } = await supabase
        .from("staff_work_locations")
        .select("staff_id")
        .in("staff_id", chunk);
      if (linkErr) throw linkErr;
      for (const link of links ?? []) {
        const sid = String(link.staff_id ?? "");
        if (!sid) continue;
        workLocationCountByStaffId.set(sid, (workLocationCountByStaffId.get(sid) ?? 0) + 1);
      }
    }
  }
  const crossSiteStaffIdSet = new Set(
    (staffRows ?? [])
      .map((row) => String(row.id))
      .filter((id) =>
        staffUsesCrossSiteDayMerge({
          flexibleAttendance: flexibleByStaffId.get(id)?.flexibleAttendance,
          isRoaming: roamingByStaffId.get(id),
          workLocationCount: workLocationCountByStaffId.get(id) ?? 0,
        }),
      )
      .filter((id) => !staffScope || staffScope.includes(id)),
  );

  function timingForStaff(staffId: string | null | undefined) {
    const flex = staffId ? flexibleByStaffId.get(staffId) : undefined;
    const resolved = resolveReportingAndBuffer({
      siteReporting: reportingTimeMinutesOverride,
      siteBuffer: bufferMinutesOverride,
      staff: flex,
    });
    return { flex, ...resolved };
  }

  function hoursForStaff(staffId: string | null | undefined) {
    return staffId ? hoursPolicyByStaffId.get(staffId) : undefined;
  }

  function weekOffForDay(
    staffId: string | null | undefined,
    workDate: string,
    realRoster: RosterDayRow | null | undefined,
    hasLeave = false,
  ): boolean {
    if (hasLeave) return false;
    const policy = hoursForStaff(staffId);
    return resolveWeekOff({
      hasRosterRow: Boolean(realRoster),
      rosterIsWeekOff: realRoster?.is_week_off,
      workDate,
      weeklyOffWeekday: policy?.weeklyOffWeekday,
    });
  }

  function shiftPolicyOpts(
    staffId: string | null | undefined,
    timing: ReturnType<typeof timingForStaff>,
  ) {
    const hours = hoursForStaff(staffId);
    const staffBreak =
      hours?.breakMinutes != null && Number.isFinite(Number(hours.breakMinutes))
        ? Number(hours.breakMinutes)
        : null;
    return {
      employmentType: staffId ? employmentByStaffId.get(staffId) ?? null : null,
      locationCode,
      // Staff break → site break → UA/default (via breakMinutesForLocation).
      breakMinutesOverride: staffBreak ?? breakMinutesOverride,
      expectedHoursOverride: hours?.expectedHours ?? null,
      reportingTimeMinutesOverride: timing.reportingTimeMinutes,
      bufferMinutesOverride: timing.bufferMinutes,
      permanentHours,
      secondmentHours,
      jokerHours,
      lateFromShiftStart: Boolean(timing.flex?.flexibleAttendance),
    };
  }

  const crossSiteStaffIds = [...crossSiteStaffIdSet];

  /** staffId|workDate → punches from every location (flexible / multisite merge). */
  const crossPunchesByStaffDay = new Map<string, Array<FlexibleCrossSitePunch & { id?: string; device_id?: string | null; biometric_user_id?: string | null }>>();
  /** staffId|workDate → roster row from any site (prefer this location). */
  const crossRosterByStaffDay = new Map<string, RosterDayRow>();

  if (crossSiteStaffIds.length) {
    const buildCrossLogsQuery = () =>
      supabase
        .from("attendance_logs")
        .select(
          "id, location_id, staff_id, biometric_user_id, device_id, punch_at, probable_duplicate, excluded_from_calc, attendance_date",
        )
        .in("staff_id", crossSiteStaffIds)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .order("id", { ascending: true });
    const buildCrossRosterQuery = () =>
      supabase
        .from("attendance_roster_assignments")
        .select("staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off, location_id")
        .in("staff_id", crossSiteStaffIds)
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .order("id", { ascending: true });
    const [crossLogs, crossRoster] = await Promise.all([
      fetchAllPaged<Record<string, unknown>>((from, to) => buildCrossLogsQuery().range(from, to)),
      fetchAllPaged<Record<string, unknown>>((from, to) => buildCrossRosterQuery().range(from, to)),
    ]);

    const addCrossPunch = (log: Record<string, unknown>, staffIdOverride?: string) => {
      const staffId = (staffIdOverride || (log.staff_id ? String(log.staff_id) : "")).trim();
      const day = String(log.attendance_date ?? "").slice(0, 10);
      if (!staffId || !day) return;
      const key = `${staffId}|${day}`;
      const list = crossPunchesByStaffDay.get(key) ?? [];
      const punchId = log.id ? String(log.id) : "";
      if (punchId && list.some((p) => p.id === punchId)) return;
      list.push({
        id: punchId || undefined,
        locationId: String(log.location_id),
        punchAt: String(log.punch_at),
        biometricUserId: log.biometric_user_id == null ? null : String(log.biometric_user_id),
        probableDuplicate: Boolean(log.probable_duplicate),
        excludedFromCalc: Boolean(log.excluded_from_calc),
        device_id: (log.device_id as string | null) ?? null,
        biometric_user_id: (log.biometric_user_id as string | null) ?? null,
      });
      crossPunchesByStaffDay.set(key, list);
    };

    for (const log of crossLogs) addCrossPunch(log);

    // Unmapped / null-staff punches at other sites: resolve via biometric registry + same device_name.
    const mappedBios: Array<{
      staffId: string | null;
      locationId: string;
      biometricUserId: string;
      deviceName?: string | null;
    }> = [];
    const deviceNames = new Set<string>();
    for (let i = 0; i < crossSiteStaffIds.length; i += 200) {
      const chunk = crossSiteStaffIds.slice(i, i + 200);
      const { data: maps, error: mapErr } = await supabase
        .from("attendance_biometric_users")
        .select("staff_id, location_id, biometric_user_id, device_name")
        .in("staff_id", chunk)
        .limit(5000);
      if (mapErr) throw mapErr;
      for (const row of maps ?? []) {
        const staffId = row.staff_id ? String(row.staff_id) : "";
        const locationId = String(row.location_id ?? "");
        const biometricUserId = String(row.biometric_user_id ?? "").trim();
        const deviceName = row.device_name == null ? null : String(row.device_name);
        if (!staffId || !locationId || !biometricUserId) continue;
        mappedBios.push({ staffId, locationId, biometricUserId, deviceName });
        const trimmed = deviceName?.trim();
        if (trimmed) deviceNames.add(trimmed);
      }
    }
    const catalog = [...mappedBios];
    if (deviceNames.size) {
      const nameFilter = [...deviceNames]
        .map((name) => `device_name.ilike.${name.replace(/[,()%]/g, "")}`)
        .filter((part) => part.length > "device_name.ilike.".length)
        .join(",");
      if (nameFilter) {
        const { data: aliasRows, error: aliasErr } = await supabase
          .from("attendance_biometric_users")
          .select("staff_id, location_id, biometric_user_id, device_name")
          .or(nameFilter)
          .limit(5000);
        if (aliasErr) throw aliasErr;
        for (const row of aliasRows ?? []) {
          catalog.push({
            staffId: row.staff_id ? String(row.staff_id) : null,
            locationId: String(row.location_id ?? ""),
            biometricUserId: String(row.biometric_user_id ?? "").trim(),
            deviceName: row.device_name == null ? null : String(row.device_name),
          });
        }
      }
    }
    const expanded = expandFlexibleBiometricPairsByDeviceName(mappedBios, catalog);
    const staffByLocUser = new Map<string, string>();
    const bioPairs: Array<{ locationId: string; biometricUserId: string }> = [];
    for (const pair of expanded) {
      staffByLocUser.set(`${pair.locationId}|${pair.biometricUserId}`, pair.staffId);
      bioPairs.push({ locationId: pair.locationId, biometricUserId: pair.biometricUserId });
    }
    for (let i = 0; i < bioPairs.length; i += 40) {
      const chunk = bioPairs.slice(i, i + 40);
      const pairFilter = deviceLogUserPairsOrFilter(chunk);
      if (!pairFilter) continue;
      const aliasLogs = await fetchAllPaged<Record<string, unknown>>((from, to) =>
        supabase
          .from("attendance_logs")
          .select(
            "id, location_id, staff_id, biometric_user_id, device_id, punch_at, probable_duplicate, excluded_from_calc, attendance_date, device_user_name",
          )
          .or(pairFilter)
          .gte("attendance_date", dateFrom)
          .lte("attendance_date", dateTo)
          .order("id", { ascending: true })
          .range(from, to),
      );
      for (const log of aliasLogs) {
        const locationId = String(log.location_id ?? "");
        const biometricUserId =
          log.biometric_user_id == null ? "" : String(log.biometric_user_id).trim();
        const staffId =
          (log.staff_id ? String(log.staff_id) : "") ||
          (biometricUserId ? staffByLocUser.get(`${locationId}|${biometricUserId}`) ?? "" : "");
        addCrossPunch(log, staffId);
      }
    }

    // Last resort: punches whose device_user_name matches a flexible staff device_name
    // when the biometric id was never written to attendance_biometric_users.
    const staffByDeviceName = new Map<string, string>();
    for (const row of mappedBios) {
      const staffId = row.staffId?.trim();
      const name = (row.deviceName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!staffId || !name || staffByDeviceName.has(name)) continue;
      staffByDeviceName.set(name, staffId);
    }
    if (staffByDeviceName.size && deviceNames.size) {
      const nameFilter = [...deviceNames]
        .map((name) => `device_user_name.ilike.${name.replace(/[,()%]/g, "")}`)
        .filter((part) => part.length > "device_user_name.ilike.".length)
        .join(",");
      if (nameFilter) {
        const nameLogs = await fetchAllPaged<Record<string, unknown>>((from, to) =>
          supabase
            .from("attendance_logs")
            .select(
              "id, location_id, staff_id, biometric_user_id, device_id, device_user_name, punch_at, probable_duplicate, excluded_from_calc, attendance_date",
            )
            .or(nameFilter)
            .gte("attendance_date", dateFrom)
            .lte("attendance_date", dateTo)
            .order("id", { ascending: true })
            .range(from, to),
        );
        for (const log of nameLogs) {
          const locationId = String(log.location_id ?? "");
          const biometricUserId =
            log.biometric_user_id == null ? "" : String(log.biometric_user_id).trim();
          const punchName = String(log.device_user_name ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
          const staffId =
            (log.staff_id ? String(log.staff_id) : "") ||
            (biometricUserId ? staffByLocUser.get(`${locationId}|${biometricUserId}`) ?? "" : "") ||
            (punchName ? staffByDeviceName.get(punchName) ?? "" : "");
          if (!staffId || !crossSiteStaffIdSet.has(staffId)) continue;
          addCrossPunch(log, staffId);
        }
      }
    }

    for (const r of crossRoster) {
      const staffId = String(r.staff_id);
      const day = String(r.work_date).slice(0, 10);
      const key = `${staffId}|${day}`;
      const row: RosterDayRow = {
        staff_id: staffId,
        work_date: day,
        shift_template_id: (r.shift_template_id as string | null) ?? null,
        shift_start: (r as { shift_start?: string | null }).shift_start ?? null,
        shift_end: (r as { shift_end?: string | null }).shift_end ?? null,
        is_week_off: Boolean(r.is_week_off),
      };
      const existing = crossRosterByStaffDay.get(key);
      const rowLoc = String((r as { location_id?: string }).location_id ?? "");
      // Prefer this location; otherwise prefer week-off over an on-duty sibling site.
      if (
        !existing ||
        rowLoc === locationId ||
        (row.is_week_off && !existing.is_week_off)
      ) {
        crossRosterByStaffDay.set(key, row);
      }
    }
  }

  const summaryDeletes: Array<{ location_id: string; staff_id: string; work_date: string }> = [];
  /** Flexible days written at the anchor: wipe every other site's summary for that person-day. */
  const flexibleKeepOnly: Array<{ staff_id: string; work_date: string; keep_location_id: string }> = [];

  function queueSummaryDelete(locId: string, staffId: string, workDate: string) {
    summaryDeletes.push({ location_id: locId, staff_id: staffId, work_date: workDate });
  }

  function queueFlexibleKeepOnly(staffId: string, workDate: string, keepLocationId: string) {
    flexibleKeepOnly.push({
      staff_id: staffId,
      work_date: workDate,
      keep_location_id: keepLocationId,
    });
  }

  let coveragePeriods: Array<{ start: string; end: string }> = [];
  if (!staffScope) {
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
  }

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
  const rosterByKey = new Map<string, RosterDayRow>(
    (roster ?? []).map((r) => [
      `${r.staff_id}|${r.work_date}`,
      {
        staff_id: String(r.staff_id),
        work_date: String(r.work_date).slice(0, 10),
        shift_template_id: (r.shift_template_id as string | null) ?? null,
        shift_start: (r as { shift_start?: string | null }).shift_start ?? null,
        shift_end: (r as { shift_end?: string | null }).shift_end ?? null,
        is_week_off: Boolean(r.is_week_off),
      },
    ]),
  );
  const leaveByKey = new Map(
    (leaves ?? []).map((r) => [`${r.staff_id}|${String(r.leave_date).slice(0, 10)}`, r]),
  );
  const holidayByDate = new Map(
    (holidays ?? []).filter((h) => !h.location_id || h.location_id === locationId).map((h) => [String(h.holiday_date), String(h.name)]),
  );

  const groups = new Map<string, NonNullable<typeof logs>>();
  // Resolve null-staff punches via this site's biometric registry before grouping
  // (ADMS often leaves staff_id null until Mapping is saved).
  const localStaffByLocUser = new Map<string, string>();
  {
    const bioIds = [
      ...new Set(
        (logs ?? [])
          .map((log) => String(log.biometric_user_id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    if (bioIds.length) {
      for (let i = 0; i < bioIds.length; i += 200) {
        const chunk = bioIds.slice(i, i + 200);
        const { data: maps, error: mapErr } = await supabase
          .from("attendance_biometric_users")
          .select("staff_id, biometric_user_id")
          .eq("location_id", locationId)
          .in("biometric_user_id", chunk)
          .not("staff_id", "is", null)
          .limit(5000);
        if (mapErr) throw mapErr;
        for (const row of maps ?? []) {
          const uid = String(row.biometric_user_id ?? "").trim();
          const sid = row.staff_id ? String(row.staff_id) : "";
          if (!uid || !sid) continue;
          if (!localStaffByLocUser.has(uid)) localStaffByLocUser.set(uid, sid);
        }
      }
    }
  }
  // Cross-site alias resolution may attach a staff_id to punches that local bio
  // mapping missed — stamp those onto local logs so groups write a mapped summary
  // (otherwise write_merged marks the day covered and roster emit is skipped → gap).
  const crossStaffByLogId = new Map<string, string>();
  for (const [crossKey, punches] of crossPunchesByStaffDay) {
    const sep = crossKey.lastIndexOf("|");
    const staffId = sep >= 0 ? crossKey.slice(0, sep) : "";
    if (!staffId) continue;
    for (const p of punches) {
      if (p.id && p.locationId === locationId) crossStaffByLogId.set(p.id, staffId);
    }
  }
  for (const log of logs ?? []) {
    const day = String(log.attendance_date ?? "").slice(0, 10);
    if (!day) continue;
    const biometricUserId = String(log.biometric_user_id ?? "").trim();
    const logId = log.id ? String(log.id) : "";
    const resolvedStaff =
      (log.staff_id ? String(log.staff_id) : "") ||
      (biometricUserId ? localStaffByLocUser.get(biometricUserId) ?? "" : "") ||
      (logId ? crossStaffByLogId.get(logId) ?? "" : "");
    if (staffScope && resolvedStaff && !staffScope.includes(resolvedStaff)) continue;
    if (staffScope && !resolvedStaff) continue;
    if (resolvedStaff && !log.staff_id) {
      (log as { staff_id?: string | null }).staff_id = resolvedStaff;
    }
    const subject = subjectKey(
      (log.staff_id as string | null) ?? null,
      String(log.device_id ?? ""),
      String(log.biometric_user_id ?? ""),
    );
    const list = groups.get(`${subject}|${day}`) ?? [];
    list.push(log);
    groups.set(`${subject}|${day}`, list);
  }

  const summaryRows: Array<Record<string, unknown>> = [];
  let processed = 0;
  for (const [key, punches] of groups) {
    const sep = key.lastIndexOf("|");
    const subject = sep >= 0 ? key.slice(0, sep) : key;
    const workDate = sep >= 0 ? key.slice(sep + 1) : "";
    const sample = punches[0];
    const staffId = (sample.staff_id as string | null) ?? null;
    const flex = staffId ? flexibleByStaffId.get(staffId) : undefined;
    const crossKey = staffId && workDate ? `${staffId}|${workDate}` : "";
    const crossPunches = crossKey ? crossPunchesByStaffDay.get(crossKey) ?? [] : [];

    let punchSource: Array<{
      id?: string;
      punch_at: string;
      probable_duplicate?: boolean | null;
      excluded_from_calc?: boolean | null;
      device_id?: string | null;
      biometric_user_id?: string | null;
    }> = punches.map((p) => ({
      id: p.id as string,
      punch_at: p.punch_at as string,
      probable_duplicate: p.probable_duplicate as boolean | null,
      excluded_from_calc: p.excluded_from_calc as boolean | null,
      device_id: p.device_id as string | null,
      biometric_user_id: p.biometric_user_id as string | null,
    }));

    let rosterRow = staffId ? rosterByKey.get(`${staffId}|${workDate}`) : undefined;
    const crossRosterRow = crossKey ? crossRosterByStaffDay.get(crossKey) : undefined;
    // Week-off at any site wins — leftover times on an on-duty sibling must not schedule Absent.
    if (crossRosterRow?.is_week_off && !rosterRow?.is_week_off) {
      rosterRow = {
        ...crossRosterRow,
        shift_template_id: null,
        shift_start: null,
        shift_end: null,
        is_week_off: true,
      };
    } else if (!rosterRow && crossRosterRow) {
      rosterRow = crossRosterRow;
    }

    if (staffId && workDate && crossSiteStaffIdSet.has(staffId)) {
      const across =
        crossPunches.length > 0
          ? crossPunches
          : punches.map((p) => ({
              locationId,
              punchAt: String(p.punch_at),
              probableDuplicate: Boolean(p.probable_duplicate),
              excludedFromCalc: Boolean(p.excluded_from_calc),
            }));
      const action = flexibleDayRecalcAction({ locationId, punchesAcrossSites: across });
      if (action === "suppress") {
        queueSummaryDelete(locationId, staffId, workDate);
        continue;
      }
      if (action === "write_merged") {
        if (crossPunches.length > 0) {
          punchSource = crossPunches.map((p) => ({
            id: p.id,
            punch_at: p.punchAt,
            probable_duplicate: p.probableDuplicate,
            excluded_from_calc: p.excludedFromCalc,
            device_id: p.device_id,
            biometric_user_id: p.biometric_user_id,
          }));
          if (!rosterRow) rosterRow = crossRosterByStaffDay.get(crossKey);
        }
        // Wipe roster ABSENT fillers at other work sites too — not only punch sites.
        queueFlexibleKeepOnly(staffId, workDate, locationId);
      }
    }

    const leaveRow = staffId ? leaveByKey.get(`${staffId}|${workDate}`) : undefined;
    // Shift start/end always from roster upload — never staff.flexible_shift_* profile fields.
    const rosterShift = shiftForRosterDay(rosterRow, shiftById);
    const timing = timingForStaff(staffId);
    // Hours/break: staff override → site default (see resolveStaffHoursAndBreak / applyAttendanceShiftPolicy).
    const shift = applyAttendanceShiftPolicy(rosterShift ?? DEFAULT_SHIFT, shiftPolicyOpts(staffId, timing));
    const shiftForCalc: ShiftTemplateInput = rosterShift
      ? { ...shift, startTime: rosterShift.startTime, endTime: rosterShift.endTime, overnight: rosterShift.overnight }
      : { ...shift, startTime: "", endTime: "" };
    const dayWeekOff = weekOffForDay(staffId, workDate, rosterRow ?? null, Boolean(leaveRow?.leave_type));
    // Recompute duplicate flags from scratch (ignore stale DB flags from cross-user ingest bugs).
    const marked = markProbableDuplicates(
      punchSource.map((p) => ({
        id: p.id,
        punchAt: p.punch_at,
        probableDuplicate: false,
        excludedFromCalc: false,
      })),
      rules.duplicateWindowSeconds,
    );
    const flagUpdates = marked
      .filter((m) => m.id)
      .map((m) => {
        const original = punchSource.find((p) => p.id === m.id);
        const nextDup = Boolean(m.probableDuplicate);
        const prevDup = Boolean(original?.probable_duplicate);
        const prevExcl = Boolean(original?.excluded_from_calc);
        if (prevDup === nextDup && prevExcl === nextDup) return null;
        return { id: m.id as string, probable_duplicate: nextDup, excluded_from_calc: nextDup };
      })
      .filter((row): row is { id: string; probable_duplicate: boolean; excluded_from_calc: boolean } => Boolean(row));
    for (let i = 0; i < flagUpdates.length; i += 40) {
      const chunk = flagUpdates.slice(i, i + 40);
      await Promise.all(
        chunk.map(async (row) => {
          const { error: flagError } = await supabase
            .from("attendance_logs")
            .update({
              probable_duplicate: row.probable_duplicate,
              excluded_from_calc: row.excluded_from_calc,
            })
            .eq("id", row.id);
          if (flagError) throw flagError;
        }),
      );
    }
    const calc = calculateDailyAttendance(marked, {
      workDate,
      scheduled: Boolean(rosterRow) && !dayWeekOff,
      weekOff: dayWeekOff,
      holidayName: holidayByDate.get(workDate) ?? null,
      leaveType: (leaveRow?.leave_type as "annual_leave" | "sick_leave" | "unpaid_leave" | null) ?? null,
      shift: shiftForCalc,
      rules,
    });
    const deviceSample = punchSource.find((p) => p.device_id) ?? punchSource[0];
    summaryRows.push({
      location_id: locationId,
      staff_id: staffId,
      work_date: workDate,
      subject_key: subject,
      actual_in: calc.actualIn,
      actual_out: calc.actualOut,
      ...scheduledBounds(workDate, shiftForCalc),
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
      biometric_user_id: deviceSample?.biometric_user_id ?? sample.biometric_user_id,
      device_id: deviceSample?.device_id ?? sample.device_id,
      shift_template_id: rosterRow?.shift_template_id ?? null,
    });
    processed += 1;
  }

  /** Write Present from cross-site punches when groups never emitted a summary for the anchor. */
  function writeMergedSummaryFromCross(
    staffId: string,
    workDate: string,
    crossPunches: Array<
      FlexibleCrossSitePunch & { id?: string; device_id?: string | null; biometric_user_id?: string | null }
    >,
  ) {
    let rosterRow = rosterByKey.get(`${staffId}|${workDate}`);
    const crossRosterRow = crossRosterByStaffDay.get(`${staffId}|${workDate}`);
    if (crossRosterRow?.is_week_off && !rosterRow?.is_week_off) {
      rosterRow = {
        ...crossRosterRow,
        shift_template_id: null,
        shift_start: null,
        shift_end: null,
        is_week_off: true,
      };
    } else if (!rosterRow && crossRosterRow) {
      rosterRow = crossRosterRow;
    }
    const leaveRow = leaveByKey.get(`${staffId}|${workDate}`);
    const punchSource = crossPunches.map((p) => ({
      id: p.id,
      punch_at: p.punchAt,
      probable_duplicate: p.probableDuplicate,
      excluded_from_calc: p.excludedFromCalc,
      device_id: p.device_id,
      biometric_user_id: p.biometric_user_id,
    }));
    const rosterShift = shiftForRosterDay(rosterRow, shiftById);
    const timing = timingForStaff(staffId);
    const shift = applyAttendanceShiftPolicy(rosterShift ?? DEFAULT_SHIFT, shiftPolicyOpts(staffId, timing));
    const shiftForCalc: ShiftTemplateInput = rosterShift
      ? { ...shift, startTime: rosterShift.startTime, endTime: rosterShift.endTime, overnight: rosterShift.overnight }
      : { ...shift, startTime: "", endTime: "" };
    const dayWeekOff = weekOffForDay(staffId, workDate, rosterRow ?? null, Boolean(leaveRow?.leave_type));
    const marked = markProbableDuplicates(
      punchSource.map((p) => ({
        id: p.id,
        punchAt: p.punch_at,
        probableDuplicate: false,
        excludedFromCalc: false,
      })),
      rules.duplicateWindowSeconds,
    );
    const calc = calculateDailyAttendance(marked, {
      workDate,
      scheduled: Boolean(rosterRow) && !dayWeekOff,
      weekOff: dayWeekOff,
      holidayName: holidayByDate.get(workDate) ?? null,
      leaveType: (leaveRow?.leave_type as "annual_leave" | "sick_leave" | "unpaid_leave" | null) ?? null,
      shift: shiftForCalc,
      rules,
    });
    const deviceSample = punchSource.find((p) => p.device_id) ?? punchSource[0];
    summaryRows.push({
      location_id: locationId,
      staff_id: staffId,
      work_date: workDate,
      subject_key: subjectKey(staffId, "", ""),
      actual_in: calc.actualIn,
      actual_out: calc.actualOut,
      ...scheduledBounds(workDate, shiftForCalc),
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
      biometric_user_id: deviceSample?.biometric_user_id ?? null,
      device_id: deviceSample?.device_id ?? null,
      shift_template_id: rosterRow?.shift_template_id ?? null,
    });
    processed += 1;
    queueFlexibleKeepOnly(staffId, workDate, locationId);
  }

  let workStaffIds: string[] = [];
  if (!staffScope) {
    try {
      const { data: links } = await supabase.from("staff_work_locations").select("staff_id").eq("location_id", locationId);
      workStaffIds = [...new Set((links ?? []).map((row) => String(row.staff_id)).filter(Boolean))];
    } catch {
      workStaffIds = [];
    }
  }
  const workIdSet = new Set(workStaffIds);
  // Staff-scoped confirm must not expand to the whole site directory.
  const fallbackStaffIds = staffScope
    ? []
    : (staffRows ?? [])
      .filter((row) => isActiveRosterStaff(row.status) && (row.location_id === locationId || workIdSet.has(row.id)))
      .map((row) => row.id);
  const covered = new Set<string>();
  for (const [key, punches] of groups) {
    const workDate = key.split("|").at(-1) ?? "";
    const staffId = (punches[0]?.staff_id as string | null) ?? null;
    if (staffId && workDate) covered.add(`${staffId}|${workDate}`);
  }
  // Flexible / multisite staff who punched at another site: treat as covered here so we do not emit ABSENT.
  for (const [crossKey, crossPunches] of crossPunchesByStaffDay) {
    if (!flexibleDayHasQualifyingPunches(crossPunches)) continue;
    const action = flexibleDayRecalcAction({ locationId, punchesAcrossSites: crossPunches });
    if (action === "suppress") {
      const sep = crossKey.lastIndexOf("|");
      const staffId = sep >= 0 ? crossKey.slice(0, sep) : "";
      const workDate = sep >= 0 ? crossKey.slice(sep + 1) : "";
      if (staffId && workDate) {
        covered.add(crossKey);
        queueSummaryDelete(locationId, staffId, workDate);
      }
    } else if (
      crossSiteAnchorNeedsSummaryWrite({
        locationId,
        punchesAcrossSites: crossPunches,
        alreadyWroteSummary: covered.has(crossKey),
      })
    ) {
      // Alias-resolved punches can sit in the cross map while staff-scoped grouping
      // never wrote — cover-without-write blanked Maheraj / cafe grids.
      const sep = crossKey.lastIndexOf("|");
      const staffId = sep >= 0 ? crossKey.slice(0, sep) : "";
      const workDate = sep >= 0 ? crossKey.slice(sep + 1) : "";
      if (staffId && workDate) {
        writeMergedSummaryFromCross(staffId, workDate, crossPunches);
        covered.add(crossKey);
      }
    } else if (action === "write_merged") {
      covered.add(crossKey);
    }
  }

  for (const workDate of enumerateYmd(dateFrom, dateTo)) {
    const dayRoster = (roster ?? [])
      .filter((row) => String(row.work_date).slice(0, 10) === workDate)
      .map((row) => ({
        staff_id: String(row.staff_id),
        work_date: workDate,
        shift_template_id: (row.shift_template_id as string | null) ?? null,
        shift_start: (row as { shift_start?: string | null }).shift_start ?? null,
        shift_end: (row as { shift_end?: string | null }).shift_end ?? null,
        is_week_off: Boolean(row.is_week_off),
      }));
    const expected = expectedRowsForDay({
      workDate,
      dayRoster,
      fallbackStaffIds,
      // Staff patches do not own location coverage — avoid clearing other staff as unexpected.
      coveredByUpload: staffScope ? false : isWorkDateCovered(workDate, coveragePeriods),
    });
    // Leave days must still produce summaries when roster coverage omitted the person (common for annual leave).
    const expectedIds = new Set(expected.map((row) => row.staff_id));
    for (const leaveKey of leaveByKey.keys()) {
      const sep = leaveKey.lastIndexOf("|");
      const leaveStaffId = sep >= 0 ? leaveKey.slice(0, sep) : "";
      const leaveDate = sep >= 0 ? leaveKey.slice(sep + 1) : "";
      if (leaveDate !== workDate || !leaveStaffId || expectedIds.has(leaveStaffId)) continue;
      if (staffScope && !staffScope.includes(leaveStaffId)) continue;
      expected.push({
        staff_id: leaveStaffId,
        work_date: workDate,
        shift_template_id: null,
        is_week_off: false,
      });
      expectedIds.add(leaveStaffId);
    }
    // Cross-site roster only at another site: emit Weekly off / ABSENT at home.
    // Without this, multisite cafe staff rostered at a non-home site get blank
    // grid cells (non-home suppresses ABSENT; home never sees the roster row).
    for (const [crossKey, crossRow] of crossRosterByStaffDay) {
      const sep = crossKey.lastIndexOf("|");
      const crossStaffId = sep >= 0 ? crossKey.slice(0, sep) : "";
      const crossDate = sep >= 0 ? crossKey.slice(sep + 1) : "";
      if (crossDate !== workDate || !crossStaffId || expectedIds.has(crossStaffId)) continue;
      if (staffScope && !staffScope.includes(crossStaffId)) continue;
      if (!crossSiteStaffIdSet.has(crossStaffId)) continue;
      const homeId = homeLocationByStaffId.get(crossStaffId) || "";
      if (homeId && homeId !== locationId) continue;
      expected.push({
        staff_id: crossStaffId,
        work_date: workDate,
        shift_template_id: crossRow.is_week_off
          ? null
          : ((crossRow.shift_template_id as string | null) ?? null),
        shift_start: crossRow.is_week_off
          ? null
          : ((crossRow as { shift_start?: string | null }).shift_start ?? null),
        shift_end: crossRow.is_week_off
          ? null
          : ((crossRow as { shift_end?: string | null }).shift_end ?? null),
        is_week_off: Boolean(crossRow.is_week_off),
      });
      expectedIds.add(crossStaffId);
    }
    // Standing weekly-off (staff.weekly_off_weekday) when no roster row for the day.
    for (const [sid, policy] of hoursPolicyByStaffId) {
      if (expectedIds.has(sid)) continue;
      if (staffScope && !staffScope.includes(sid)) continue;
      if (!isStandingWeeklyOff(workDate, policy.weeklyOffWeekday)) continue;
      const homeId = homeLocationByStaffId.get(sid) || "";
      if (homeId && homeId !== locationId) continue;
      expected.push({
        staff_id: sid,
        work_date: workDate,
        shift_template_id: null,
        is_week_off: true,
      });
      expectedIds.add(sid);
    }
    for (const rosterRow of expected) {
      const staffId = String(rosterRow.staff_id);
      if (staffScope && !staffScope.includes(staffId)) continue;
      if (covered.has(`${staffId}|${workDate}`)) continue;
      const leaveRow = leaveByKey.get(`${staffId}|${workDate}`);
      const crossRosterRow = crossRosterByStaffDay.get(`${staffId}|${workDate}`);
      const hasLeave = Boolean(leaveRow?.leave_type);
      const fromUpload = dayRoster.find((r) => String(r.staff_id) === staffId);
      const realRoster: RosterDayRow | null = fromUpload
        ? fromUpload
        : crossRosterRow
          ? {
              staff_id: staffId,
              work_date: workDate,
              shift_template_id: (crossRosterRow.shift_template_id as string | null) ?? null,
              shift_start: (crossRosterRow as { shift_start?: string | null }).shift_start ?? null,
              shift_end: (crossRosterRow as { shift_end?: string | null }).shift_end ?? null,
              is_week_off: Boolean(crossRosterRow.is_week_off),
            }
          : null;
      const isWeekOff = weekOffForDay(staffId, workDate, realRoster, hasLeave);
      if (crossSiteStaffIdSet.has(staffId)) {
        const cross = crossPunchesByStaffDay.get(`${staffId}|${workDate}`) ?? [];
        if (flexibleDayHasQualifyingPunches(cross)) {
          if (
            crossSiteAnchorNeedsSummaryWrite({
              locationId,
              punchesAcrossSites: cross,
              alreadyWroteSummary: covered.has(`${staffId}|${workDate}`),
            })
          ) {
            writeMergedSummaryFromCross(staffId, workDate, cross);
          }
          covered.add(`${staffId}|${workDate}`);
          continue;
        }
        const homeId = homeLocationByStaffId.get(staffId) || "";
        const writeDecision = flexibleNoPunchWriteAtLocation({
          isHomeLocation: !homeId || homeId === locationId,
          isWeekOff,
          hasLeave,
        });
        if (writeDecision === "suppress") {
          queueSummaryDelete(locationId, staffId, workDate);
          continue;
        }
        queueFlexibleKeepOnly(staffId, workDate, locationId);
      }
      const fullRoster: RosterDayRow = {
        staff_id: staffId,
        work_date: workDate,
        shift_template_id: isWeekOff
          ? null
          : ((rosterRow.shift_template_id as string | null) ?? null),
        shift_start: isWeekOff
          ? null
          : ((rosterRow as { shift_start?: string | null }).shift_start ?? null),
        shift_end: isWeekOff
          ? null
          : ((rosterRow as { shift_end?: string | null }).shift_end ?? null),
        is_week_off: isWeekOff,
      };
      const rosterShift = shiftForRosterDay(fullRoster, shiftById);
      const timing = timingForStaff(staffId);
      const shift = applyAttendanceShiftPolicy(rosterShift ?? DEFAULT_SHIFT, shiftPolicyOpts(staffId, timing));
      const shiftForCalc: ShiftTemplateInput = rosterShift
        ? { ...shift, startTime: rosterShift.startTime, endTime: rosterShift.endTime, overnight: rosterShift.overnight }
        : { ...shift, startTime: "", endTime: "" };
      const calc = calculateDailyAttendance([], {
        workDate,
        scheduled: !isWeekOff,
        weekOff: isWeekOff,
        holidayName: holidayByDate.get(workDate) ?? null,
        leaveType: (leaveRow?.leave_type as "annual_leave" | "sick_leave" | "unpaid_leave" | null) ?? null,
        shift: shiftForCalc,
        rules,
      });
      summaryRows.push({
        location_id: locationId,
        staff_id: staffId,
        work_date: workDate,
        subject_key: subjectKey(staffId, "", ""),
        actual_in: calc.actualIn,
        actual_out: calc.actualOut,
        ...scheduledBounds(workDate, shiftForCalc),
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
        shift_template_id: fullRoster.shift_template_id ?? null,
      });
      covered.add(`${staffId}|${workDate}`);
      processed += 1;
    }
  }

  // Prefer staff unique key for mapped rows. Upserting only on subject_key races with
  // ingest/legacy writers that already have (location_id, staff_id, work_date) but a
  // blank or different subject_key — INSERT then hits attendance_daily_summary_location_id_staff_id_work_date_key.
  const mapped = summaryRows.filter((row) => row.staff_id);
  const unmapped = summaryRows.filter((row) => !row.staff_id);

  // Drop stale ABSENT / partial rows at non-anchor sites for flexible / multisite days.
  const deleteSeen = new Set<string>();
  const uniqueDeletes = summaryDeletes.filter((row) => {
    const k = `${row.location_id}|${row.staff_id}|${row.work_date}`;
    if (deleteSeen.has(k)) return false;
    deleteSeen.add(k);
    return true;
  });
  for (let i = 0; i < uniqueDeletes.length; i += 40) {
    const chunk = uniqueDeletes.slice(i, i + 40);
    await Promise.all(
      chunk.map(async (row) => {
        const { error: delError } = await supabase
          .from("attendance_daily_summary")
          .delete()
          .eq("location_id", row.location_id)
          .eq("staff_id", row.staff_id)
          .eq("work_date", row.work_date);
        if (delError) throw delError;
      }),
    );
  }

  const keepSeen = new Set<string>();
  const uniqueKeepOnly = flexibleKeepOnly.filter((row) => {
    const k = `${row.staff_id}|${row.work_date}|${row.keep_location_id}`;
    if (keepSeen.has(k)) return false;
    keepSeen.add(k);
    return true;
  });
  for (let i = 0; i < uniqueKeepOnly.length; i += 40) {
    const chunk = uniqueKeepOnly.slice(i, i + 40);
    await Promise.all(
      chunk.map(async (row) => {
        const { error: delError } = await supabase
          .from("attendance_daily_summary")
          .delete()
          .eq("staff_id", row.staff_id)
          .eq("work_date", row.work_date)
          .neq("location_id", row.keep_location_id);
        if (delError) throw delError;
      }),
    );
  }

  for (let i = 0; i < mapped.length; i += 200) {
    const chunk = mapped.slice(i, i + 200);
    const { error: upsertError } = await supabase
      .from("attendance_daily_summary")
      .upsert(chunk, { onConflict: "location_id,staff_id,work_date" });
    if (upsertError) throw upsertError;
  }
  for (let i = 0; i < unmapped.length; i += 200) {
    const chunk = unmapped.slice(i, i + 200);
    const { error: upsertError } = await supabase
      .from("attendance_daily_summary")
      .upsert(chunk, { onConflict: "location_id,subject_key,work_date" });
    if (upsertError) throw upsertError;
  }

  return { processed };
}

export const UPLOAD_LIMIT_BYTES = MAX_UPLOAD_BYTES;
