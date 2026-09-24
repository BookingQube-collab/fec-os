"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { canUserDo, type AppRole } from "@/lib/rbac";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ATTENDANCE_DAILY_LIST_COLUMNS,
  ATTENDANCE_DAILY_LIST_PAGE_SIZE,
  ATTENDANCE_FILE_BUCKET,
  DEFAULT_RULES,
  DEFAULT_SHIFT,
  isAdmsDeviceOnline,
} from "@/lib/attendance-hr/constants";
import {
  defaultSiteShiftPolicy,
  expectedShiftMinutes,
  normalizeAttendanceEmploymentRole,
  resolveReportingAndBuffer,
  resolveWeekOff,
} from "@/lib/attendance-hr/shift-policy";
import { queueAdmsAttlogQuery, queueAdmsAttlogQueryRange } from "@/lib/attendance-hr/adms-ingest";
import {
  findAttendanceGaps,
  qatarRangeToFetchWindow,
  resolveResyncWindow,
} from "@/lib/attendance-hr/gap-check";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { applyRosterDayStatusOverride, resolveHoursBasedAttendanceStatus } from "@/lib/attendance-display";
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
import { BIOMETRIC_USER_CONFLICT } from "@/lib/attendance-hr/mapping-merge";
import { ATTENDANCE_TALLY_UPLOAD_NOTE } from "@/lib/attendance-hr/roster-upload";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import { normalizeName } from "@/lib/staff-roster/values";
import {
  normalizeShiftHm,
  resolveListingLateMinutes,
  resolveRosterScheduledBounds,
  type RosterShiftLookup,
} from "@/lib/attendance-hr/late-punch";
import {
  appendMissingRosterAndPunchSummaryRows,
  attendanceHrIncludesStaffInListing,
  attendanceHrStaffMatches,
  collapseFlexibleAttendanceReportRows,
  isAttendanceHrUnmappedSearch,
  type AttendanceHrReportRow,
  type ListingGapPunchDay,
  type ListingGapRosterDay,
} from "@/lib/attendance-hr/report";
import {
  expandFlexibleBiometricPairsByDeviceName,
  flexibleDayFirstLastBiometricUserIds,
  flexibleDayFirstLastLocationIds,
  flexibleDayFirstLastPunchAt,
  staffUsesCrossSiteDayMerge,
  type FlexibleCrossSitePunch,
} from "@/lib/attendance-hr/flexible-cross-site";
import {
  DEVICE_LOG_CAP,
  DEVICE_LOG_PUSH_SOURCE,
  DEVICE_LOG_USERS_PAGE_SIZE,
  collapseCrossSiteDeviceLogDays,
  collectDeviceLogUsers,
  deviceLogDisplayName,
  deviceLogPunchRange,
  deviceLogQatarYmd,
  deviceLogSearchNeedle,
  deviceLogSearchOrFilter,
  deviceLogUserPairsOrFilter,
  indexDeviceLogBioNames,
  lookupDeviceLogBioName,
  parseDeviceLogUserOptionKey,
  rollupDeviceLogDays,
  type AttendanceDeviceLogRow,
} from "@/lib/attendance-hr/device-logs";
import {
  CANONICAL_LOCATION_CODES,
  formatLocationLabel,
  formatLocationName,
} from "@/lib/locations/normalize";
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
          .select("location_id, company_id, attendance_enabled, timezone, break_minutes, reporting_time_minutes, buffer_minutes, permanent_hours, secondment_hours, joker_hours, locations(id, code, name, region, status)"),
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
          break_minutes: setting?.break_minutes ?? null,
          reporting_time_minutes: setting?.reporting_time_minutes ?? null,
          buffer_minutes: setting?.buffer_minutes ?? null,
          permanent_hours: setting?.permanent_hours ?? null,
          secondment_hours: setting?.secondment_hours ?? null,
          joker_hours: setting?.joker_hours ?? null,
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
    /** @deprecated Prefer departmentIds — kept so export/API can still send a single id. */
    departmentId: z.string().uuid().nullable().optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);

    const departmentIds = [
      ...new Set(
        [...(data.departmentIds ?? []), ...(data.departmentId ? [data.departmentId] : [])].filter(Boolean),
      ),
    ];
    const needle = data.staffQ?.trim() || "";
    const needStaffSearch = Boolean(!data.staffId && needle && !isAttendanceHrUnmappedSearch(needle));
    const [matchedStaffIds, deptStaffIds] = await Promise.all([
      needStaffSearch ? matchingStaffIds(context, needle) : Promise.resolve([] as string[]),
      departmentIds.length
        ? (async () => {
            const { data: links, error: deptErr } = await context.supabase
              .from("staff_departments")
              .select("staff_id")
              .in("department_id", departmentIds);
            if (deptErr) throw deptErr;
            return [
              ...new Set((links ?? []).map((row) => row.staff_id).filter((id): id is string => Boolean(id))),
            ];
          })()
        : Promise.resolve(null as string[] | null),
    ]);

    let staffFilter: "none" | "unmapped" | { ids: string[] } | { biometricIlike: string } = "none";
    if (data.staffId) {
      staffFilter = { ids: [data.staffId] };
    } else if (needle) {
      if (isAttendanceHrUnmappedSearch(needle)) {
        staffFilter = "unmapped";
      } else {
        const staffIds = matchedStaffIds.slice(0, 300);
        staffFilter =
          staffIds.length > 0
            ? { ids: staffIds }
            : { biometricIlike: `%${needle.replace(/[%_,]/g, "")}%` };
      }
    }

    // Unmapped punches have no staff_id, so they drop out of a department filter.
    if (deptStaffIds && deptStaffIds.length === 0) return [];

    // Page past PostgREST max_rows (~1000). A single .limit(2000) still returns only 1000,
    // and work_date desc then drops the start of the FEC month (e.g. Aug 28–Sep 5).
    // ponytail: full filtered range in 1k pages — fine for one site-month (~1–3k); if multi-site year exports grow past ~20k, stream/paginate the export path.
    let rows: Array<Record<string, unknown>> = [];
    for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
      let q = context.supabase
        .from("attendance_daily_summary")
        .select(ATTENDANCE_DAILY_LIST_COLUMNS)
        .gte("work_date", data.dateFrom)
        .lte("work_date", data.dateTo)
        .order("work_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
      if (data.status) q = q.eq("status", data.status);
      if (staffFilter === "unmapped") q = q.is("staff_id", null);
      else if (staffFilter !== "none" && "ids" in staffFilter) q = q.in("staff_id", staffFilter.ids);
      else if (staffFilter !== "none" && "biometricIlike" in staffFilter) {
        q = q.ilike("biometric_user_id", staffFilter.biometricIlike);
      }
      if (deptStaffIds) q = q.in("staff_id", deptStaffIds);
      // Site chip always wins: every listed/KPI row must be for this location_id.
      // Do not widen via home-staff OR or staff-search person rollup (other sites' punches).
      if (data.locationId) q = q.eq("location_id", data.locationId);
      const { data: page, error } = await q;
      if (error) throw error;
      rows.push(...((page ?? []) as Array<Record<string, unknown>>));
      if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
    }

    // Flexible staff may keep the day at the first-punch site while this chip is only
    // check-in or check-out — pull sibling person-days that punched here, then collapse.
    if (data.locationId) {
      const flexPunchDays = await flexibleStaffPunchDaysAtLocation(
        context,
        data.locationId,
        data.dateFrom,
        data.dateTo,
        staffFilter === "unmapped"
          ? null
          : staffFilter !== "none" && "ids" in staffFilter
            ? staffFilter.ids
            : null,
      );
      const staffIds = [...flexPunchDays.keys()].filter((id) =>
        deptStaffIds ? deptStaffIds.includes(id) : true,
      );
      if (staffIds.length) {
        const seenIds = new Set(rows.map((r) => String(r.id ?? "")));
        for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
          let q = context.supabase
            .from("attendance_daily_summary")
            .select(ATTENDANCE_DAILY_LIST_COLUMNS)
            .in("staff_id", staffIds)
            .gte("work_date", data.dateFrom)
            .lte("work_date", data.dateTo)
            .order("work_date", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
          if (data.status) q = q.eq("status", data.status);
          const { data: page, error } = await q;
          if (error) throw error;
          for (const row of page ?? []) {
            const id = String(row.id ?? "");
            if (id && seenIds.has(id)) continue;
            const staffId = String(row.staff_id ?? "");
            const day = String(row.work_date ?? "").slice(0, 10);
            if (!flexPunchDays.get(staffId)?.has(day)) continue;
            if (id) seenIds.add(id);
            rows.push(row as Record<string, unknown>);
          }
          if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
        }
      }
    }

    // Fill person-days that have roster or raw punches but no daily_summary row
    // (flexible cross-site can mark a day "covered" without writing a mapped summary).
    // Skip when a status chip is active — synthetics would bypass the status query.
    if (staffFilter !== "unmapped" && !data.status) {
      const fillStaffIds = new Set<string>();
      if (staffFilter !== "none" && "ids" in staffFilter) {
        for (const id of staffFilter.ids) fillStaffIds.add(id);
      }
      for (const row of rows) {
        if (typeof row.staff_id === "string" && row.staff_id) fillStaffIds.add(row.staff_id);
      }
      if (deptStaffIds) {
        for (const id of [...fillStaffIds]) {
          if (!deptStaffIds.includes(id)) fillStaffIds.delete(id);
        }
      }
      // Staff search → those ids. Site chip with no search → whole-site roster/punches.
      // All-locations unfiltered → only staff already present in summary rows.
      const gapStaffIds =
        staffFilter !== "none" && "ids" in staffFilter
          ? [...fillStaffIds]
          : data.locationId
            ? null
            : fillStaffIds.size > 0
              ? [...fillStaffIds]
              : null;
      const gapSources = await loadListingGapRosterAndPunchDays(context, {
        staffIds: gapStaffIds,
        locationId: data.locationId ?? null,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      });
      rows = appendMissingRosterAndPunchSummaryRows({
        rows,
        roster: gapSources.roster,
        punchDays: gapSources.punchDays,
        locationId: data.locationId ?? null,
      });
    }

    return enrichAttendanceHrDailyRows(context, rows);
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

/**
 * Persist a sheet-name → staff map for roster import (location-scoped device_name).
 * Reuses attendance_biometric_users so future imports auto-match via name_map.
 */
export const mapAttendanceRosterSheetName = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    deviceName: z.string().min(1).max(200),
    staffId: z.string().uuid(),
  }),
  async (data, context) => {
    const roles = (context.roles ?? []) as AppRole[];
    if (!canUserDo(roles, "attendance.map_users") && !canUserDo(roles, "people.import_roster")) {
      throw new ForbiddenError("Roster mapping permission required");
    }
    await assertSite(context, data.locationId);

    const deviceName = data.deviceName.trim();
    if (!deviceName) throw new Error("Sheet name is required");

    const { data: staff, error: sErr } = await context.supabase
      .from("staff")
      .select("id, full_name, employee_code, department, job_title, status")
      .eq("id", data.staffId)
      .single();
    if (sErr) throw sErr;

    const { data: existing, error: eErr } = await context.supabase
      .from("attendance_biometric_users")
      .select("id, location_id, device_id, biometric_user_id, device_name")
      .eq("location_id", data.locationId)
      .limit(5000);
    if (eErr) throw eErr;

    const key = normalizeName(deviceName);
    const matches = (existing ?? []).filter((row) => normalizeName(String(row.device_name ?? "")) === key);

    if (matches.length) {
      for (const mapping of matches) {
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
      }
      await audit(context, "attendance.map_roster_name", "attendance_biometric_users", matches[0].id as string, data.locationId, {
        device_name: deviceName,
        staff_id: staff.id,
        updated: matches.length,
      });
      return { ok: true as const, mappingId: matches[0].id as string, created: false, updated: matches.length };
    }

    const { data: site } = await context.supabase
      .from("attendance_site_settings")
      .select("company_id")
      .eq("location_id", data.locationId)
      .maybeSingle();
    const companyId = site?.company_id as string | null;
    if (!companyId) throw new Error("Attendance company is not configured for this site.");

    let deviceId: string | null = null;
    const { data: device } = await context.supabase
      .from("attendance_devices")
      .select("id")
      .eq("location_id", data.locationId)
      .eq("active", true)
      .order("device_name")
      .limit(1)
      .maybeSingle();
    if (device?.id) {
      deviceId = device.id as string;
    } else {
      const { data: createdDevice, error: dErr } = await context.supabase
        .from("attendance_devices")
        .upsert(
          {
            location_id: data.locationId,
            company_id: companyId,
            device_code: "roster-name-map",
            device_name: "Roster name map",
            vendor: "manual",
            active: true,
            timezone: "Asia/Qatar",
            connection_mode: "file",
          },
          { onConflict: "location_id,device_code", ignoreDuplicates: false },
        )
        .select("id")
        .single();
      if (dErr) throw dErr;
      deviceId = createdDevice.id as string;
    }

    const biometricUserId = `roster:${key.replace(/\s+/g, "_")}`.slice(0, 80);
    const { data: inserted, error: iErr } = await context.supabase
      .from("attendance_biometric_users")
      .upsert(
        {
          company_id: companyId,
          location_id: data.locationId,
          device_id: deviceId,
          biometric_user_id: biometricUserId,
          device_name: deviceName,
          staff_id: staff.id,
          employee_code: staff.employee_code,
          full_name: staff.full_name,
          department: staff.department,
          job_title: staff.job_title,
          employment_status: staff.status ?? "unknown",
          mapped_by: context.userId,
          mapped_at: new Date().toISOString(),
        },
        { onConflict: BIOMETRIC_USER_CONFLICT, ignoreDuplicates: false },
      )
      .select("id")
      .single();
    if (iErr) throw iErr;

    await audit(context, "attendance.map_roster_name", "attendance_biometric_users", inserted.id, data.locationId, {
      device_name: deviceName,
      staff_id: staff.id,
      created: true,
    });
    return { ok: true as const, mappingId: inserted.id as string, created: true, updated: 1 };
  },
  { auth: { anyCapability: ["attendance.map_users", "people.import_roster"] } },
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

const resyncWindowSchema = z.object({
  locationId: z.string().uuid(),
  mode: z.enum(["dates", "fec_month"]),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(62).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  deviceId: z.string().uuid().optional().nullable(),
});

/** Scan rostered / excluded-punch gaps for a site over FEC month or specific dates. */
export const checkAttendancePunchGaps = createSafeAuthenticatedAction(
  resyncWindowSchema,
  async (data, context) => {
    await assertSite(context, data.locationId);
    const window = resolveResyncWindow({
      mode: data.mode,
      dates: data.dates,
      month: data.month ?? defaultPayrollPeriod(qatarTodayYmd()).month,
    });
    const report = await findAttendanceGaps(context.supabase, {
      locationId: data.locationId,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      dates: window.dates.length ? window.dates : undefined,
    });
    return report;
  },
  { auth: { capability: "attendance.view" } },
);

export type ResyncFetchSkipReason = "no_serial" | "device_offline";

/**
 * Admin resync:
 * - reprocessStored: recompute duplicate flags + daily summaries from DB punches (works offline)
 * - fetchFromDevice: queue ADMS DATA QUERY ATTLOG for the window (device must poll; no TCP pull from Vercel)
 *
 * Uses createSafeAuthenticatedAction so failures return `{ ok: false }` instead of throwing
 * (thrown server actions white-screen the Settings page in production RSC).
 */
export const resyncAttendancePunches = createSafeAuthenticatedAction(
  resyncWindowSchema.extend({
    reprocessStored: z.boolean().default(true),
    fetchFromDevice: z.boolean().default(false),
  }),
  async (data, context) => {
    await assertSite(context, data.locationId);
    const window = resolveResyncWindow({
      mode: data.mode,
      dates: data.dates,
      month: data.month ?? defaultPayrollPeriod(qatarTodayYmd()).month,
    });

    let fetchQueued: {
      cmdId: number;
      from: string;
      to: string;
      deviceId: string;
    } | null = null;
    let fetchSkippedReason: ResyncFetchSkipReason | null = null;

    // Validate device SN / online status BEFORE expensive reprocess so missing SN never crashes the UI.
    if (data.fetchFromDevice) {
      let deviceQuery = context.supabase
        .from("attendance_devices")
        .select("id, location_id, serial_number, timezone, last_adms_at")
        .eq("location_id", data.locationId)
        .eq("active", true);
      if (data.deviceId) deviceQuery = deviceQuery.eq("id", data.deviceId);
      const { data: devices, error } = await deviceQuery;
      if (error) throw error;
      const withSn = (devices ?? []).filter((d) => String(d.serial_number ?? "").trim());
      if (!withSn.length) {
        fetchSkippedReason = "no_serial";
      } else {
        const online = withSn.find((d) => isAdmsDeviceOnline(d.last_adms_at == null ? null : String(d.last_adms_at)));
        if (!online) {
          fetchSkippedReason = "device_offline";
        } else {
          const { from, to } = qatarRangeToFetchWindow(window.dateFrom, window.dateTo);
          const result = await queueAdmsAttlogQueryRange(
            supabaseAdmin,
            String(online.id),
            from,
            to,
            online.timezone ? String(online.timezone) : "Asia/Qatar",
          );
          fetchQueued = {
            cmdId: result.cmdId,
            from: result.from.toISOString(),
            to: result.to.toISOString(),
            deviceId: String(online.id),
          };
          try {
            await audit(context, "adms_resync_queued", "attendance_device", String(online.id), data.locationId, {
              mode: data.mode,
              dateFrom: window.dateFrom,
              dateTo: window.dateTo,
              cmdId: result.cmdId,
            });
          } catch (e) {
            console.warn("[attendance-hr] audit after adms_resync_queued failed", e instanceof Error ? e.message : e);
          }
        }
      }
    }

    let reprocessed = 0;
    if (data.reprocessStored) {
      const result = await recalculateAttendanceRange(
        context.supabase,
        data.locationId,
        window.dateFrom,
        window.dateTo,
      );
      reprocessed = result.processed;
    }

    try {
      await audit(context, "attendance_resync", "attendance_site", data.locationId, data.locationId, {
        mode: data.mode,
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
        reprocessStored: data.reprocessStored,
        fetchFromDevice: data.fetchFromDevice,
        reprocessed,
        fetchQueued,
        fetchSkippedReason,
      });
    } catch (e) {
      console.warn("[attendance-hr] audit after attendance_resync failed", e instanceof Error ? e.message : e);
    }

    return {
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      reprocessed,
      fetchQueued,
      fetchSkippedReason,
      /** FEC month uses 28→27 of the named calendar month. */
      monthConvention: "fec_28_27" as const,
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

/** Save per-site attendance break minutes (null clears override → UA 30 / else 60). */
export const saveAttendanceLocationBreak = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    breakMinutes: z.number().int().min(0).max(240).nullable(),
  }),
  async (data, context) => {
    await upsertAttendanceSiteShiftPolicy(context, {
      locationId: data.locationId,
      breakMinutes: data.breakMinutes,
    });
    return { ok: true as const };
  },
  { auth: { capability: "attendance.configure" } },
);

const siteShiftPolicySchema = z.object({
  locationId: z.string().uuid(),
  breakMinutes: z.number().int().min(0).max(240),
  reportingTimeMinutes: z.number().int().min(0).max(180),
  bufferMinutes: z.number().int().min(0).max(120),
  permanentHours: z.number().min(1).max(16),
  secondmentHours: z.number().min(1).max(16),
  jokerHours: z.number().min(1).max(16),
});

async function ensureE3CompanyId(context: AuthContext): Promise<string> {
  const { data: company, error: companyErr } = await context.supabase
    .from("hr_companies")
    .select("id")
    .eq("code", "E3")
    .eq("active", true)
    .maybeSingle();
  if (companyErr) throw companyErr;
  if (!company?.id) throw new Error("No active HR company (E3) to attach site settings");
  return company.id as string;
}

async function upsertAttendanceSiteShiftPolicy(
  context: AuthContext,
  data: {
    locationId: string;
    breakMinutes?: number | null;
    reportingTimeMinutes?: number | null;
    bufferMinutes?: number | null;
    permanentHours?: number | null;
    secondmentHours?: number | null;
    jokerHours?: number | null;
  },
) {
  await assertSite(context, data.locationId);

  const patch: Record<string, unknown> = {};
  if (data.breakMinutes !== undefined) patch.break_minutes = data.breakMinutes;
  if (data.reportingTimeMinutes !== undefined) patch.reporting_time_minutes = data.reportingTimeMinutes;
  if (data.bufferMinutes !== undefined) patch.buffer_minutes = data.bufferMinutes;
  if (data.permanentHours !== undefined) patch.permanent_hours = data.permanentHours;
  if (data.secondmentHours !== undefined) patch.secondment_hours = data.secondmentHours;
  if (data.jokerHours !== undefined) patch.joker_hours = data.jokerHours;

  const { data: existing, error: fetchErr } = await context.supabase
    .from("attendance_site_settings")
    .select("location_id, company_id")
    .eq("location_id", data.locationId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  if (existing) {
    const { error } = await context.supabase
      .from("attendance_site_settings")
      .update(patch)
      .eq("location_id", data.locationId);
    if (error) throw error;
    return;
  }

  const companyId = await ensureE3CompanyId(context);
  const { error } = await context.supabase.from("attendance_site_settings").insert({
    location_id: data.locationId,
    company_id: companyId,
    attendance_enabled: true,
    timezone: DEFAULT_RULES.timezone,
    ...patch,
  });
  if (error) throw error;
}

/** List locations with effective site shift policy (hours + break + reporting + buffer). */
export const listAttendanceSiteShiftPolicies = createAuthenticatedActionNoInput(
  async (context) => {
    const [{ data: locations, error: locErr }, { data: settings, error: setErr }] = await Promise.all([
      context.supabase
        .from("locations")
        .select("id, code, name, region, status")
        .in("code", [...CANONICAL_LOCATION_CODES])
        .order("name"),
      context.supabase
        .from("attendance_site_settings")
        .select(
          "location_id, break_minutes, reporting_time_minutes, buffer_minutes, permanent_hours, secondment_hours, joker_hours",
        ),
    ]);
    if (locErr) throw locErr;
    if (setErr) throw setErr;

    const byId = new Map(
      (settings ?? []).map((row) => [
        row.location_id as string,
        row as {
          location_id: string;
          break_minutes?: number | null;
          reporting_time_minutes?: number | null;
          buffer_minutes?: number | null;
          permanent_hours?: number | null;
          secondment_hours?: number | null;
          joker_hours?: number | null;
        },
      ]),
    );

    return {
      sites: (locations ?? []).map((loc) => {
        const stored = byId.get(loc.id);
        const defaults = defaultSiteShiftPolicy(loc.code);
        return {
          locationId: loc.id,
          code: loc.code,
          name: loc.name,
          region: loc.region,
          status: loc.status,
          breakMinutes:
            stored?.break_minutes != null ? Number(stored.break_minutes) : defaults.breakMinutes,
          reportingTimeMinutes:
            stored?.reporting_time_minutes != null
              ? Number(stored.reporting_time_minutes)
              : defaults.reportingTimeMinutes,
          bufferMinutes:
            stored?.buffer_minutes != null ? Number(stored.buffer_minutes) : defaults.bufferMinutes,
          permanentHours:
            stored?.permanent_hours != null ? Number(stored.permanent_hours) : defaults.permanentHours,
          secondmentHours:
            stored?.secondment_hours != null
              ? Number(stored.secondment_hours)
              : defaults.secondmentHours,
          jokerHours:
            stored?.joker_hours != null ? Number(stored.joker_hours) : defaults.jokerHours,
          hasCustomBreak: stored?.break_minutes != null,
          hasCustomReporting: stored?.reporting_time_minutes != null,
          hasCustomBuffer: stored?.buffer_minutes != null,
          hasCustomHours:
            stored?.permanent_hours != null ||
            stored?.secondment_hours != null ||
            stored?.joker_hours != null,
        };
      }),
    };
  },
  { auth: { capability: "hr.manage" } },
);

/** Save permanent / secondment / joker hours + break + reporting + buffer for one location. */
export const saveAttendanceSiteShiftPolicy = createAuthenticatedAction(
  siteShiftPolicySchema,
  async (data, context) => {
    await upsertAttendanceSiteShiftPolicy(context, {
      locationId: data.locationId,
      breakMinutes: data.breakMinutes,
      reportingTimeMinutes: data.reportingTimeMinutes,
      bufferMinutes: data.bufferMinutes,
      permanentHours: data.permanentHours,
      secondmentHours: data.secondmentHours,
      jokerHours: data.jokerHours,
    });
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

/**
 * Copy the given site policy (from the currently selected location / form) onto every
 * canonical location — not built-in 9/10/10 defaults.
 */
export const applyDefaultAttendanceSiteShiftPolicies = createAuthenticatedAction(
  siteShiftPolicySchema.omit({ locationId: true }).extend({
    sourceLocationId: z.string().uuid(),
  }),
  async (data, context) => {
    const { data: locations, error } = await context.supabase
      .from("locations")
      .select("id, code")
      .in("code", [...CANONICAL_LOCATION_CODES]);
    if (error) throw error;

    let updated = 0;
    for (const loc of locations ?? []) {
      await upsertAttendanceSiteShiftPolicy(context, {
        locationId: loc.id,
        breakMinutes: data.breakMinutes,
        reportingTimeMinutes: data.reportingTimeMinutes,
        bufferMinutes: data.bufferMinutes,
        permanentHours: data.permanentHours,
        secondmentHours: data.secondmentHours,
        jokerHours: data.jokerHours,
      });
      updated += 1;
    }
    return { ok: true as const, updated, sourceLocationId: data.sourceLocationId };
  },
  { auth: { capability: "hr.manage" } },
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

type StaffLookup = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  qid: string | null;
  employment_type: string | null;
  department?: string | null;
  job_title?: string | null;
  status?: string | null;
  is_roaming?: boolean | null;
  flexible_attendance?: boolean | null;
  reporting_time_minutes?: number | null;
  buffer_minutes?: number | null;
  expected_hours?: number | null;
  break_minutes?: number | null;
  weekly_off_weekday?: number | null;
};
type LocationLookup = {
  id: string;
  code: string;
  name: string | null;
  region: string | null;
  break_minutes?: number | null;
};

async function enrichAttendanceHrDailyRows(
  context: AuthContext,
  rows: Array<Record<string, unknown>>,
): Promise<AttendanceHrReportRow[]> {
  const staffIds = [...new Set(rows.map((row) => row.staff_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const locationIds = [...new Set(rows.map((row) => row.location_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const workDates = [
    ...new Set(
      rows
        .map((row) => String(row.work_date ?? "").slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ];
  const dateFrom = workDates.length ? workDates.reduce((a, b) => (a < b ? a : b)) : null;
  const dateTo = workDates.length ? workDates.reduce((a, b) => (a > b ? a : b)) : null;

  const bioUserIds = [
    ...new Set(
      rows
        .map((row) => (row.biometric_user_id == null ? "" : String(row.biometric_user_id).trim()))
        .filter(Boolean),
    ),
  ];

  const [staffRows, locationRows, siteSettings, rosterRes, shiftRes, bioRes, workByStaffId] = await Promise.all([
    loadByIds<StaffLookup>(
      context,
      "staff",
      "id, full_name, employee_code, qid, employment_type, department, job_title, status, is_roaming, flexible_attendance, reporting_time_minutes, buffer_minutes, expected_hours, break_minutes, weekly_off_weekday",
      staffIds,
    ),
    loadByIds<LocationLookup>(context, "locations", "id, code, name, region", locationIds),
    locationIds.length
      ? context.supabase
          .from("attendance_site_settings")
          .select(
            "location_id, break_minutes, reporting_time_minutes, buffer_minutes, permanent_hours, secondment_hours, joker_hours",
          )
          .in("location_id", locationIds)
      : Promise.resolve({
          data: [] as Array<{
            location_id: string;
            break_minutes: number | null;
            reporting_time_minutes?: number | null;
            buffer_minutes?: number | null;
            permanent_hours?: number | null;
            secondment_hours?: number | null;
            joker_hours?: number | null;
          }>,
        }),
    staffIds.length && dateFrom && dateTo
      ? (async () => {
          const rosterRows: Array<Record<string, unknown>> = [];
          for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
            const { data: page, error } = await context.supabase
              .from("attendance_roster_assignments")
              .select("staff_id, location_id, work_date, shift_template_id, shift_start, shift_end, is_week_off")
              .in("staff_id", staffIds)
              .gte("work_date", dateFrom)
              .lte("work_date", dateTo)
              .order("id", { ascending: true })
              .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
            if (error) throw error;
            rosterRows.push(...((page ?? []) as Array<Record<string, unknown>>));
            if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
          }
          return { data: rosterRows };
        })()
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    context.supabase
      .from("attendance_shift_templates")
      .select("id, start_time, end_time")
      .eq("active", true)
      .limit(5000),
    // Scope bios to staff / user ids on the page — never all users at every listed site.
    staffIds.length || bioUserIds.length
      ? (async () => {
          const out: Array<Record<string, unknown>> = [];
          const seen = new Set<string>();
          const push = (raw: Record<string, unknown> | null | undefined) => {
            if (!raw?.id) return;
            const id = String(raw.id);
            if (seen.has(id)) return;
            seen.add(id);
            out.push(raw);
          };
          if (staffIds.length) {
            for (let i = 0; i < staffIds.length; i += 200) {
              const chunk = staffIds.slice(i, i + 200);
              const { data, error } = await context.supabase
                .from("attendance_biometric_users")
                .select("id, location_id, device_id, biometric_user_id, device_name, full_name")
                .in("staff_id", chunk)
                .limit(5000);
              if (error) throw error;
              for (const row of data ?? []) push(row as Record<string, unknown>);
            }
          }
          if (bioUserIds.length && locationIds.length) {
            for (let i = 0; i < bioUserIds.length; i += 100) {
              const chunk = bioUserIds.slice(i, i + 100);
              const { data, error } = await context.supabase
                .from("attendance_biometric_users")
                .select("id, location_id, device_id, biometric_user_id, device_name, full_name")
                .in("location_id", locationIds)
                .in("biometric_user_id", chunk)
                .limit(5000);
              if (error) throw error;
              for (const row of data ?? []) push(row as Record<string, unknown>);
            }
          }
          return { data: out };
        })()
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    fetchWorkLocationsByStaffId(context.supabase, staffIds),
  ]);

  const staffById = new Map(staffRows.map((row) => [row.id, row]));
  // Hide left staff from listing + KPIs/export (same gate as dashboard roster).
  const listingRows = rows.filter((row) => {
    const id = typeof row.staff_id === "string" ? row.staff_id : null;
    return attendanceHrIncludesStaffInListing(id, id ? staffById.get(id)?.status : null);
  });
  const locationById = new Map(locationRows.map((row) => [row.id, row]));
  type BioLookup = {
    id: string;
    location_id: string;
    device_id: string | null;
    biometric_user_id: string;
    device_name: string | null;
    full_name: string | null;
  };
  const bioByDeviceKey = new Map<string, BioLookup>();
  const bioByLocUser = new Map<string, BioLookup>();
  for (const raw of bioRes.data ?? []) {
    const bio: BioLookup = {
      id: String(raw.id),
      location_id: String(raw.location_id ?? ""),
      device_id: raw.device_id == null ? null : String(raw.device_id),
      biometric_user_id: String(raw.biometric_user_id ?? ""),
      device_name: raw.device_name == null ? null : String(raw.device_name),
      full_name: raw.full_name == null ? null : String(raw.full_name),
    };
    if (!bio.location_id || !bio.biometric_user_id) continue;
    const locUser = `${bio.location_id}|${bio.biometric_user_id}`;
    if (!bioByLocUser.has(locUser)) bioByLocUser.set(locUser, bio);
    if (bio.device_id) bioByDeviceKey.set(`${locUser}|${bio.device_id}`, bio);
  }
  type SiteHoursRow = {
    location_id: string;
    break_minutes?: number | null;
    reporting_time_minutes?: number | null;
    buffer_minutes?: number | null;
    permanent_hours?: number | null;
    secondment_hours?: number | null;
    joker_hours?: number | null;
  };
  const siteByLocationId = new Map(
    (siteSettings.data ?? []).map((row) => [row.location_id as string, row as SiteHoursRow]),
  );
  const shiftStartById = new Map(
    (shiftRes.data ?? []).map((row) => [
      String(row.id),
      {
        start: normalizeShiftHm(row.start_time == null ? null : String(row.start_time)),
        end: normalizeShiftHm(row.end_time == null ? null : String(row.end_time)),
      },
    ]),
  );
  const rosterByStaffLocationDate = new Map<string, RosterShiftLookup>();
  const rosterByStaffDate = new Map<string, RosterShiftLookup>();
  /** staffId|workDate → week-off on any site (status override; times may linger on the row). */
  const weekOffByStaffDate = new Set<string>();
  /** Latest working-day row with usable times per staff (duty-only days fall back to this). */
  const fallbackByStaffId = new Map<string, RosterShiftLookup>();
  const fallbackWorkDateByStaffId = new Map<string, string>();
  for (const row of rosterRes.data ?? []) {
    const staffId = String(row.staff_id ?? "");
    const locationId = String(row.location_id ?? "");
    const workDate = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !workDate) continue;
    const lookup: RosterShiftLookup = {
      shift_template_id: (row.shift_template_id as string | null) ?? null,
      shift_start: (row.shift_start as string | null) ?? null,
      shift_end: (row.shift_end as string | null) ?? null,
      is_week_off: Boolean(row.is_week_off),
    };
    if (lookup.is_week_off) weekOffByStaffDate.add(`${staffId}|${workDate}`);
    if (locationId) rosterByStaffLocationDate.set(`${staffId}|${locationId}|${workDate}`, lookup);
    // Prefer a row that already has usable shift times when multiple locations exist.
    // Never let an on-duty sibling overwrite a week-off day for status resolution.
    const dateKey = `${staffId}|${workDate}`;
    const prev = rosterByStaffDate.get(dateKey);
    const hasTimes = Boolean(
      normalizeShiftHm(lookup.shift_start) || lookup.shift_template_id,
    );
    const prevHasTimes = Boolean(
      prev && (normalizeShiftHm(prev.shift_start) || prev.shift_template_id),
    );
    if (!prev) {
      rosterByStaffDate.set(dateKey, lookup);
    } else if (lookup.is_week_off && !prev.is_week_off) {
      rosterByStaffDate.set(dateKey, lookup);
    } else if (!lookup.is_week_off && !prev.is_week_off && hasTimes && !prevHasTimes) {
      rosterByStaffDate.set(dateKey, lookup);
    }
    if (!lookup.is_week_off && hasTimes) {
      const prevFbDate = fallbackWorkDateByStaffId.get(staffId);
      if (!prevFbDate || workDate >= prevFbDate) {
        fallbackByStaffId.set(staffId, lookup);
        fallbackWorkDateByStaffId.set(staffId, workDate);
      }
    }
  }

  const enriched: AttendanceHrReportRow[] = listingRows.map((row) => {
    const staff = typeof row.staff_id === "string" ? staffById.get(row.staff_id) : undefined;
    const location = typeof row.location_id === "string" ? locationById.get(row.location_id) : undefined;
    const locationId = typeof row.location_id === "string" ? row.location_id : "";
    const site = locationId ? siteByLocationId.get(locationId) : undefined;
    const permanentHours = site?.permanent_hours != null ? Number(site.permanent_hours) : null;
    const secondmentHours = site?.secondment_hours != null ? Number(site.secondment_hours) : null;
    const jokerHours = site?.joker_hours != null ? Number(site.joker_hours) : null;
    const employmentType = staff?.employment_type ?? null;
    const staffExpectedHours =
      staff?.expected_hours != null && Number.isFinite(Number(staff.expected_hours))
        ? Number(staff.expected_hours)
        : null;
    const expectedMinutes =
      staffExpectedHours != null && staffExpectedHours >= 1 && staffExpectedHours <= 16
        ? Math.round(staffExpectedHours * 60)
        : expectedShiftMinutes(normalizeAttendanceEmploymentRole(employmentType), {
            permanentHours,
            secondmentHours,
            jokerHours,
          });
    const workDate = String(row.work_date ?? "").slice(0, 10);
    const staffId = typeof row.staff_id === "string" ? row.staff_id : null;
    // Only roster-derived times — never stored scheduled_in (often stale DEFAULT 08:00).
    let { scheduledIn, scheduledOut } = resolveRosterScheduledBounds({
      staffId,
      locationId,
      workDate,
      rosterByStaffLocationDate,
      rosterByStaffDate,
      shiftStartByTemplateId: shiftStartById,
      fallbackByStaffId,
    });
    // Flexible staff: shift times stay from roster above; only reporting/buffer override below.
    const actualIn = row.actual_in == null ? null : String(row.actual_in);
    const { reportingTimeMinutes: reportingMins, bufferMinutes: bufferMins } = resolveReportingAndBuffer({
      siteReporting: site?.reporting_time_minutes != null ? Number(site.reporting_time_minutes) : null,
      siteBuffer: site?.buffer_minutes != null ? Number(site.buffer_minutes) : null,
      staff: staff
        ? {
            flexibleAttendance: Boolean(staff.flexible_attendance),
            reportingTimeMinutes: staff.reporting_time_minutes ?? null,
            bufferMinutes: staff.buffer_minutes ?? null,
          }
        : null,
    });
    const isFlexible = Boolean(staff?.flexible_attendance);
    const crossSiteDayMerge = staffUsesCrossSiteDayMerge({
      flexibleAttendance: staff?.flexible_attendance,
      isRoaming: staff?.is_roaming,
      workLocationCount: staffId ? (workByStaffId.get(staffId)?.length ?? 0) : 0,
    });
    const rosterAtLocation = locationId
      ? rosterByStaffLocationDate.get(`${staffId}|${locationId}|${workDate}`)
      : undefined;
    const rosterAny = staffId ? rosterByStaffDate.get(`${staffId}|${workDate}`) : undefined;
    const hasRosterRow =
      Boolean(staffId && weekOffByStaffDate.has(`${staffId}|${workDate}`)) ||
      Boolean(rosterAtLocation) ||
      Boolean(rosterAny);
    const rosterWeekOffFlag =
      Boolean(staffId && weekOffByStaffDate.has(`${staffId}|${workDate}`)) ||
      Boolean(rosterAtLocation?.is_week_off) ||
      Boolean(rosterAny?.is_week_off);
    const rosterWeekOff = resolveWeekOff({
      hasRosterRow,
      rosterIsWeekOff: rosterWeekOffFlag,
      workDate,
      weeklyOffWeekday: staff?.weekly_off_weekday ?? null,
    });
    if (rosterWeekOff) {
      scheduledIn = null;
      scheduledOut = null;
    }
    const lateMinutes = resolveListingLateMinutes({
      actualIn,
      rosterScheduledIn: scheduledIn,
      reportingTimeMinutes: reportingMins,
      bufferMinutes: bufferMins,
      lateFromShiftStart: isFlexible,
    });
    const actualOut = row.actual_out == null ? null : String(row.actual_out);
    let status = applyRosterDayStatusOverride({
      status: String(row.status ?? ""),
      isWeekOff: rosterWeekOff,
      leaveType: null,
    });
    let missedPunch = Boolean(row.missed_punch);
    if (status === "weekly_off") {
      missedPunch = false;
    } else if (isFlexible) {
      const missed = Boolean(actualIn) !== Boolean(actualOut);
      missedPunch = missed;
      if (missed) status = "missed_punch";
      else if (actualIn && actualOut) {
        status = resolveHoursBasedAttendanceStatus({
          status,
          missed_punch: false,
          actual_in: actualIn,
          actual_out: actualOut,
          worked_minutes: row.worked_minutes == null ? null : Number(row.worked_minutes),
          late_minutes: lateMinutes,
          expected_minutes: expectedMinutes,
          employment_type: employmentType,
          flexible_attendance: true,
          sitePolicy: { permanentHours, secondmentHours, jokerHours },
        });
      }
    }
    const biometricUserId = row.biometric_user_id == null ? null : String(row.biometric_user_id);
    const deviceId = row.device_id == null ? null : String(row.device_id);
    const bio =
      locationId && biometricUserId
        ? (deviceId ? bioByDeviceKey.get(`${locationId}|${biometricUserId}|${deviceId}`) : undefined) ??
          bioByLocUser.get(`${locationId}|${biometricUserId}`)
        : undefined;
    const deviceName = bio?.device_name?.trim() || bio?.full_name?.trim() || null;
    return {
      id: String(row.id),
      location_id: String(row.location_id ?? ""),
      staff_id: staffId,
      biometric_user_id: biometricUserId,
      device_id: deviceId,
      work_date: String(row.work_date ?? ""),
      status,
      actual_in: actualIn,
      actual_out: actualOut,
      scheduled_in: scheduledIn,
      scheduled_out: scheduledOut,
      late_minutes: lateMinutes,
      early_leave_minutes: Number(row.early_leave_minutes ?? 0),
      overtime_minutes: Number(row.overtime_minutes ?? 0),
      missed_punch: missedPunch,
      punch_count: Number(row.punch_count ?? 0),
      worked_minutes: row.worked_minutes == null ? null : Number(row.worked_minutes),
      employment_type: employmentType,
      staff_name: staff?.full_name?.trim() || null,
      department: staff?.department?.trim() || null,
      job_title: staff?.job_title?.trim() || null,
      device_name: deviceName,
      biometric_mapping_id: bio?.id ?? null,
      employee_code: staff?.employee_code ?? null,
      qid: staff?.qid ?? null,
      location_code: location?.code ?? null,
      location_name: location?.name ?? null,
      location_region: location?.region ?? null,
      location_break_minutes:
        staff?.break_minutes != null && Number.isFinite(Number(staff.break_minutes))
          ? Number(staff.break_minutes)
          : (site?.break_minutes ?? null),
      location_reporting_time_minutes: reportingMins,
      location_buffer_minutes: bufferMins,
      expected_minutes: expectedMinutes,
      permanent_hours: permanentHours,
      secondment_hours: secondmentHours,
      joker_hours: jokerHours,
      flexible_attendance: Boolean(staff?.flexible_attendance),
      cross_site_day_merge: crossSiteDayMerge,
    };
  });

  const crossSiteIds = [
    ...new Set(
      enriched
        .filter((row) => row.cross_site_day_merge && row.staff_id)
        .map((row) => row.staff_id as string),
    ),
  ];
  if (crossSiteIds.length === 0 || !dateFrom || !dateTo) {
    return collapseFlexibleAttendanceReportRows(enriched);
  }

  const punchesByStaffDay = new Map<string, FlexibleCrossSitePunch[]>();
  const punchLocationIds = new Set<string>();
  const seenPunchKeys = new Set<string>();

  const addPunch = (
    staffId: string,
    day: string,
    locationId: string,
    punchAt: string,
    biometricUserId: string | null,
    probableDuplicate: boolean,
    excludedFromCalc: boolean,
    punchId: string | null,
  ) => {
    if (!staffId || !day || !locationId || !punchAt) return;
    const dedupe = punchId || `${locationId}|${biometricUserId ?? ""}|${punchAt}`;
    const seenKey = `${staffId}|${day}|${dedupe}`;
    if (seenPunchKeys.has(seenKey)) return;
    seenPunchKeys.add(seenKey);
    punchLocationIds.add(locationId);
    const key = `${staffId}|${day}`;
    const list = punchesByStaffDay.get(key) ?? [];
    list.push({
      locationId,
      punchAt,
      biometricUserId,
      probableDuplicate,
      excludedFromCalc,
    });
    punchesByStaffDay.set(key, list);
  };

  // Map every biometric identity for flexible / multisite staff so logs with null staff_id still merge.
  // Also include unmapped registry rows that share the same device_name (UA-DM 35 + INF-CC 24).
  const staffByLocUser = new Map<string, string>();
  const bioPairs: Array<{ locationId: string; biometricUserId: string }> = [];
  const mappedBios: Array<{
    staffId: string | null;
    locationId: string;
    biometricUserId: string;
    deviceName?: string | null;
  }> = [];
  const deviceNames = new Set<string>();

  for (let i = 0; i < crossSiteIds.length; i += 200) {
    const chunk = crossSiteIds.slice(i, i + 200);
    const { data: maps, error: mapErr } = await context.supabase
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
      const trimmedName = deviceName?.trim();
      if (trimmedName) deviceNames.add(trimmedName);
    }
  }

  const catalog = [...mappedBios];
  if (deviceNames.size) {
    const nameFilter = [...deviceNames]
      .map((name) => `device_name.ilike.${name.replace(/[,()%]/g, "")}`)
      .filter((part) => part.length > "device_name.ilike.".length)
      .join(",");
    if (nameFilter) {
      const { data: aliasRows, error: aliasErr } = await context.supabase
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

  for (const pair of expandFlexibleBiometricPairsByDeviceName(mappedBios, catalog)) {
    staffByLocUser.set(`${pair.locationId}|${pair.biometricUserId}`, pair.staffId);
    bioPairs.push({ locationId: pair.locationId, biometricUserId: pair.biometricUserId });
  }

  const punchDay = (attendanceDate: unknown, punchAt: unknown): string => {
    const dated = String(attendanceDate ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dated)) return dated;
    return deviceLogQatarYmd(punchAt == null ? null : String(punchAt));
  };

  for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
    const { data: page, error: punchErr } = await context.supabase
      .from("attendance_logs")
      .select(
        "id, staff_id, location_id, biometric_user_id, punch_at, attendance_date, probable_duplicate, excluded_from_calc",
      )
      .in("staff_id", crossSiteIds)
      .gte("attendance_date", dateFrom)
      .lte("attendance_date", dateTo)
      .order("punch_at", { ascending: true })
      .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
    if (punchErr) throw punchErr;
    for (const log of page ?? []) {
      addPunch(
        log.staff_id ? String(log.staff_id) : "",
        punchDay(log.attendance_date, log.punch_at),
        String(log.location_id ?? ""),
        String(log.punch_at ?? ""),
        log.biometric_user_id == null ? null : String(log.biometric_user_id),
        Boolean(log.probable_duplicate),
        Boolean(log.excluded_from_calc),
        log.id ? String(log.id) : null,
      );
    }
    if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
  }

  // Also pull punches for mapped + same-device-name biometrics when log.staff_id was never backfilled.
  for (let i = 0; i < bioPairs.length; i += 40) {
    const chunk = bioPairs.slice(i, i + 40);
    const pairFilter = deviceLogUserPairsOrFilter(chunk);
    if (!pairFilter) continue;
    for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
      const { data: page, error: punchErr } = await context.supabase
        .from("attendance_logs")
        .select(
          "id, staff_id, location_id, biometric_user_id, punch_at, attendance_date, probable_duplicate, excluded_from_calc",
        )
        .or(pairFilter)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .order("punch_at", { ascending: true })
        .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
      if (punchErr) throw punchErr;
      for (const log of page ?? []) {
        const locationId = String(log.location_id ?? "");
        const biometricUserId =
          log.biometric_user_id == null ? null : String(log.biometric_user_id);
        const staffId =
          (log.staff_id ? String(log.staff_id) : "") ||
          (biometricUserId
            ? staffByLocUser.get(`${locationId}|${biometricUserId.trim()}`) ?? ""
            : "");
        addPunch(
          staffId,
          punchDay(log.attendance_date, log.punch_at),
          locationId,
          String(log.punch_at ?? ""),
          biometricUserId,
          Boolean(log.probable_duplicate),
          Boolean(log.excluded_from_calc),
          log.id ? String(log.id) : null,
        );
      }
      if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
    }
  }

  // Last resort: punches whose device_user_name matches a flexible staff device_name, even when
  // the biometric id was never written to attendance_biometric_users (common for secondary sites).
  // Skip when staff_id / bio-pair passes already covered every cross-site person-day on the page.
  const staffByDeviceName = new Map<string, string>();
  for (const row of mappedBios) {
    const staffId = row.staffId?.trim();
    const name = (row.deviceName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!staffId || !name || staffByDeviceName.has(name)) continue;
    staffByDeviceName.set(name, staffId);
  }
  const needsDeviceNameScan =
    staffByDeviceName.size > 0 &&
    deviceNames.size > 0 &&
    enriched.some((row) => {
      if (!row.cross_site_day_merge || !row.staff_id) return false;
      const key = `${row.staff_id}|${String(row.work_date).slice(0, 10)}`;
      return !(punchesByStaffDay.get(key)?.length);
    });
  if (needsDeviceNameScan) {
    const nameFilter = [...deviceNames]
      .map((name) => `device_user_name.ilike.${name.replace(/[,()%]/g, "")}`)
      .filter((part) => part.length > "device_user_name.ilike.".length)
      .join(",");
    if (nameFilter) {
      for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
        const { data: page, error: punchErr } = await context.supabase
          .from("attendance_logs")
          .select(
            "id, staff_id, location_id, biometric_user_id, device_user_name, punch_at, attendance_date, probable_duplicate, excluded_from_calc",
          )
          .or(nameFilter)
          .gte("attendance_date", dateFrom)
          .lte("attendance_date", dateTo)
          .order("punch_at", { ascending: true })
          .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
        if (punchErr) throw punchErr;
        for (const log of page ?? []) {
          const locationId = String(log.location_id ?? "");
          const biometricUserId =
            log.biometric_user_id == null ? null : String(log.biometric_user_id);
          const punchName = String(
            (log as { device_user_name?: string | null }).device_user_name ?? "",
          )
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
          const staffId =
            (log.staff_id ? String(log.staff_id) : "") ||
            (biometricUserId
              ? staffByLocUser.get(`${locationId}|${biometricUserId.trim()}`) ?? ""
              : "") ||
            (punchName ? staffByDeviceName.get(punchName) ?? "" : "");
          if (!staffId || !crossSiteIds.includes(staffId)) continue;
          addPunch(
            staffId,
            punchDay(log.attendance_date, log.punch_at),
            locationId,
            String(log.punch_at ?? ""),
            biometricUserId,
            Boolean(log.probable_duplicate),
            Boolean(log.excluded_from_calc),
            log.id ? String(log.id) : null,
          );
        }
        if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
      }
    }
  }

  const missingLocIds = [...punchLocationIds].filter((id) => !locationById.has(id));
  if (missingLocIds.length) {
    const extraLocs = await loadByIds<LocationLookup>(
      context,
      "locations",
      "id, code, name, region",
      missingLocIds,
    );
    for (const loc of extraLocs) locationById.set(loc.id, loc);
  }

  const withSites = enriched.map((row) => {
    if (!row.cross_site_day_merge || !row.staff_id) return row;
    const key = `${row.staff_id}|${String(row.work_date).slice(0, 10)}`;
    const punches = punchesByStaffDay.get(key) ?? [];
    const { checkInLocationId, checkOutLocationId } = flexibleDayFirstLastLocationIds(punches);
    const { firstPunchAt, lastPunchAt, usableCount } = flexibleDayFirstLastPunchAt(punches);
    const { checkInBiometricUserId, checkOutBiometricUserId } =
      flexibleDayFirstLastBiometricUserIds(punches);
    const inLoc = checkInLocationId ? locationById.get(checkInLocationId) : undefined;
    const outLoc = checkOutLocationId ? locationById.get(checkOutLocationId) : undefined;
    const inLabel = inLoc
      ? formatLocationLabel(inLoc.code, formatLocationName(inLoc.name, inLoc.region) || inLoc.name)
      : null;
    const outLabel = outLoc
      ? formatLocationLabel(outLoc.code, formatLocationName(outLoc.name, outLoc.region) || outLoc.name)
      : null;
    const siteFields = {
      check_in_location_id: checkInLocationId,
      check_out_location_id: checkOutLocationId,
      check_in_location_code: inLoc?.code ?? null,
      check_out_location_code: outLoc?.code ?? null,
      check_in_location_label: inLabel,
      check_out_location_label: outLabel,
      check_in_biometric_user_id: checkInBiometricUserId,
      check_out_biometric_user_id: checkOutBiometricUserId,
      biometric_user_id:
        checkInBiometricUserId ?? checkOutBiometricUserId ?? row.biometric_user_id,
    };
    // Device punches for the same attendance_date win over stale daily_summary in/out.
    if (usableCount > 0) {
      const actualIn = firstPunchAt;
      const actualOut = lastPunchAt;
      let workedMinutes: number | null = null;
      if (actualIn && actualOut) {
        const mins = Math.round(
          (new Date(actualOut).getTime() - new Date(actualIn).getTime()) / 60_000,
        );
        workedMinutes = Number.isFinite(mins) && mins >= 0 ? mins : null;
      } else {
        workedMinutes = 0;
      }
      const lateMinutes = resolveListingLateMinutes({
        actualIn,
        rosterScheduledIn: row.scheduled_in,
        reportingTimeMinutes: row.location_reporting_time_minutes,
        bufferMinutes: row.location_buffer_minutes,
        lateFromShiftStart: Boolean(row.flexible_attendance),
      });
      const missed = usableCount === 1 || Boolean(actualIn) !== Boolean(actualOut);
      let status = row.status;
      // Roster week-off / leave already applied above — do not clobber with punch heuristics.
      if (
        status !== "weekly_off" &&
        status !== "annual_leave" &&
        status !== "sick_leave" &&
        status !== "unpaid_leave" &&
        status !== "public_holiday"
      ) {
        if (missed) status = "missed_punch";
        else if (actualIn && actualOut) {
          status = resolveHoursBasedAttendanceStatus({
            status: row.status,
            missed_punch: false,
            actual_in: actualIn,
            actual_out: actualOut,
            worked_minutes: workedMinutes,
            late_minutes: lateMinutes,
            expected_minutes: row.expected_minutes,
            employment_type: row.employment_type,
            flexible_attendance: row.flexible_attendance,
            sitePolicy: {
              permanentHours: row.permanent_hours,
              secondmentHours: row.secondment_hours,
              jokerHours: row.joker_hours,
            },
          });
        }
      }
      return {
        ...row,
        status,
        actual_in: actualIn,
        actual_out: actualOut,
        worked_minutes: workedMinutes,
        punch_count: usableCount,
        missed_punch: status === "weekly_off" ? false : missed,
        late_minutes: status === "weekly_off" ? 0 : lateMinutes,
        ...siteFields,
      };
    }
    return {
      ...row,
      ...siteFields,
    };
  });

  return collapseFlexibleAttendanceReportRows(withSites);
}

/** Roster + mapped punch days for listing gap fill (summary-only days otherwise vanish). */
async function loadListingGapRosterAndPunchDays(
  context: AuthContext,
  opts: {
    staffIds: string[] | null;
    locationId: string | null;
    dateFrom: string;
    dateTo: string;
  },
): Promise<{ roster: ListingGapRosterDay[]; punchDays: ListingGapPunchDay[] }> {
  const { staffIds, locationId, dateFrom, dateTo } = opts;
  // Need a staff scope or a site — never scan every roster/punch globally.
  if ((!staffIds || staffIds.length === 0) && !locationId) {
    return { roster: [], punchDays: [] };
  }

  const loadRoster = async (): Promise<ListingGapRosterDay[]> => {
    const roster: ListingGapRosterDay[] = [];
    for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
      let q = context.supabase
        .from("attendance_roster_assignments")
        .select("staff_id, location_id, work_date, is_week_off")
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .order("id", { ascending: true })
        .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
      if (staffIds?.length) q = q.in("staff_id", staffIds);
      else if (locationId) q = q.eq("location_id", locationId);
      const { data: page, error } = await q;
      if (error) throw error;
      for (const row of page ?? []) {
        const staffId = String(row.staff_id ?? "");
        const loc = String(row.location_id ?? "");
        const day = String(row.work_date ?? "").slice(0, 10);
        if (!staffId || !loc || !day) continue;
        roster.push({
          staff_id: staffId,
          location_id: loc,
          work_date: day,
          is_week_off: Boolean(row.is_week_off),
        });
      }
      if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
    }
    return roster;
  };

  const loadPunchDays = async (): Promise<ListingGapPunchDay[]> => {
    const punchSeen = new Set<string>();
    const punchDays: ListingGapPunchDay[] = [];
    for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
      let q = context.supabase
        .from("attendance_logs")
        .select("staff_id, location_id, attendance_date")
        .not("staff_id", "is", null)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .order("id", { ascending: true })
        .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
      if (staffIds?.length) q = q.in("staff_id", staffIds);
      else if (locationId) q = q.eq("location_id", locationId);
      const { data: page, error } = await q;
      if (error) throw error;
      for (const row of page ?? []) {
        const staffId = String(row.staff_id ?? "");
        const loc = String(row.location_id ?? "");
        const day = String(row.attendance_date ?? "").slice(0, 10);
        if (!staffId || !loc || !day) continue;
        const key = `${staffId}|${loc}|${day}`;
        if (punchSeen.has(key)) continue;
        punchSeen.add(key);
        punchDays.push({ staff_id: staffId, location_id: loc, work_date: day });
      }
      if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
    }
    return punchDays;
  };

  const [roster, punchDays] = await Promise.all([loadRoster(), loadPunchDays()]);
  return { roster, punchDays };
}

/** Flexible / multisite staff who punched at `locationId` in range → staffId → attendance dates. */
async function flexibleStaffPunchDaysAtLocation(
  context: AuthContext,
  locationId: string,
  dateFrom: string,
  dateTo: string,
  staffIds: string[] | null,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  let staffQ = context.supabase
    .from("staff")
    .select("id, is_roaming, flexible_attendance")
    .is("deleted_at", null)
    .limit(5000);
  if (staffIds?.length) {
    staffQ = staffQ.in("id", staffIds);
  } else {
    // Site chip with no staff filter: only candidates that can merge across sites.
    staffQ = staffQ.or("flexible_attendance.eq.true,is_roaming.eq.true");
  }
  const { data: staffRows, error: staffErr } = await staffQ;
  if (staffErr) throw staffErr;
  const candidateIds = (staffRows ?? []).map((row) => String(row.id)).filter(Boolean);
  if (!candidateIds.length) return out;
  const workByStaff = await fetchWorkLocationsByStaffId(context.supabase, candidateIds);
  const flexIds = (staffRows ?? [])
    .map((row) => {
      const id = String(row.id);
      return staffUsesCrossSiteDayMerge({
        flexibleAttendance: (row as { flexible_attendance?: boolean | null }).flexible_attendance,
        isRoaming: (row as { is_roaming?: boolean | null }).is_roaming,
        workLocationCount: workByStaff.get(id)?.length ?? 0,
      })
        ? id
        : null;
    })
    .filter((id): id is string => Boolean(id));
  if (!flexIds.length) return out;

  for (let i = 0; i < flexIds.length; i += 200) {
    const chunk = flexIds.slice(i, i + 200);
    for (let from = 0; ; from += ATTENDANCE_DAILY_LIST_PAGE_SIZE) {
      const { data: page, error } = await context.supabase
        .from("attendance_logs")
        .select("staff_id, attendance_date")
        .eq("location_id", locationId)
        .in("staff_id", chunk)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .range(from, from + ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1);
      if (error) throw error;
      for (const log of page ?? []) {
        const staffId = log.staff_id ? String(log.staff_id) : "";
        const day = String(log.attendance_date ?? "").slice(0, 10);
        if (!staffId || !day) continue;
        const set = out.get(staffId) ?? new Set<string>();
        set.add(day);
        out.set(staffId, set);
      }
      if (!page || page.length < ATTENDANCE_DAILY_LIST_PAGE_SIZE) break;
    }
  }
  return out;
}

async function matchingStaffIds(context: AuthContext, needle: string): Promise<string[]> {
  const safe = needle.replace(/[%_,()"]/g, "").trim();
  if (!safe) return [];
  const pattern = `%${safe}%`;
  // DB prefilter — was loading up to 2000 staff and filtering in JS every keystroke.
  // Quote patterns so spaces in names don't break PostgREST `.or()` parsing.
  const { data, error } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, qid")
    .in("status", ["active", "on_leave", "serving_notice"])
    .or(`full_name.ilike."${pattern}",employee_code.ilike."${pattern}",qid.ilike."${pattern}"`)
    .limit(500);
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
  table: "staff" | "locations" | "attendance_devices",
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

const DEVICE_LOG_COLUMNS =
  "id, location_id, device_id, staff_id, biometric_user_id, device_user_name, punch_at, in_out_status, verify_method, work_code, source";

async function resolveDeviceLogBioSearchIds(
  context: AuthContext,
  locationId: string | null | undefined,
  needle: string,
): Promise<string[]> {
  let bioQ = context.supabase
    .from("attendance_biometric_users")
    .select("biometric_user_id")
    .or(`device_name.ilike.%${needle}%,full_name.ilike.%${needle}%`)
    .limit(500);
  if (locationId) bioQ = bioQ.eq("location_id", locationId);
  const { data, error } = await bioQ;
  if (error) throw error;
  return [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.biometric_user_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

type DeviceLogUserPunchRow = {
  location_id: string;
  device_id: string | null;
  biometric_user_id: string | null;
  device_user_name: string | null;
};

/** All adms_push punches in range for the user dropdown — not limited to DEVICE_LOG_CAP. */
async function fetchDeviceLogUserPunches(
  context: AuthContext,
  data: {
    locationId?: string | null;
    deviceId?: string | null;
    dateFrom: string;
    dateTo: string;
  },
): Promise<DeviceLogUserPunchRow[]> {
  const range = deviceLogPunchRange(data.dateFrom, data.dateTo);
  const punches: DeviceLogUserPunchRow[] = [];
  for (let from = 0; ; from += DEVICE_LOG_USERS_PAGE_SIZE) {
    let q = context.supabase
      .from("attendance_logs")
      .select("location_id, device_id, biometric_user_id, device_user_name")
      .eq("source", DEVICE_LOG_PUSH_SOURCE)
      .gte("punch_at", range.fromIso)
      .lte("punch_at", range.toIso)
      .order("id", { ascending: true })
      .range(from, from + DEVICE_LOG_USERS_PAGE_SIZE - 1);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.deviceId) q = q.eq("device_id", data.deviceId);
    const { data: page, error } = await q;
    if (error) throw error;
    punches.push(...((page ?? []) as DeviceLogUserPunchRow[]));
    if (!page || page.length < DEVICE_LOG_USERS_PAGE_SIZE) break;
  }
  return punches;
}

export const listAttendanceDeviceLogUsers = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    deviceId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    const punches = await fetchDeviceLogUserPunches(context, data);
    const locationIds = [...new Set(punches.map((row) => row.location_id))];
    const bioUserIds = [
      ...new Set(
        punches
          .map((row) => row.biometric_user_id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [bioRes, locations] = await Promise.all([
      locationIds.length && bioUserIds.length
        ? context.supabase
            .from("attendance_biometric_users")
            .select("location_id, device_id, biometric_user_id, device_name, full_name, staff_id")
            .in("location_id", locationIds)
            .in("biometric_user_id", bioUserIds)
            .limit(5000)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      loadByIds<{ id: string; code: string | null; name: string | null }>(
        context,
        "locations",
        "id, code, name",
        locationIds,
      ),
    ]);
    if (bioRes.error) throw bioRes.error;
    const bioIndex = indexDeviceLogBioNames(
      (bioRes.data ?? []).map((raw) => ({
        location_id: String(raw.location_id ?? ""),
        device_id: raw.device_id == null ? null : String(raw.device_id),
        biometric_user_id: String(raw.biometric_user_id ?? ""),
        device_name: raw.device_name == null ? null : String(raw.device_name),
        full_name: raw.full_name == null ? null : String(raw.full_name),
      })),
    );
    const staffIdsForName = [
      ...new Set(
        (bioRes.data ?? [])
          .map((raw) => (raw.staff_id == null ? "" : String(raw.staff_id)))
          .filter(Boolean),
      ),
    ];
    const staffNameRows = await loadByIds<{ id: string; full_name: string | null }>(
      context,
      "staff",
      "id, full_name",
      staffIdsForName,
    );
    const staffNameById = new Map(staffNameRows.map((row) => [row.id, row.full_name]));
    const staffByLocUser = new Map<string, string>();
    for (const raw of bioRes.data ?? []) {
      const loc = String(raw.location_id ?? "");
      const uid = String(raw.biometric_user_id ?? "").trim();
      const staffId = raw.staff_id == null ? "" : String(raw.staff_id);
      if (loc && uid && staffId) staffByLocUser.set(`${loc}|${uid}`, staffId);
    }
    const locationById = new Map(locations.map((row) => [row.id, row]));
    const enriched = punches.map((row) => {
      const bio = lookupDeviceLogBioName(bioIndex, row.location_id, row.biometric_user_id, row.device_id);
      const location = locationById.get(row.location_id);
      const staffId =
        row.biometric_user_id?.trim()
          ? staffByLocUser.get(`${row.location_id}|${row.biometric_user_id.trim()}`)
          : undefined;
      return {
        locationId: row.location_id,
        locationCode: location?.code ?? null,
        biometricUserId: row.biometric_user_id,
        deviceUserName: deviceLogDisplayName(
          row.device_user_name,
          bio,
          staffId ? staffNameById.get(staffId) : null,
          row.biometric_user_id,
        ),
      };
    });
    return { users: collectDeviceLogUsers(enriched) };
  },
  { auth: { capability: "attendance.view" } },
);

export const listAttendanceDeviceLogs = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    deviceId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    q: z.string().max(80).optional(),
    /** @deprecated Prefer deviceUserKeys (`locationId|biometricUserId`) for all-locations. */
    biometricUserId: z.string().max(80).optional(),
    /** Composite keys from the device-user multi-select (`locationId|biometricUserId`). */
    deviceUserKeys: z.array(z.string().min(3).max(160)).max(100).optional(),
  }),
  async (data, context) => {
    if (data.locationId) await assertSite(context, data.locationId);
    const range = deviceLogPunchRange(data.dateFrom, data.dateTo);
    let q = context.supabase
      .from("attendance_logs")
      .select(DEVICE_LOG_COLUMNS, { count: "exact" })
      .eq("source", DEVICE_LOG_PUSH_SOURCE)
      .gte("punch_at", range.fromIso)
      .lte("punch_at", range.toIso)
      .order("punch_at", { ascending: false })
      .limit(DEVICE_LOG_CAP);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.deviceId) q = q.eq("device_id", data.deviceId);
    const userPairs = (data.deviceUserKeys ?? [])
      .map(parseDeviceLogUserOptionKey)
      .filter((pair): pair is { locationId: string; biometricUserId: string } => Boolean(pair))
      .filter((pair) => !data.locationId || pair.locationId === data.locationId);
    const exactUser = userPairs.length ? "" : data.biometricUserId?.trim() || "";
    const needle = userPairs.length || exactUser ? "" : deviceLogSearchNeedle(data.q);
    if (userPairs.length) {
      const pairFilter = deviceLogUserPairsOrFilter(userPairs);
      if (pairFilter) q = q.or(pairFilter);
    } else if (exactUser) {
      q = q.eq("biometric_user_id", exactUser);
    } else if (needle) {
      const bioIds = await resolveDeviceLogBioSearchIds(context, data.locationId, needle);
      q = q.or(deviceLogSearchOrFilter(needle, bioIds));
    }
    const { data: rows, error, count } = await q;
    if (error) throw error;
    const punches = (rows ?? []) as Array<{
      id: string;
      location_id: string;
      device_id: string | null;
      staff_id: string | null;
      biometric_user_id: string | null;
      device_user_name: string | null;
      punch_at: string;
      in_out_status: number | null;
      verify_method: number | null;
      work_code: number | null;
      source: string | null;
    }>;
    const deviceIds = [...new Set(punches.map((row) => row.device_id).filter((id): id is string => Boolean(id)))];
    const locationIds = [...new Set(punches.map((row) => row.location_id))];
    const [devices, locations, bioRes] = await Promise.all([
      loadByIds<{ id: string; device_name: string | null; serial_number: string | null; device_code: string | null }>(
        context,
        "attendance_devices",
        "id, device_name, serial_number, device_code",
        deviceIds,
      ),
      loadByIds<{ id: string; code: string | null; name: string | null }>(
        context,
        "locations",
        "id, code, name",
        locationIds,
      ),
      locationIds.length
        ? context.supabase
            .from("attendance_biometric_users")
            .select("location_id, device_id, biometric_user_id, device_name, full_name, staff_id")
            .in("location_id", locationIds)
            .limit(5000)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    ]);
    if (bioRes.error) throw bioRes.error;
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
      context,
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
        verifyMethod: row.verify_method,
        workCode: row.work_code,
        source: row.source,
      };
    });
    const dayRows = collapseCrossSiteDeviceLogDays(rollupDeviceLogDays(listed));
    const total = count ?? listed.length;
    return {
      rows: dayRows,
      total,
      loaded: listed.length,
      capped: total > listed.length,
    };
  },
  { auth: { capability: "attendance.view" } },
);
