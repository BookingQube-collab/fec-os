import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  collapseCrossSiteDeviceLogDays,
  DEVICE_LOG_PUSH_SOURCE,
  DEVICE_LOG_USERS_PAGE_SIZE,
  deviceLogDisplayName,
  deviceLogPunchRange,
  indexDeviceLogBioNames,
  lookupDeviceLogBioName,
  parseDeviceLogUserOptionKey,
  rollupDeviceLogDays,
  type AttendanceDeviceLogRow,
} from "@/lib/attendance-hr/device-logs";
import { attendanceRecalcLocationsAfterRosterUpsert } from "@/lib/attendance-hr/flexible-cross-site";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import { loadActiveShiftTemplates, resolveOrCreateShiftTemplate } from "@/lib/attendance-hr/roster-amend";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import {
  canSelfUploadPunchRoster,
  canUploadPunchDerivedRoster,
  listIncompletePunchRosterDays,
  planRosterFromPunches,
  ROSTER_FROM_PUNCH_SOURCE,
  rosterFromPunchDates,
  type IncompletePunchRosterDay,
  type PunchDayForRoster,
  type RosterFromPunchPlan,
} from "@/lib/attendance-hr/roster-from-punches";
import { parseTimeCell } from "@/lib/attendance-hr/roster-upload";
import { resolveSelfStaffId } from "@/lib/attendance-hr/self-staff";
import { loadLinkedStaffIdentity, loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError, getUserRoles } from "@/lib/server/authorize";

/** Direct report of a Head of Operations title on the ops reporting chart. */
async function viewerReportsToHeadOfOperations(staffId: string): Promise<boolean> {
  const { data: ext, error: extErr } = await supabaseAdmin
    .from("staff_profile_ext")
    .select("reporting_manager_staff_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (extErr) throw new Error(extErr.message);
  const managerId = ext?.reporting_manager_staff_id ? String(ext.reporting_manager_staff_id) : "";
  if (!managerId) return false;
  const { data: manager, error: managerErr } = await supabaseAdmin
    .from("staff")
    .select("job_title")
    .eq("id", managerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (managerErr) throw new Error(managerErr.message);
  return isHeadOfOperationsTitle(manager?.job_title ? String(manager.job_title) : null);
}

async function assertCanUploadPunchDerivedRoster(userId: string): Promise<void> {
  const [identity, roles, linked] = await Promise.all([
    loadLinkedStaffIdentity(userId),
    getUserRoles(supabaseAdmin, userId),
    loadLinkedStaffRecord(userId),
  ]);
  const reportsToHeadOfOperations = linked?.id
    ? await viewerReportsToHeadOfOperations(linked.id)
    : false;
  if (
    !canUploadPunchDerivedRoster({
      ...identity,
      roles,
      reportsToHeadOfOperations,
    })
  ) {
    throw new ForbiddenError("Forbidden: missing capability to save a punch-derived roster.");
  }
}

export type RoamingStaffOption = {
  staffId: string;
  fullName: string;
  employeeCode: string | null;
};

export type SaveRosterFromPunchesResult = RosterFromPunchPlan & {
  inserted: number;
};

export type SelfIncompleteRosterDay = IncompletePunchRosterDay & {
  locationCode: string | null;
  locationName: string | null;
};

function parseHm(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return parseTimeCell(value) ?? (/^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null);
}

async function loadByIds<T extends { id: string }>(
  table: string,
  columns: string,
  ids: string[],
): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabaseAdmin.from(table).select(columns).in("id", chunk);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** Active staff marked roaming (admin-maintainable `staff.is_roaming`). */
export async function loadRoamingStaffOptions(): Promise<RoamingStaffOption[]> {
  const rows: Array<{
    id: string;
    full_name: string | null;
    employee_code: string | null;
  }> = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, employee_code")
      .eq("is_roaming", true)
      .is("deleted_at", null)
      .order("full_name")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows.map((row) => ({
    staffId: String(row.id),
    fullName: String(row.full_name ?? "Staff"),
    employeeCode: row.employee_code ? String(row.employee_code) : null,
  }));
}

async function assertRoamingStaffIds(staffIds: readonly string[]): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (!staffIds.length) return allowed;
  for (let i = 0; i < staffIds.length; i += 200) {
    const chunk = staffIds.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, is_roaming, deleted_at")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.deleted_at || !row.is_roaming) continue;
      allowed.add(String(row.id));
    }
  }
  return allowed;
}

type RawPunch = {
  id: string;
  location_id: string;
  device_id: string | null;
  staff_id: string | null;
  biometric_user_id: string | null;
  device_user_name: string | null;
  punch_at: string;
  in_out_status: number | null;
};

async function biometricPairsForStaff(staffIds: readonly string[]): Promise<
  Array<{ locationId: string; biometricUserId: string }>
> {
  if (!staffIds.length) return [];
  const pairs: Array<{ locationId: string; biometricUserId: string }> = [];
  for (let i = 0; i < staffIds.length; i += 100) {
    const chunk = staffIds.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("attendance_biometric_users")
      .select("location_id, biometric_user_id")
      .in("staff_id", chunk)
      .limit(5000);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const locationId = String(row.location_id ?? "");
      const biometricUserId = String(row.biometric_user_id ?? "").trim();
      if (locationId && biometricUserId) pairs.push({ locationId, biometricUserId });
    }
  }
  return pairs;
}

async function fetchRawDevicePunches(input: {
  dateFrom: string;
  dateTo: string;
  locationId?: string | null;
  deviceId?: string | null;
  deviceUserKeys?: string[];
  staffIds?: string[];
}): Promise<RawPunch[]> {
  const range = deviceLogPunchRange(input.dateFrom, input.dateTo);
  const punches: RawPunch[] = [];
  const fromKeys = (input.deviceUserKeys ?? [])
    .map(parseDeviceLogUserOptionKey)
    .filter((pair): pair is { locationId: string; biometricUserId: string } => Boolean(pair));
  const fromStaff = input.staffIds?.length ? await biometricPairsForStaff(input.staffIds) : [];
  const userPairs = fromKeys.length ? fromKeys : fromStaff;

  for (let from = 0; ; from += DEVICE_LOG_USERS_PAGE_SIZE) {
    let q = supabaseAdmin
      .from("attendance_logs")
      .select(
        "id, location_id, device_id, staff_id, biometric_user_id, device_user_name, punch_at, in_out_status",
      )
      .eq("source", DEVICE_LOG_PUSH_SOURCE)
      .gte("punch_at", range.fromIso)
      .lte("punch_at", range.toIso)
      .order("punch_at", { ascending: false })
      .range(from, from + DEVICE_LOG_USERS_PAGE_SIZE - 1);
    if (input.locationId) q = q.eq("location_id", input.locationId);
    if (input.deviceId) q = q.eq("device_id", input.deviceId);

    // Prefer explicit device-user keys; otherwise staff_id OR biometric pairs for those staff.
    if (fromKeys.length) {
      const parts = fromKeys.map(
        (pair) => `and(location_id.eq.${pair.locationId},biometric_user_id.eq.${pair.biometricUserId})`,
      );
      q = q.or(parts.join(","));
    } else if (input.staffIds?.length) {
      const parts = [`staff_id.in.(${input.staffIds.join(",")})`];
      for (const pair of userPairs.slice(0, 80)) {
        parts.push(
          `and(location_id.eq.${pair.locationId},biometric_user_id.eq.${pair.biometricUserId})`,
        );
      }
      q = q.or(parts.join(","));
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as RawPunch[];
    punches.push(...page);
    if (page.length < DEVICE_LOG_USERS_PAGE_SIZE) break;
  }
  return punches;
}

async function enrichDeviceLogDays(punches: RawPunch[]): Promise<PunchDayForRoster[]> {
  if (!punches.length) return [];
  const deviceIds = [...new Set(punches.map((row) => row.device_id).filter((id): id is string => Boolean(id)))];
  const locationIds = [...new Set(punches.map((row) => row.location_id))];
  const [devices, locations, bioRes] = await Promise.all([
    loadByIds<{ id: string; device_name: string | null; serial_number: string | null; device_code: string | null }>(
      "attendance_devices",
      "id, device_name, serial_number, device_code",
      deviceIds,
    ),
    loadByIds<{ id: string; code: string | null; name: string | null }>("locations", "id, code, name", locationIds),
    locationIds.length
      ? supabaseAdmin
          .from("attendance_biometric_users")
          .select("location_id, device_id, biometric_user_id, device_name, full_name, staff_id")
          .in("location_id", locationIds)
          .limit(5000)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);
  if (bioRes.error) throw new Error(bioRes.error.message);

  const bioIndex = indexDeviceLogBioNames(
    (bioRes.data ?? []).map((raw) => ({
      location_id: String(raw.location_id ?? ""),
      device_id: raw.device_id == null ? null : String(raw.device_id),
      biometric_user_id: String(raw.biometric_user_id ?? ""),
      device_name: raw.device_name == null ? null : String(raw.device_name),
      full_name: raw.full_name == null ? null : String(raw.full_name),
    })),
  );
  const staffByLocUser = new Map<string, string>();
  for (const raw of bioRes.data ?? []) {
    const loc = String(raw.location_id ?? "");
    const uid = String(raw.biometric_user_id ?? "").trim();
    const staffId = raw.staff_id == null ? "" : String(raw.staff_id);
    if (loc && uid && staffId) staffByLocUser.set(`${loc}|${uid}`, staffId);
  }
  const staffIdsForName = [
    ...new Set(
      [
        ...punches.map((row) => row.staff_id?.trim()).filter((id): id is string => Boolean(id)),
        ...staffByLocUser.values(),
      ],
    ),
  ];
  const staffNameRows = await loadByIds<{ id: string; full_name: string | null }>(
    "staff",
    "id, full_name",
    staffIdsForName,
  );
  const staffNameById = new Map(staffNameRows.map((row) => [row.id, row.full_name]));
  const deviceById = new Map(devices.map((row) => [row.id, row]));
  const locationById = new Map(locations.map((row) => [row.id, row]));

  const listed: AttendanceDeviceLogRow[] = punches.map((row) => {
    const device = row.device_id ? deviceById.get(row.device_id) : undefined;
    const location = locationById.get(row.location_id);
    const bio = lookupDeviceLogBioName(bioIndex, row.location_id, row.biometric_user_id, row.device_id);
    const bioStaff =
      row.biometric_user_id?.trim()
        ? staffByLocUser.get(`${row.location_id}|${row.biometric_user_id.trim()}`)
        : undefined;
    const staffId = row.staff_id?.trim() || bioStaff || null;
    return {
      id: row.id,
      locationId: row.location_id,
      locationCode: location?.code ?? null,
      locationName: location?.name ?? null,
      deviceId: row.device_id,
      deviceName: device?.device_name ?? null,
      deviceSerial: device?.serial_number ?? null,
      deviceCode: device?.device_code ?? null,
      biometricUserId: row.biometric_user_id,
      deviceUserName: deviceLogDisplayName(
        row.device_user_name,
        bio,
        staffId ? staffNameById.get(staffId) : null,
        row.biometric_user_id,
      ),
      staffId,
      punchAt: row.punch_at,
      inOutStatus: row.in_out_status,
      verifyMethod: null,
      workCode: null,
      source: DEVICE_LOG_PUSH_SOURCE,
    };
  });

  return collapseCrossSiteDeviceLogDays(rollupDeviceLogDays(listed)).map((day) => ({
    staffId: day.staffId ?? null,
    workDate: day.dateYmd,
    locationId: day.locationId,
    punchInAt: day.punchInAt,
    punchOutAt: day.punchOutAt,
  }));
}

async function loadExistingRosterDays(
  staffIds: readonly string[],
  dateFrom: string,
  dateTo: string,
): Promise<Array<{ staffId: string; workDate: string }>> {
  if (!staffIds.length) return [];
  const out: Array<{ staffId: string; workDate: string }> = [];
  for (let i = 0; i < staffIds.length; i += 100) {
    const chunk = staffIds.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("attendance_roster_assignments")
      .select("staff_id, work_date")
      .in("staff_id", chunk)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      out.push({
        staffId: String(row.staff_id),
        workDate: String(row.work_date).slice(0, 10),
      });
    }
  }
  return out;
}

async function planForRoamingStaff(
  context: AuthContext,
  input: {
    dateFrom: string;
    dateTo: string;
    staffIds?: string[];
    locationId?: string | null;
    deviceId?: string | null;
    deviceUserKeys?: string[];
  },
): Promise<{ plan: RosterFromPunchPlan; roamingIds: Set<string> }> {
  await assertCanUploadPunchDerivedRoster(context.userId);
  rosterFromPunchDates(input.dateFrom, input.dateTo);

  let roamingIds: Set<string>;
  if (input.staffIds?.length) {
    roamingIds = await assertRoamingStaffIds(input.staffIds);
    const missing = input.staffIds.filter((id) => !roamingIds.has(id));
    if (missing.length) {
      throw new ForbiddenError("Choose roaming staff only (People → staff profile → Roaming).");
    }
  } else {
    roamingIds = new Set((await loadRoamingStaffOptions()).map((row) => row.staffId));
  }
  if (!roamingIds.size) {
    return {
      plan: {
        rows: [],
        savedEligible: 0,
        skippedIncomplete: 0,
        skippedExisting: 0,
        skippedUnmapped: 0,
        skippedInvalid: 0,
      },
      roamingIds,
    };
  }

  const punches = await fetchRawDevicePunches({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    locationId: input.locationId,
    deviceId: input.deviceId,
    deviceUserKeys: input.deviceUserKeys,
    // Always scope to roaming staff (or their biometric pairs) unless device users are explicit.
    staffIds: input.deviceUserKeys?.length ? undefined : [...roamingIds],
  });
  const days = (await enrichDeviceLogDays(punches)).filter(
    (day) => day.staffId && roamingIds.has(day.staffId),
  );
  const staffWithDays = [...new Set(days.map((day) => day.staffId!).filter(Boolean))];
  const existing = await loadExistingRosterDays(staffWithDays, input.dateFrom, input.dateTo);
  return { plan: planRosterFromPunches({ days, existing }), roamingIds };
}

export async function listRoamingStaffForRosterFromPunches(
  context: AuthContext,
): Promise<RoamingStaffOption[]> {
  await assertCanUploadPunchDerivedRoster(context.userId);
  return loadRoamingStaffOptions();
}

export async function previewRosterFromPunches(
  context: AuthContext,
  input: {
    dateFrom: string;
    dateTo: string;
    staffIds?: string[];
    locationId?: string | null;
    deviceId?: string | null;
    deviceUserKeys?: string[];
  },
): Promise<RosterFromPunchPlan> {
  const { plan } = await planForRoamingStaff(context, input);
  return plan;
}

export async function saveRosterFromPunches(
  context: AuthContext,
  input: {
    dateFrom: string;
    dateTo: string;
    staffIds?: string[];
    locationId?: string | null;
    deviceId?: string | null;
    deviceUserKeys?: string[];
  },
): Promise<SaveRosterFromPunchesResult> {
  const { plan } = await planForRoamingStaff(context, input);
  if (!plan.rows.length) {
    return { ...plan, inserted: 0 };
  }

  let shifts = await loadActiveShiftTemplates(supabaseAdmin);
  const payload: Array<{
    location_id: string;
    staff_id: string;
    work_date: string;
    shift_template_id: string | null;
    shift_start: string;
    shift_end: string;
    is_week_off: boolean;
    source: string;
    created_by: string;
  }> = [];

  for (const row of plan.rows) {
    const resolved = await resolveOrCreateShiftTemplate(supabaseAdmin, {
      locationId: row.locationId,
      shiftStart: row.shiftStart,
      shiftEnd: row.shiftEnd,
      shifts,
    });
    shifts = resolved.shifts;
    payload.push({
      location_id: row.locationId,
      staff_id: row.staffId,
      work_date: row.workDate,
      shift_template_id: resolved.shiftTemplateId,
      shift_start: row.shiftStart,
      shift_end: row.shiftEnd,
      is_week_off: false,
      source: ROSTER_FROM_PUNCH_SOURCE,
      created_by: context.userId,
    });
  }

  // Create-only: plan already skipped existing days; unique races are ignored.
  let inserted = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("attendance_roster_assignments")
      .insert(chunk)
      .select("id");
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        // Concurrent create — insert one-by-one so the rest still land.
        for (const row of chunk) {
          const single = await supabaseAdmin
            .from("attendance_roster_assignments")
            .insert(row)
            .select("id")
            .maybeSingle();
          if (single.error) {
            if (/duplicate|unique/i.test(single.error.message)) continue;
            throw new Error(single.error.message);
          }
          if (single.data) inserted += 1;
        }
        continue;
      }
      throw new Error(error.message);
    }
    inserted += data?.length ?? 0;
  }

  const staffIds = [...new Set(plan.rows.map((row) => row.staffId))];
  const homeByStaff = new Map<string, string | null>();
  const workByStaff = new Map<string, string[]>();
  if (staffIds.length) {
    const { data: homeRows, error: homeErr } = await supabaseAdmin
      .from("staff")
      .select("id, location_id")
      .in("id", staffIds);
    if (homeErr) throw new Error(homeErr.message);
    for (const row of homeRows ?? []) {
      homeByStaff.set(String(row.id), row.location_id ? String(row.location_id) : null);
    }
    const { data: workRows, error: workErr } = await supabaseAdmin
      .from("staff_work_locations")
      .select("staff_id, location_id")
      .in("staff_id", staffIds);
    if (workErr && !/staff_work_locations|schema cache/i.test(workErr.message)) {
      throw new Error(workErr.message);
    }
    for (const row of workRows ?? []) {
      const staffId = String(row.staff_id);
      const list = workByStaff.get(staffId) ?? [];
      if (row.location_id) list.push(String(row.location_id));
      workByStaff.set(staffId, list);
    }
  }

  const byLocation = new Map<string, { from: string; to: string; staffIds: Set<string> }>();
  for (const row of plan.rows) {
    const locs = attendanceRecalcLocationsAfterRosterUpsert({
      uploadLocationId: row.locationId,
      staffHomeLocationIds: [homeByStaff.get(row.staffId)],
      staffWorkLocationIds: workByStaff.get(row.staffId) ?? [],
    });
    for (const locationId of locs) {
      const current = byLocation.get(locationId);
      if (!current) {
        byLocation.set(locationId, {
          from: row.workDate,
          to: row.workDate,
          staffIds: new Set([row.staffId]),
        });
      } else {
        if (row.workDate < current.from) current.from = row.workDate;
        if (row.workDate > current.to) current.to = row.workDate;
        current.staffIds.add(row.staffId);
      }
    }
  }

  for (const [locationId, range] of byLocation) {
    await recalculateAttendanceRange(
      supabaseAdmin as unknown as Parameters<typeof recalculateAttendanceRange>[0],
      locationId,
      range.from,
      range.to,
      { staffIds: [...range.staffIds] },
    );
  }

  const { error: auditError } = await supabaseAdmin.from("attendance_audit_events").insert({
    actor_id: context.userId,
    action: "attendance.roster_from_punches",
    entity_type: "attendance_roster_assignments",
    entity_id: null,
    location_id: plan.rows[0]?.locationId ?? null,
    after: {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      inserted,
      savedEligible: plan.savedEligible,
      skippedIncomplete: plan.skippedIncomplete,
      skippedExisting: plan.skippedExisting,
      source: ROSTER_FROM_PUNCH_SOURCE,
    },
  });
  if (auditError) console.warn("[roster-from-punches] audit failed", auditError.message);

  return { ...plan, inserted };
}

async function myLinkedStaff(context: AuthContext): Promise<{
  id: string;
  full_name: string | null;
  location_id: string | null;
} | null> {
  const { data, error } = await context.supabase
    .from("staff")
    .select("id, full_name, location_id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  return {
    id: String(data.id),
    full_name: data.full_name ? String(data.full_name) : null,
    location_id: data.location_id ? String(data.location_id) : null,
  };
}

export async function listMyIncompletePunchRosterDays(
  context: AuthContext,
  input: { dateFrom: string; dateTo: string },
): Promise<SelfIncompleteRosterDay[]> {
  rosterFromPunchDates(input.dateFrom, input.dateTo);
  const staff = await myLinkedStaff(context);
  if (!staff?.id || !canSelfUploadPunchRoster({ fullName: staff.full_name })) return [];
  const staffId = resolveSelfStaffId({ linkedStaffId: staff.id });

  const punches = await fetchRawDevicePunches({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    staffIds: [staffId],
  });
  const days = (await enrichDeviceLogDays(punches)).filter((day) => day.staffId === staffId);
  const existing = await loadExistingRosterDays([staffId], input.dateFrom, input.dateTo);
  const incomplete = listIncompletePunchRosterDays({ days, existing });
  const locationIds = [...new Set(incomplete.map((row) => row.locationId))];
  const locations = await loadByIds<{ id: string; code: string | null; name: string | null }>(
    "locations",
    "id, code, name",
    locationIds,
  );
  const locById = new Map(locations.map((row) => [row.id, row]));
  return incomplete.map((row) => {
    const loc = locById.get(row.locationId);
    return {
      ...row,
      locationCode: loc?.code ?? null,
      locationName: loc?.name ?? null,
    };
  });
}

export async function saveMyIncompletePunchRosterDay(
  context: AuthContext,
  input: {
    workDate: string;
    locationId: string;
    shiftStart: string;
    shiftEnd: string;
  },
): Promise<{ id: string }> {
  const staff = await myLinkedStaff(context);
  if (!staff?.id || !canSelfUploadPunchRoster({ fullName: staff.full_name })) {
    throw new ForbiddenError("Only Russell and Louie can enter a roster day for an incomplete punch.");
  }
  const staffId = resolveSelfStaffId({ linkedStaffId: staff.id });
  const workDate = input.workDate.slice(0, 10);
  const locationId = input.locationId.trim();
  const shiftStart = parseHm(input.shiftStart);
  const shiftEnd = parseHm(input.shiftEnd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new Error("Choose a work date.");
  if (!locationId) throw new Error("Choose a location.");
  if (!shiftStart || !shiftEnd) throw new Error("Enter both shift start and end times.");

  const punches = await fetchRawDevicePunches({
    dateFrom: workDate,
    dateTo: workDate,
    staffIds: [staffId],
  });
  const days = (await enrichDeviceLogDays(punches)).filter((day) => day.staffId === staffId);
  const existing = await loadExistingRosterDays([staffId], workDate, workDate);
  if (existing.some((row) => row.workDate === workDate)) {
    throw new Error("You already have a roster row on that day.");
  }
  const incomplete = listIncompletePunchRosterDays({ days, existing });
  const match = incomplete.find((row) => row.workDate === workDate);
  if (!match) {
    throw new Error("That day needs a punch-in without a punch-out before you can enter it.");
  }

  let shifts = await loadActiveShiftTemplates(supabaseAdmin);
  const resolved = await resolveOrCreateShiftTemplate(supabaseAdmin, {
    locationId,
    shiftStart,
    shiftEnd,
    shifts,
  });

  const { data: inserted, error } = await supabaseAdmin
    .from("attendance_roster_assignments")
    .insert({
      location_id: locationId,
      staff_id: staffId,
      work_date: workDate,
      shift_template_id: resolved.shiftTemplateId,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      is_week_off: false,
      source: "self",
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    if (/duplicate|unique/i.test(error?.message ?? "")) {
      throw new Error("You already have a roster row on that day.");
    }
    throw new Error(error?.message ?? "Could not save the roster day.");
  }

  const homeId = staff.location_id;
  const { data: workRows } = await supabaseAdmin
    .from("staff_work_locations")
    .select("location_id")
    .eq("staff_id", staffId);
  const locs = attendanceRecalcLocationsAfterRosterUpsert({
    uploadLocationId: locationId,
    staffHomeLocationIds: [homeId],
    staffWorkLocationIds: (workRows ?? []).map((row) =>
      row.location_id ? String(row.location_id) : null,
    ),
  });
  for (const loc of locs) {
    await recalculateAttendanceRange(
      supabaseAdmin as unknown as Parameters<typeof recalculateAttendanceRange>[0],
      loc,
      workDate,
      workDate,
      { staffIds: [staffId] },
    );
  }

  return { id: String(inserted.id) };
}
