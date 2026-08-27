"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ATTENDANCE_FILE_BUCKET, DEFAULT_RULES, DEFAULT_SHIFT, isAdmsDeviceOnline } from "@/lib/attendance-hr/constants";
import { queueAdmsAttlogQuery } from "@/lib/attendance-hr/adms-ingest";
import {
  aggregateDashboardPeriod,
  buildAbsentRowsForPeriod,
  countRosterEmployees,
  dayRowsFromPunchesInRange,
  enumerateYmd,
  expectedStaffIds,
  mergeAttendanceSites,
  pickDashboardPeriod,
  qatarTodayYmd,
  summaryToDayRow,
  enrichWatchlistEntries,
  frequentExceptionLeaders,
  type AttendanceDashboardPunch,
} from "@/lib/attendance-hr/dashboard";
import { expectedOnDutyStaffIds, expectedRowsForDay, isWorkDateCovered } from "@/lib/attendance-hr/roster-expected";
import { ATTENDANCE_TALLY_UPLOAD_NOTE } from "@/lib/attendance-hr/roster-upload";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import {
  attendanceHrStaffMatches,
  isAttendanceHrUnmappedSearch,
  type AttendanceHrReportRow,
} from "@/lib/attendance-hr/report";
import { CANONICAL_LOCATION_CODES } from "@/lib/locations/normalize";
import {
  fetchHomeStaffIdsAtLocation,
  fetchStaffIdsWorkingAtLocation,
  fetchWorkLocationsByStaffId,
  punchOrHomeStaffOrFilter,
} from "@/lib/staff-work-locations";
import {
  buildAvailabilityTrends,
  emptyAvailabilityTrends,
  previousPeriod,
  upcomingPeriod,
} from "@/lib/attendance-hr/availability";
import { dispatchHrNotify } from "@/lib/attendance-hr/hr-notify-dispatch";

async function audit(
  context: AuthContext,
  action: string,
  entityType: string,
  entityId: string | null,
  locationId: string | null,
  after?: Record<string, unknown>,
) {
  await context.supabase.from("attendance_audit_events").insert({
    actor_id: context.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    location_id: locationId,
    after: after ?? {},
  });
}

async function assertSite(context: AuthContext, locationId: string) {
  if (canUserDo(context.roles ?? [], "attendance.view_all")) return;
  await assertLocationAccess(context, locationId);
}

export const getAttendanceHrBootstrap = createAuthenticatedActionNoInput(
  async (context) => {
    const [{ data: companies }, { data: sites }, { data: rosterLocations }, { data: devices }, { data: shifts }, { data: rules }, { data: staff }] =
      await Promise.all([
        context.supabase.from("hr_companies").select("id, code, name, active").eq("active", true).order("name"),
        context.supabase
          .from("attendance_site_settings")
          .select("location_id, company_id, attendance_enabled, timezone, locations(id, code, name, region, status)"),
        context.supabase
          .from("locations")
          .select("id, code, name, region, status")
          .in("code", [...CANONICAL_LOCATION_CODES]),
        (async () => {
          const full =
            "id, location_id, company_id, device_code, device_name, vendor, active, last_sync_at, last_user_sync_at, last_adms_at, last_adms_error, timezone, serial_number, connection_mode, adms_pending_cmd, adms_cmd_queued_at, adms_attlog_stamp";
          const lite =
            "id, location_id, company_id, device_code, device_name, vendor, active, last_sync_at, last_user_sync_at, last_adms_at, timezone, serial_number, connection_mode";
          const first = await context.supabase
            .from("attendance_devices")
            .select(full)
            .eq("active", true)
            .order("device_name");
          if (first.error && /adms_pending_cmd|adms_cmd_queued_at|last_adms_error|adms_attlog_stamp/i.test(first.error.message)) {
            return context.supabase.from("attendance_devices").select(lite).eq("active", true).order("device_name");
          }
          return first;
        })(),
        context.supabase
          .from("attendance_shift_templates")
          .select("id, company_id, location_id, name, start_time, end_time, overnight, grace_minutes, break_minutes, overtime_after_minutes, day_cutoff_time, active")
          .eq("active", true)
          .order("name"),
        context.supabase
          .from("attendance_rule_sets")
          .select("id, scope, company_id, location_id, duplicate_window_seconds, auto_map_employee_code, absent_requires_roster, file_retention_days")
          .order("scope"),
        context.supabase
          .from("staff")
          .select("id, full_name, employee_code, qid, department, job_title, location_id, status, is_roaming")
          .eq("status", "active")
          .order("full_name")
          .limit(2000),
      ]);
    const staffRows = staff ?? [];
    const workByStaff = await fetchWorkLocationsByStaffId(
      context.supabase,
      staffRows.map((row) => row.id),
    );
    const settingsByLocation = new Map((sites ?? []).map((s) => [s.location_id, s]));
    const roster = (rosterLocations ?? []).map((loc) => ({
      id: loc.id,
      code: loc.code,
      name: loc.name,
      region: loc.region,
      status: loc.status,
    }));
    const mergedSites = mergeAttendanceSites(
      roster,
      (sites ?? []).map((s) => ({ location_id: s.location_id })),
    );
    return {
      companies: companies ?? [],
      sites: mergedSites.map((loc) => {
        const setting = settingsByLocation.get(loc.id);
        const nested = setting ? (Array.isArray(setting.locations) ? setting.locations[0] : setting.locations) : null;
        return {
          location_id: loc.id,
          company_id: setting?.company_id ?? null,
          attendance_enabled: setting?.attendance_enabled ?? true,
          timezone: setting?.timezone ?? DEFAULT_RULES.timezone,
          location: nested ?? loc,
        };
      }),
      devices: devices ?? [],
      shifts: shifts ?? [],
      rules: rules ?? [],
      staff: staffRows.map((row) => ({
        ...row,
        work_location_ids: (workByStaff.get(row.id) ?? []).map((loc) => loc.id),
      })),
      defaults: { rules: DEFAULT_RULES, shift: DEFAULT_SHIFT },
    };
  },
  { auth: { capability: "attendance.view" } },
);

export const getAttendanceHrDashboard = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    const today = qatarTodayYmd();

    const [locRes, settingsRes, staffRes, latestPunchRes] = await Promise.all([
      context.supabase
        .from("locations")
        .select("id, code, name, region, status")
        .in("code", [...CANONICAL_LOCATION_CODES]),
      context.supabase.from("attendance_site_settings").select("location_id"),
      context.supabase.from("staff").select("id, location_id, status").is("deleted_at", null).limit(5000),
      context.supabase
        .from("attendance_logs")
        .select("attendance_date, punch_at")
        .order("punch_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (locRes.error) throw locRes.error;
    if (staffRes.error) throw staffRes.error;

    const latestPunchDate = latestPunchRes.data?.attendance_date
      ? String(latestPunchRes.data.attendance_date).slice(0, 10)
      : latestPunchRes.data?.punch_at
        ? qatarTodayYmd(new Date(latestPunchRes.data.punch_at))
        : null;
    const period = pickDashboardPeriod({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      month: data.month,
      date: data.date,
      today,
      latestPunchDate,
    });
    const { dateFrom, dateTo, month, usedImportedPeriod } = period;
    const dates = enumerateYmd(dateFrom, dateTo);

    const sites = mergeAttendanceSites(locRes.data ?? [], settingsRes.data ?? []);
    let workStaffIds: string[] = [];
    const workByLocation = new Map<string, string[]>();
    try {
      const { data: links } = await context.supabase.from("staff_work_locations").select("staff_id, location_id");
      for (const row of links ?? []) {
        const list = workByLocation.get(row.location_id) ?? [];
        list.push(row.staff_id);
        workByLocation.set(row.location_id, list);
      }
      if (data.locationId) workStaffIds = workByLocation.get(data.locationId) ?? [];
    } catch {
      if (data.locationId) {
        try {
          workStaffIds = await fetchStaffIdsWorkingAtLocation(context.supabase, data.locationId);
        } catch {
          workStaffIds = [];
        }
      }
    }
    const employees = countRosterEmployees(staffRes.data ?? [], {
      locationId: data.locationId ?? null,
      workStaffIds,
    });

    let pendingQ = context.supabase.from("attendance_corrections").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (data.locationId) pendingQ = pendingQ.eq("location_id", data.locationId);

    const punchFrom = `${addDaysYmd(dateFrom, -1)}T00:00:00.000Z`;
    const punchTo = `${addDaysYmd(dateTo, 2)}T00:00:00.000Z`;

    const [summaryRes, punchRes, unmatchedRes, pendingRes, rosterRes, uploadRes] = await Promise.all([
      context.supabase
        .from("attendance_daily_summary")
        .select("location_id, staff_id, biometric_user_id, work_date, actual_in, actual_out, status, late_minutes, missed_punch, punch_count")
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .limit(20000),
      context.supabase
        .from("attendance_logs")
        .select("location_id, staff_id, biometric_user_id, device_id, punch_at, probable_duplicate, excluded_from_calc, attendance_date")
        .gte("punch_at", punchFrom)
        .lt("punch_at", punchTo)
        .limit(20000),
      context.supabase.from("attendance_biometric_users").select("id", { count: "exact", head: true }).is("staff_id", null),
      pendingQ,
      context.supabase
        .from("attendance_roster_assignments")
        .select("location_id, staff_id, work_date, shift_template_id, is_week_off")
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .limit(20000),
      context.supabase
        .from("daily_ops_roster_uploads")
        .select("location_id, period_start, period_end, notes")
        .eq("notes", ATTENDANCE_TALLY_UPLOAD_NOTE)
        .limit(500),
    ]);
    if (punchRes.error) throw punchRes.error;

    const fromSummaries = (summaryRes.data ?? []).map((row) =>
      summaryToDayRow(row as Parameters<typeof summaryToDayRow>[0]),
    );
    const fromPunches = dayRowsFromPunchesInRange((punchRes.data ?? []) as AttendanceDashboardPunch[], dateFrom, dateTo);
    let dayRows = fromSummaries.length > 0 ? fromSummaries : fromPunches;
    if (fromSummaries.length === 0) {
      const staff = staffRes.data ?? [];
      const coverageByLoc = new Map<string, Array<{ start: string; end: string }>>();
      for (const row of uploadRes.data ?? []) {
        if (!row.period_start || !row.period_end) continue;
        const list = coverageByLoc.get(row.location_id) ?? [];
        list.push({ start: String(row.period_start).slice(0, 10), end: String(row.period_end).slice(0, 10) });
        coverageByLoc.set(row.location_id, list);
      }
      const extra = sites.flatMap((site) => {
        const fallback = expectedStaffIds(staff, {
          locationId: site.id,
          workStaffIds: workByLocation.get(site.id) ?? (site.id === data.locationId ? workStaffIds : []),
        });
        const expectedByDate = new Map<string, string[]>();
        for (const day of dates) {
          const dayRoster = (rosterRes.data ?? [])
            .filter((row) => row.location_id === site.id && String(row.work_date).slice(0, 10) === day)
            .map((row) => ({
              staff_id: String(row.staff_id),
              work_date: day,
              shift_template_id: (row.shift_template_id as string | null) ?? null,
              is_week_off: Boolean(row.is_week_off),
            }));
          const expected = expectedRowsForDay({
            workDate: day,
            dayRoster,
            fallbackStaffIds: fallback,
            coveredByUpload: isWorkDateCovered(day, coverageByLoc.get(site.id) ?? []),
          });
          expectedByDate.set(day, expectedOnDutyStaffIds(expected));
        }
        return buildAbsentRowsForPeriod({
          locationId: site.id,
          dates,
          expectedStaffIds: expectedByDate,
          existing: dayRows,
        });
      });
      dayRows = [...dayRows, ...extra];
    }

    const agg = aggregateDashboardPeriod(dayRows, sites, data.locationId ?? null);
    const frequentLate = frequentExceptionLeaders(dayRows, "late");
    const frequentMissed = frequentExceptionLeaders(dayRows, "missed");
    const watchIds = [...frequentLate, ...frequentMissed].map((row) => row.id);
    const namedStaff: Array<{ id: string; full_name?: string | null; location_id?: string | null }> = [];
    if (watchIds.length) {
      const { data: named } = await context.supabase
        .from("staff")
        .select("id, full_name, location_id")
        .in("id", watchIds);
      namedStaff.push(...(named ?? []));
    }
    const labelWatch = (leaders: typeof frequentLate) => enrichWatchlistEntries(leaders, namedStaff, sites);

    let trends = emptyAvailabilityTrends();
    try {
      const hist = previousPeriod(dateFrom, dateTo);
      const next = upcomingPeriod(dateTo, 7);
      const locFilter = data.locationId ?? null;
      const histQ = context.supabase
        .from("attendance_daily_summary")
        .select("status, late_minutes, missed_punch")
        .gte("work_date", hist.dateFrom)
        .lte("work_date", hist.dateTo)
        .limit(20000);
      const upcomingQ = context.supabase
        .from("attendance_roster_assignments")
        .select("is_week_off")
        .gte("work_date", next.dateFrom)
        .lte("work_date", next.dateTo)
        .limit(20000);
      const histVisitQ = context.supabase
        .from("staff_location_events")
        .select("id", { count: "exact", head: true })
        .gte("recorded_at", `${hist.dateFrom}T00:00:00.000Z`)
        .lte("recorded_at", `${hist.dateTo}T23:59:59.999Z`);
      const curVisitQ = context.supabase
        .from("staff_location_events")
        .select("id", { count: "exact", head: true })
        .gte("recorded_at", `${dateFrom}T00:00:00.000Z`)
        .lte("recorded_at", `${dateTo}T23:59:59.999Z`);
      const [histRes, upcomingRes, histVisits, curVisits] = await Promise.all([
        locFilter ? histQ.eq("location_id", locFilter) : histQ,
        locFilter ? upcomingQ.eq("location_id", locFilter) : upcomingQ,
        locFilter ? histVisitQ.eq("location_id", locFilter) : histVisitQ,
        locFilter ? curVisitQ.eq("location_id", locFilter) : curVisitQ,
      ]);
      trends = buildAvailabilityTrends({
        historyRows: histRes.data ?? [],
        currentRows: dayRows,
        historyVisits: histVisits.error ? 0 : histVisits.count ?? 0,
        currentVisits: curVisits.error ? 0 : curVisits.count ?? 0,
        upcomingRows: upcomingRes.data ?? [],
      });
    } catch {
      trends = emptyAvailabilityTrends();
    }

    return {
      workDate: dateTo,
      dateFrom,
      dateTo,
      month,
      today,
      usedImportedPeriod,
      usedLatestPunch: usedImportedPeriod && !data.dateFrom && !data.month && !data.date,
      trends,
      kpis: {
        employees,
        present: agg.present,
        absent: agg.absent,
        late: agg.late,
        missedPunches: agg.missedPunches,
        unmatched: unmatchedRes.count ?? 0,
        pendingCorrections: pendingRes.count ?? 0,
      },
      sites: agg.bySite,
      bySite: agg.bySite.map((site) => ({
        locationId: site.locationId,
        present: site.in,
        absent: site.out,
        late: site.late,
        in: site.in,
        out: site.out,
      })),
      frequentLate: labelWatch(frequentLate),
      frequentMissed: labelWatch(frequentMissed),
      rows: dayRows.slice(0, 200),
    };
  },
  { auth: { capability: "attendance.view" } },
);

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const getAttendanceHrSite = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid(), date: z.string().optional() }),
  async (data, context) => {
    await assertSite(context, data.locationId);
    const date = data.date ?? new Date().toISOString().slice(0, 10);
    const [{ data: setting }, { data: devices }, { data: staff }, { data: daily }, { data: unmatched }, { data: imports }] =
      await Promise.all([
        context.supabase.from("attendance_site_settings").select("*").eq("location_id", data.locationId).maybeSingle(),
        context.supabase.from("attendance_devices").select("*").eq("location_id", data.locationId).order("device_name"),
        context.supabase
          .from("staff")
          .select("id, full_name, employee_code, department, job_title, status, location_id, is_roaming")
          .eq("status", "active"),
        context.supabase.from("attendance_daily_summary").select("*").eq("location_id", data.locationId).eq("work_date", date),
        context.supabase.from("attendance_biometric_users").select("*").eq("location_id", data.locationId).is("staff_id", null),
        context.supabase
          .from("attendance_import_files")
          .select("id, original_filename, file_type, status, imported_count, duplicate_count, rejected_count, unmatched_count, created_at, device_id")
          .eq("location_id", data.locationId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
    const extraIds = new Set(await fetchStaffIdsWorkingAtLocation(context.supabase, data.locationId));
    const siteStaff = (staff ?? []).filter(
      (row) => row.location_id === data.locationId || row.is_roaming || extraIds.has(row.id),
    );
    return {
      setting,
      devices: devices ?? [],
      staff: siteStaff,
      daily: daily ?? [],
      unmatched: unmatched ?? [],
      imports: imports ?? [],
      date,
    };
  },
  { auth: { capability: "attendance.view" } },
);

export const getAttendanceHrDaily = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: z.string(),
    dateTo: z.string(),
    status: z.string().nullable().optional(),
    staffId: z.string().uuid().nullable().optional(),
    staffQ: z.string().max(120).optional(),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("attendance_daily_summary")
      .select("*")
      .gte("work_date", data.dateFrom)
      .lte("work_date", data.dateTo)
      .order("work_date", { ascending: false })
      .limit(2000);
    if (data.status) q = q.eq("status", data.status);
    let personRollup = Boolean(data.staffId);
    if (data.staffId) {
      q = q.eq("staff_id", data.staffId);
    } else if (data.staffQ?.trim()) {
      const needle = data.staffQ.trim();
      if (isAttendanceHrUnmappedSearch(needle)) {
        q = q.is("staff_id", null);
      } else {
        const staffIds = (await matchingStaffIds(context, needle)).slice(0, 300);
        if (staffIds.length > 0) {
          q = q.in("staff_id", staffIds);
          personRollup = true;
        } else {
          q = q.ilike("biometric_user_id", `%${needle.replace(/[%_,]/g, "")}%`);
        }
      }
    }
    if (data.locationId && !personRollup) {
      const homeIds = await fetchHomeStaffIdsAtLocation(context.supabase, data.locationId);
      q = q.or(punchOrHomeStaffOrFilter(data.locationId, homeIds));
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return enrichAttendanceHrDailyRows(context, (rows ?? []) as Array<Record<string, unknown>>);
  },
  { auth: { capability: "attendance.view" } },
);

export const getAttendanceHrPunches = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    deviceId: z.string().uuid().nullable().optional(),
    dateFrom: z.string(),
    dateTo: z.string(),
    unmatchedOnly: z.boolean().optional(),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("attendance_logs")
      .select("id, location_id, device_id, staff_id, biometric_user_id, punch_at, punch_type, source, probable_duplicate, excluded_from_calc, attendance_date, device_user_name")
      .gte("punch_at", `${data.dateFrom}T00:00:00.000Z`)
      .lte("punch_at", `${data.dateTo}T23:59:59.999Z`)
      .order("punch_at", { ascending: false })
      .limit(3000);
    if (data.locationId) {
      const homeIds = await fetchHomeStaffIdsAtLocation(context.supabase, data.locationId);
      q = q.or(punchOrHomeStaffOrFilter(data.locationId, homeIds));
    }
    if (data.deviceId) q = q.eq("device_id", data.deviceId);
    if (data.unmatchedOnly) q = q.is("staff_id", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { auth: { capability: "attendance.view" } },
);

export const listAttendanceHrMappings = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional(), unmatchedOnly: z.boolean().optional() }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    const columns =
      "id, company_id, location_id, device_id, biometric_user_id, device_name, previous_device_name, staff_id, employee_code, full_name, department, job_title, employment_status";
    const fallbackColumns =
      "id, company_id, location_id, device_id, biometric_user_id, device_name, staff_id, employee_code, full_name, department, job_title, employment_status";
    const run = async (select: string) => {
      let q = context.supabase.from("attendance_biometric_users").select(select).order("biometric_user_id").limit(2000);
      if (data.locationId) q = q.eq("location_id", data.locationId);
      if (data.unmatchedOnly) q = q.is("staff_id", null);
      return q;
    };
    let { data: rows, error } = await run(columns);
    if (error) {
      const retry = await run(fallbackColumns);
      if (retry.error) throw retry.error;
      rows = retry.data;
    }
    return rows ?? [];
  },
  { auth: { capability: "attendance.view" } },
);

type StaffMapFields = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  department: string | null;
  job_title: string | null;
  status: string | null;
};

type BiometricMapRow = {
  id: string;
  location_id: string;
  device_id: string;
  biometric_user_id: string;
};

async function applyStaffToBiometricUser(context: AuthContext, mapping: BiometricMapRow, staff: StaffMapFields) {
  const { error: uErr } = await context.supabase
    .from("attendance_biometric_users")
    .update({
      staff_id: staff.id,
      employee_code: staff.employee_code,
      full_name: staff.full_name,
      department: staff.department,
      job_title: staff.job_title,
      employment_status: staff.status,
      mapped_by: context.userId,
      mapped_at: new Date().toISOString(),
    })
    .eq("id", mapping.id);
  if (uErr) throw uErr;

  await context.supabase
    .from("attendance_logs")
    .update({ staff_id: staff.id })
    .eq("location_id", mapping.location_id)
    .eq("device_id", mapping.device_id)
    .eq("biometric_user_id", mapping.biometric_user_id)
    .is("staff_id", null);

  await audit(context, "attendance.map_user", "attendance_biometric_users", mapping.id, mapping.location_id, {
    staff_id: staff.id,
  });
}

export const mapAttendanceBiometricUser = createAuthenticatedAction(
  z.object({
    mappingId: z.string().uuid(),
    staffId: z.string().uuid(),
  }),
  async (data, context) => {
    assertMapUsers(context);
    const mapping = await loadBiometricMapping(context, data.mappingId);
    const { data: staff, error: sErr } = await context.supabase
      .from("staff")
      .select("id, full_name, employee_code, department, job_title, status")
      .eq("id", data.staffId)
      .single();
    if (sErr) throw sErr;

    await applyStaffToBiometricUser(
      context,
      {
        id: mapping.id as string,
        location_id: mapping.location_id as string,
        device_id: mapping.device_id as string,
        biometric_user_id: String(mapping.biometric_user_id),
      },
      staff,
    );
    await recalcRecentAttendance(context, mapping.location_id as string);
    return { ok: true };
  },
  { auth: { capability: "attendance.map_users" } },
);

const bulkMapItemSchema = z.object({
  mappingId: z.string().uuid(),
  staffId: z.string().uuid(),
});

export const mapAttendanceBiometricUsers = createAuthenticatedAction(
  z.object({
    mappings: z.array(bulkMapItemSchema).min(1).max(500),
  }),
  async (data, context) => {
    assertMapUsers(context);

    const uniqueIds = [...new Set(data.mappings.map((m) => m.mappingId))];
    const staffIds = [...new Set(data.mappings.map((m) => m.staffId))];

    const [{ data: mappingRows, error: mErr }, { data: staffRows, error: sErr }] = await Promise.all([
      context.supabase.from("attendance_biometric_users").select("*").in("id", uniqueIds),
      context.supabase
        .from("staff")
        .select("id, full_name, employee_code, department, job_title, status")
        .in("id", staffIds),
    ]);
    if (mErr) throw mErr;
    if (sErr) throw sErr;

    const mappingById = new Map((mappingRows ?? []).map((row) => [row.id as string, row]));
    const staffById = new Map((staffRows ?? []).map((row) => [row.id as string, row]));

    const locations = new Set<string>();
    for (const row of mappingRows ?? []) {
      locations.add(row.location_id as string);
    }
    for (const locationId of locations) {
      await assertSite(context, locationId);
    }

    let saved = 0;
    const failed: Array<{ mappingId: string; error: string }> = [];
    const recalcLocations = new Set<string>();

    for (const item of data.mappings) {
      try {
        const mapping = mappingById.get(item.mappingId);
        if (!mapping) throw new Error("Mapping not found");
        const staff = staffById.get(item.staffId);
        if (!staff) throw new Error("Employee not found");
        await applyStaffToBiometricUser(
          context,
          {
            id: mapping.id as string,
            location_id: mapping.location_id as string,
            device_id: mapping.device_id as string,
            biometric_user_id: String(mapping.biometric_user_id),
          },
          staff,
        );
        saved += 1;
        recalcLocations.add(mapping.location_id as string);
      } catch (e) {
        failed.push({ mappingId: item.mappingId, error: e instanceof Error ? e.message : "Failed" });
      }
    }

    for (const locationId of recalcLocations) {
      await recalcRecentAttendance(context, locationId);
    }

    return { saved, failed };
  },
  { auth: { capability: "attendance.map_users" } },
);

async function assertMapUsers(context: AuthContext) {
  if (!canUserDo(context.roles ?? [], "attendance.map_users")) {
    throw new ForbiddenError("HR mapping permission required");
  }
}

function throwPg(error: { message: string; details?: string; code?: string } | null): asserts error is null {
  if (!error) return;
  const extra = [error.code, error.details].filter(Boolean).join(" — ");
  throw new Error(extra ? `${error.message} (${extra})` : error.message);
}

async function loadBiometricMapping(context: AuthContext, mappingId: string) {
  const { data: mapping, error } = await context.supabase
    .from("attendance_biometric_users")
    .select("*")
    .eq("id", mappingId)
    .single();
  throwPg(error);
  if (!mapping) throw new Error("Device user mapping not found");
  await assertSite(context, mapping.location_id as string);
  return mapping;
}

async function clearMappedLogs(
  context: AuthContext,
  mapping: { location_id: unknown; device_id: unknown; biometric_user_id: unknown; staff_id: unknown },
) {
  const staffId = mapping.staff_id == null ? "" : String(mapping.staff_id);
  if (!staffId) return;
  const { error } = await context.supabase
    .from("attendance_logs")
    .update({ staff_id: null })
    .eq("location_id", String(mapping.location_id))
    .eq("device_id", String(mapping.device_id))
    .eq("biometric_user_id", String(mapping.biometric_user_id))
    .eq("staff_id", staffId);
  throwPg(error);
}

async function recalcRecentAttendance(context: AuthContext, locationId: string) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  await recalculateAttendanceRange(context.supabase, locationId, from, to);
}

export const unmapAttendanceBiometricUser = createAuthenticatedAction(
  z.object({ mappingId: z.string().uuid() }),
  async (data, context) => {
    await assertMapUsers(context);
    const mapping = await loadBiometricMapping(context, data.mappingId);

    const { error: uErr } = await context.supabase
      .from("attendance_biometric_users")
      .update({
        staff_id: null,
        employee_code: null,
        full_name: null,
        department: null,
        job_title: null,
        employment_status: "unknown",
        mapped_by: null,
        mapped_at: null,
      })
      .eq("id", data.mappingId);
    throwPg(uErr);

    await clearMappedLogs(context, mapping);
    await audit(context, "attendance.unmap_user", "attendance_biometric_users", data.mappingId, mapping.location_id as string, {
      previous_staff_id: mapping.staff_id,
    });
    await recalcRecentAttendance(context, mapping.location_id as string);
    return { ok: true };
  },
  { auth: { capability: "attendance.map_users" } },
);

export const removeAttendanceBiometricUser = createSafeAuthenticatedAction(
  z.object({ mappingId: z.string().uuid() }),
  async (data, context) => {
    await assertMapUsers(context);
    const mapping = await loadBiometricMapping(context, data.mappingId);

    await clearMappedLogs(context, mapping);

    const { error: dErr, count } = await context.supabase
      .from("attendance_biometric_users")
      .delete({ count: "exact" })
      .eq("id", data.mappingId);
    throwPg(dErr);
    if (count === 0) throw new Error("Device user mapping was not removed (not found or no permission)");

    try {
      await audit(context, "attendance.remove_device_user", "attendance_biometric_users", data.mappingId, mapping.location_id as string, {
        biometric_user_id: mapping.biometric_user_id,
        device_name: mapping.device_name,
        previous_staff_id: mapping.staff_id,
      });
    } catch (e) {
      console.warn("[attendance-hr] audit after remove failed", e instanceof Error ? e.message : e);
    }
    void recalcRecentAttendance(context, mapping.location_id as string).catch((e) => {
      console.warn("[attendance-hr] recalc after remove failed", e instanceof Error ? e.message : e);
    });
    return { ok: true };
  },
  { auth: { capability: "attendance.map_users" } },
);

export const saveAttendanceDevice = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    locationId: z.string().uuid(),
    deviceCode: z.string().min(1).max(50),
    deviceName: z.string().min(1).max(200),
    vendor: z.string().max(50).default("zkteco"),
    ipAddress: z.string().max(80).optional().nullable(),
    serialNumber: z.string().max(100).optional().nullable(),
    timezone: z.string().max(60).default("Asia/Qatar"),
    active: z.boolean().default(true),
    connectionMode: z.string().max(20).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const serial = data.serialNumber?.trim() || null;
    const { data: site } = await context.supabase
      .from("attendance_site_settings")
      .select("company_id")
      .eq("location_id", data.locationId)
      .maybeSingle();
    const payload = {
      location_id: data.locationId,
      device_code: data.deviceCode,
      device_name: data.deviceName,
      vendor: data.vendor,
      ip_address: data.ipAddress ?? null,
      serial_number: serial,
      timezone: data.timezone,
      active: data.active,
      company_id: site?.company_id ?? null,
      connection_mode: data.connectionMode ?? (serial ? "adms" : "file"),
    };
    if (data.id) {
      const { error } = await context.supabase.from("attendance_devices").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("attendance_devices").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  },
  { auth: { capability: "attendance.manage_devices" } },
);

export const requestAttendanceDeviceFetch = createAuthenticatedAction(
  z.object({
    deviceId: z.string().uuid(),
    hours: z.number().int().min(1).max(168).optional(),
  }),
  async (data, context) => {
    const { data: device, error } = await context.supabase
      .from("attendance_devices")
      .select("id, location_id, serial_number, timezone, last_adms_at")
      .eq("id", data.deviceId)
      .maybeSingle();
    if (error) throw error;
    if (!device) throw new Error("Device not found");
    await assertLocationAccess(context, device.location_id as string);
    if (!String(device.serial_number ?? "").trim()) {
      throw new Error("Save the device serial number first.");
    }
    if (!isAdmsDeviceOnline(device.last_adms_at == null ? null : String(device.last_adms_at))) {
      throw new Error("Device is offline. Fetch runs only after the terminal polls the server.");
    }
    const result = await queueAdmsAttlogQuery(
      supabaseAdmin,
      device.id as string,
      data.hours ?? 48,
      device.timezone ? String(device.timezone) : "Asia/Qatar",
    );
    await audit(context, "adms_fetch_queued", "attendance_device", device.id as string, device.location_id as string, {
      hours: data.hours ?? 48,
      cmdId: result.cmdId,
    });
    return {
      ok: true as const,
      cmdId: result.cmdId,
      from: result.from.toISOString(),
      to: result.to.toISOString(),
    };
  },
  { auth: { capability: "attendance.manage_devices" } },
);

export const saveAttendanceShiftTemplate = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    companyId: z.string().uuid(),
    locationId: z.string().uuid().nullable().optional(),
    name: z.string().min(1).max(80),
    startTime: z.string(),
    endTime: z.string(),
    overnight: z.boolean().default(false),
    graceMinutes: z.number().int().min(0).default(10),
    breakMinutes: z.number().int().min(0).default(0),
    minWorkMinutes: z.number().int().min(0).default(480),
    overtimeAfterMinutes: z.number().int().min(0).default(480),
    dayCutoffTime: z.string().default("06:00"),
    active: z.boolean().default(true),
  }),
  async (data, context) => {
    const payload = {
      company_id: data.companyId,
      location_id: data.locationId ?? null,
      name: data.name,
      start_time: data.startTime,
      end_time: data.endTime,
      overnight: data.overnight,
      grace_minutes: data.graceMinutes,
      break_minutes: data.breakMinutes,
      min_work_minutes: data.minWorkMinutes,
      overtime_after_minutes: data.overtimeAfterMinutes,
      day_cutoff_time: data.dayCutoffTime,
      active: data.active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("attendance_shift_templates").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("attendance_shift_templates").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  },
  { auth: { capability: "attendance.configure" } },
);

export const saveAttendanceSiteSetting = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    companyId: z.string().uuid(),
    attendanceEnabled: z.boolean(),
    timezone: z.string().max(60).default("Asia/Qatar"),
    notes: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.from("attendance_site_settings").upsert({
      location_id: data.locationId,
      company_id: data.companyId,
      attendance_enabled: data.attendanceEnabled,
      timezone: data.timezone,
      notes: data.notes ?? null,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "attendance.configure" } },
);

export const submitAttendanceCorrection = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    staffId: z.string().uuid().nullable().optional(),
    workDate: z.string().optional(),
    summaryId: z.string().uuid().nullable().optional(),
    punchId: z.string().uuid().nullable().optional(),
    kind: z.enum([
      "add_punch",
      "edit_in",
      "edit_out",
      "mark_leave",
      "mark_holiday",
      "mark_week_off",
      "approve_overtime",
      "ignore_duplicate",
      "map_user",
    ]),
    originalValue: z.record(z.unknown()).default({}),
    newValue: z.record(z.unknown()).default({}),
    reason: z.string().min(3).max(1000),
  }),
  async (data, context) => {
    await assertSite(context, data.locationId);
    const { data: row, error } = await context.supabase
      .from("attendance_corrections")
      .insert({
        location_id: data.locationId,
        staff_id: data.staffId ?? null,
        work_date: data.workDate ?? null,
        summary_id: data.summaryId ?? null,
        punch_id: data.punchId ?? null,
        kind: data.kind,
        original_value: data.originalValue,
        new_value: data.newValue,
        reason: data.reason,
        requested_by: context.userId,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw error;
    await audit(context, "attendance.correction_submitted", "attendance_corrections", row.id, data.locationId);
    await dispatchHrNotify({
      kind: "correction_submitted",
      workDate: data.workDate ?? null,
      locationId: data.locationId,
      sourceId: row.id,
    });
    return { id: row.id };
  },
  { auth: { capability: "attendance.correct" } },
);

export const reviewAttendanceCorrection = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    reviewNote: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("attendance_corrections")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    await assertSite(context, row.location_id as string);
    if (row.requested_by === context.userId) {
      throw new ForbiddenError("You cannot approve your own correction.");
    }
    const { error: uErr } = await context.supabase
      .from("attendance_corrections")
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.reviewNote ?? null,
      })
      .eq("id", data.id);
    if (uErr) throw uErr;

    if (data.decision === "approved") {
      await applyCorrection(context, row);
    }
    await audit(context, `attendance.correction_${data.decision}`, "attendance_corrections", data.id, row.location_id as string);
    const requester = typeof row.requested_by === "string" ? row.requested_by : null;
    await dispatchHrNotify(
      {
        kind: data.decision === "approved" ? "correction_approved" : "correction_rejected",
        workDate: row.work_date ? String(row.work_date).slice(0, 10) : null,
        locationId: row.location_id as string,
        sourceId: data.id,
      },
      requester ? [requester] : undefined,
    );
    return { ok: true };
  },
  { auth: { capability: "attendance.approve" } },
);

async function applyCorrection(context: AuthContext, row: Record<string, unknown>) {
  const kind = String(row.kind);
  const next = (row.new_value ?? {}) as Record<string, unknown>;
  if (kind === "ignore_duplicate" && row.punch_id) {
    await context.supabase
      .from("attendance_logs")
      .update({ excluded_from_calc: true, probable_duplicate: true })
      .eq("id", String(row.punch_id));
  }
  if (kind === "add_punch" && next.punch_at) {
    await context.supabase.from("attendance_logs").insert({
      location_id: row.location_id,
      staff_id: row.staff_id ?? null,
      biometric_user_id: next.biometric_user_id ?? null,
      punch_at: next.punch_at,
      punch_type: next.punch_type ?? "in",
      source: "correction",
      attendance_date: row.work_date ?? String(next.punch_at).slice(0, 10),
      raw_payload: { correction_id: row.id, reason: row.reason },
    });
  }
  if (kind === "mark_leave" && row.staff_id && row.work_date) {
    await context.supabase.from("attendance_leave_records").upsert({
      location_id: row.location_id,
      staff_id: row.staff_id,
      leave_date: row.work_date,
      leave_type: String(next.leave_type ?? "annual_leave"),
      source: "correction",
      created_by: context.userId,
    }, { onConflict: "staff_id,leave_date" });
  }
  const locationId = String(row.location_id ?? "");
  const workDate = String(row.work_date ?? new Date().toISOString().slice(0, 10));
  if (locationId) {
    await recalculateAttendanceRange(context.supabase, locationId, workDate, workDate);
  }
  if ((kind === "edit_in" || kind === "edit_out") && row.summary_id) {
    const patch: Record<string, unknown> = { hr_remarks: row.reason };
    if (kind === "edit_in" && next.actual_in) patch.actual_in = next.actual_in;
    if (kind === "edit_out" && next.actual_out) patch.actual_out = next.actual_out;
    await context.supabase.from("attendance_daily_summary").update(patch).eq("id", String(row.summary_id));
  }
}

export const listAttendanceCorrections = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional(), status: z.string().optional() }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("attendance_corrections")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { auth: { capability: "attendance.view" } },
);

export const listAttendanceImports = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("attendance_import_files")
      .select("id, import_id, location_id, device_id, original_filename, file_type, file_hash, status, row_count, imported_count, duplicate_count, rejected_count, unmatched_count, created_at, storage_path")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { auth: { capability: "attendance.view" } },
);

export const listAttendanceRosterUploads = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    let q = context.supabase
      .from("daily_ops_roster_uploads")
      .select("id, location_id, file_name, file_type, period_start, period_end, rows_imported, uploaded_by, notes, created_at")
      .eq("notes", ATTENDANCE_TALLY_UPLOAD_NOTE)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { auth: { capability: "attendance.view" } },
);

export const recalcAttendanceRange = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid(), dateFrom: z.string(), dateTo: z.string() }),
  async (data, context) => {
    await assertSite(context, data.locationId);
    return recalculateAttendanceRange(context.supabase, data.locationId, data.dateFrom, data.dateTo);
  },
  { auth: { capability: "attendance.import" } },
);

async function resolveAccessibleAttendanceLocationIds(context: AuthContext, locationId?: string | null) {
  if (locationId) {
    await assertSite(context, locationId);
    return [locationId];
  }
  const { data, error } = await context.supabase.from("attendance_site_settings").select("location_id");
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((row) => row.location_id as string).filter(Boolean))];
  if (!canUserDo(context.roles ?? [], "attendance.view_all")) {
    for (const id of ids) await assertSite(context, id);
  }
  return ids;
}

async function countByLocations(
  context: AuthContext,
  table: "attendance_logs" | "attendance_daily_summary" | "attendance_import_files" | "attendance_corrections",
  locationIds: string[],
) {
  let q = context.supabase.from(table).select("id", { count: "exact", head: true });
  q = locationIds.length === 1 ? q.eq("location_id", locationIds[0]) : q.in("location_id", locationIds);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function deleteByLocations(
  context: AuthContext,
  table: "attendance_logs" | "attendance_daily_summary" | "attendance_import_files" | "attendance_corrections",
  locationIds: string[],
) {
  let q = context.supabase.from(table).delete();
  q = locationIds.length === 1 ? q.eq("location_id", locationIds[0]) : q.in("location_id", locationIds);
  const { error } = await q;
  if (error) throw error;
}

/** Purge imported attendance-hr punches/summaries for one site, or every accessible site when locationId is empty. */
export const purgeAttendanceHrImportedData = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const locationIds = await resolveAccessibleAttendanceLocationIds(context, data.locationId ?? null);
    if (locationIds.length === 0) {
      return { punches: 0, summaries: 0, files: 0, corrections: 0, locations: 0 };
    }

    const [punches, summaries, files, corrections] = await Promise.all([
      countByLocations(context, "attendance_logs", locationIds),
      countByLocations(context, "attendance_daily_summary", locationIds),
      countByLocations(context, "attendance_import_files", locationIds),
      countByLocations(context, "attendance_corrections", locationIds),
    ]);

    const { data: fileRows, error: fileErr } = await (locationIds.length === 1
      ? context.supabase
          .from("attendance_import_files")
          .select("storage_path")
          .eq("location_id", locationIds[0])
          .not("storage_path", "is", null)
          .limit(5000)
      : context.supabase
          .from("attendance_import_files")
          .select("storage_path")
          .in("location_id", locationIds)
          .not("storage_path", "is", null)
          .limit(5000));
    if (fileErr) throw fileErr;

    const paths = [...new Set((fileRows ?? []).map((row) => String(row.storage_path ?? "")).filter(Boolean))];
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error: storageErr } = await context.supabase.storage.from(ATTENDANCE_FILE_BUCKET).remove(chunk);
      if (storageErr) {
        console.warn("[attendance-hr] storage purge skipped", storageErr.message);
      }
    }

    await deleteByLocations(context, "attendance_corrections", locationIds);
    await deleteByLocations(context, "attendance_daily_summary", locationIds);
    await deleteByLocations(context, "attendance_logs", locationIds);
    await deleteByLocations(context, "attendance_import_files", locationIds);

    await audit(context, "attendance.purge_imported", "attendance_logs", null, data.locationId ?? null, {
      location_ids: locationIds,
      punches,
      summaries,
      files,
      corrections,
    });

    return { punches, summaries, files, corrections, locations: locationIds.length };
  },
  { auth: { capability: "attendance.import" } },
);

type StaffLookup = { id: string; full_name: string | null; employee_code: string | null; qid: string | null };
type LocationLookup = { id: string; code: string; name: string | null; region: string | null };

async function enrichAttendanceHrDailyRows(
  context: AuthContext,
  rows: Array<Record<string, unknown>>,
): Promise<AttendanceHrReportRow[]> {
  const staffIds = [...new Set(rows.map((row) => row.staff_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const locationIds = [...new Set(rows.map((row) => row.location_id).filter((id): id is string => typeof id === "string" && id.length > 0))];

  const [staffRows, locationRows] = await Promise.all([
    loadByIds<StaffLookup>(context, "staff", "id, full_name, employee_code, qid", staffIds),
    loadByIds<LocationLookup>(context, "locations", "id, code, name, region", locationIds),
  ]);

  const staffById = new Map(staffRows.map((row) => [row.id, row]));
  const locationById = new Map(locationRows.map((row) => [row.id, row]));

  return rows.map((row) => {
    const staff = typeof row.staff_id === "string" ? staffById.get(row.staff_id) : undefined;
    const location = typeof row.location_id === "string" ? locationById.get(row.location_id) : undefined;
    return {
      id: String(row.id),
      location_id: String(row.location_id ?? ""),
      staff_id: typeof row.staff_id === "string" ? row.staff_id : null,
      biometric_user_id: row.biometric_user_id == null ? null : String(row.biometric_user_id),
      work_date: String(row.work_date ?? ""),
      status: String(row.status ?? ""),
      actual_in: row.actual_in == null ? null : String(row.actual_in),
      actual_out: row.actual_out == null ? null : String(row.actual_out),
      late_minutes: Number(row.late_minutes ?? 0),
      early_leave_minutes: Number(row.early_leave_minutes ?? 0),
      overtime_minutes: Number(row.overtime_minutes ?? 0),
      missed_punch: Boolean(row.missed_punch),
      punch_count: Number(row.punch_count ?? 0),
      staff_name: staff?.full_name?.trim() || null,
      employee_code: staff?.employee_code ?? null,
      qid: staff?.qid ?? null,
      location_code: location?.code ?? null,
      location_name: location?.name ?? null,
      location_region: location?.region ?? null,
    };
  });
}

async function matchingStaffIds(context: AuthContext, needle: string): Promise<string[]> {
  const { data, error } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, qid")
    .eq("status", "active")
    .limit(2000);
  if (error) throw error;
  return (data ?? [])
    .filter((row) =>
      attendanceHrStaffMatches(
        { staff_name: row.full_name, employee_code: row.employee_code, qid: row.qid },
        needle,
      ),
    )
    .map((row) => row.id as string);
}

async function loadByIds<T extends { id: string }>(
  context: AuthContext,
  table: "staff" | "locations",
  columns: string,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await context.supabase.from(table).select(columns).in("id", chunk);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}
