import type { AuthContext } from "@/lib/server/auth";
import { CANONICAL_LOCATION_CODES, rosterSheetLabel } from "@/lib/locations/normalize";
import { canUserDo } from "@/lib/rbac";
import { createTimer } from "@/lib/performance/timer";
import {
  isActiveRosterStaff,
  isActiveStaffStatus,
  isOnLeaveStaffStatus,
  isTerminatedStaffStatus,
} from "@/lib/staff-status";

export interface PeopleDashboardFilters {
  locationId?: string | null;
}

export interface PeopleDashboardKpis {
  total_staff: number;
  active_staff: number;
  inactive_staff: number;
  on_leave: number;
  terminated: number;
  locations_with_staff: number;
  permanent: number;
  temporary: number;
  missing_qid: number;
  missing_contact: number;
  missing_joining_date: number;
  total_monthly_salary_qar: number | null;
  missing_monthly_salary: number | null;
  daily_rate_only: number | null;
}

export interface PeopleDashboardSalaryLocation {
  code: string;
  name: string;
  monthly_salary_qar: number;
  roster_headcount: number;
  missing_monthly: number;
  daily_rate_only: number;
}

export interface PeopleDashboardPayload {
  kpis: PeopleDashboardKpis;
  staff_by_location: Array<{ code: string; name: string; count: number }>;
  staff_by_job_title: Array<{ job_title: string; count: number }>;
  staff_by_department: Array<{ department: string; count: number }>;
  staff_by_status: Array<{ status: string; count: number }>;
  staff_by_employment_type: Array<{ type: string; count: number }>;
  salary_by_location: PeopleDashboardSalaryLocation[] | null;
  recent_hires: Array<{
    id: string;
    employee_code: string;
    full_name: string;
    job_title: string | null;
    location_code: string;
    hire_date: string;
  }>;
}

type StaffAggRow = {
  id: string;
  employee_code: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  status: string;
  hire_date: string | null;
  location_id: string;
  qid: string | null;
  phone: string | null;
  e3_enrolled: boolean | null;
  employment_type: string | null;
};

function emptyPayload(): PeopleDashboardPayload {
  return {
    kpis: {
      total_staff: 0,
      active_staff: 0,
      inactive_staff: 0,
      on_leave: 0,
      terminated: 0,
      locations_with_staff: 0,
      permanent: 0,
      temporary: 0,
      missing_qid: 0,
      missing_contact: 0,
      missing_joining_date: 0,
      total_monthly_salary_qar: null,
      missing_monthly_salary: null,
      daily_rate_only: null,
    },
    staff_by_location: [],
    staff_by_job_title: [],
    staff_by_department: [],
    staff_by_status: [],
    staff_by_employment_type: [],
    salary_by_location: null,
    recent_hires: [],
  };
}

export function stripPeopleDashboardSalary(payload: PeopleDashboardPayload): PeopleDashboardPayload {
  return {
    ...payload,
    kpis: {
      ...payload.kpis,
      total_monthly_salary_qar: null,
      missing_monthly_salary: null,
      daily_rate_only: null,
    },
    salary_by_location: null,
  };
}

type CompRow = {
  staff_id: string;
  monthly_salary_qar: number | null;
  daily_rate_qar: number | null;
};

export function aggregateActiveRosterSalary(
  staff: Array<{ id: string; location_id: string; status: string | null }>,
  locations: Array<{ id: string; code: string; name: string }>,
  comps: CompRow[],
): {
  total: number;
  missing_monthly: number;
  daily_rate_only: number;
  by_location: PeopleDashboardSalaryLocation[];
} {
  const locById = new Map(locations.map((l) => [l.id, l]));
  const codeOrder = [...locations].sort((a, b) => {
    const ai = CANONICAL_LOCATION_CODES.indexOf(a.code as (typeof CANONICAL_LOCATION_CODES)[number]);
    const bi = CANONICAL_LOCATION_CODES.indexOf(b.code as (typeof CANONICAL_LOCATION_CODES)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const buckets = new Map<string, PeopleDashboardSalaryLocation>();
  for (const loc of codeOrder) {
    buckets.set(loc.code, {
      code: loc.code,
      name: rosterSheetLabel(loc.code, loc.name),
      monthly_salary_qar: 0,
      roster_headcount: 0,
      missing_monthly: 0,
      daily_rate_only: 0,
    });
  }

  const compByStaff = new Map(comps.map((c) => [c.staff_id, c]));
  let total = 0;
  let missing = 0;
  let dailyOnly = 0;

  for (const s of staff) {
    if (!isActiveRosterStaff(s.status)) continue;
    const loc = locById.get(s.location_id);
    const code = loc?.code ?? "—";
    const bucket = buckets.get(code) ?? {
      code,
      name: rosterSheetLabel(code, loc?.name ?? "Unknown"),
      monthly_salary_qar: 0,
      roster_headcount: 0,
      missing_monthly: 0,
      daily_rate_only: 0,
    };
    bucket.roster_headcount += 1;
    const comp = compByStaff.get(s.id);
    const monthly = comp?.monthly_salary_qar == null ? null : Number(comp.monthly_salary_qar);
    const daily = comp?.daily_rate_qar == null ? null : Number(comp.daily_rate_qar);
    if (monthly != null && Number.isFinite(monthly)) {
      bucket.monthly_salary_qar += monthly;
      total += monthly;
    } else {
      bucket.missing_monthly += 1;
      missing += 1;
      if (daily != null && Number.isFinite(daily)) {
        bucket.daily_rate_only += 1;
        dailyOnly += 1;
      }
    }
    buckets.set(code, bucket);
  }

  const by_location = codeOrder.map((l) => buckets.get(l.code)!);
  for (const [code, bucket] of buckets) {
    if (!codeOrder.some((l) => l.code === code)) by_location.push(bucket);
  }

  return { total, missing_monthly: missing, daily_rate_only: dailyOnly, by_location };
}

export async function fetchPeopleDashboard(
  context: AuthContext,
  filters: PeopleDashboardFilters = {},
): Promise<PeopleDashboardPayload> {
  const timer = createTimer("fetchPeopleDashboard", "people-dashboard");

  let locQ = context.supabase
    .from("locations")
    .select("id, code, name")
    .in("code", [...CANONICAL_LOCATION_CODES]);
  if (filters.locationId) locQ = locQ.eq("id", filters.locationId);
  const { data: locations, error: locErr } = await locQ;
  if (locErr) throw locErr;

  const locationIds = (locations ?? []).map((l) => l.id);
  const locById = new Map((locations ?? []).map((l) => [l.id, l]));

  if (!locationIds.length) {
    timer.end({ rowCount: 0 });
    return emptyPayload();
  }

  const { data: staffRows, error: staffErr } = await context.supabase
    .from("staff")
    .select("id, employee_code, full_name, job_title, department, status, hire_date, location_id, qid, phone, e3_enrolled, employment_type, staff_departments(department_id, master_departments(name, sort_order))")
    .in("location_id", locationIds)
    .is("deleted_at", null);
  if (staffErr) throw staffErr;

  const staff = (staffRows ?? []) as Array<
    StaffAggRow & {
      staff_departments?: Array<{
        department_id: string;
        master_departments: { name: string; sort_order: number } | null;
      }>;
    }
  >;

  let activeStaff = 0;
  let onLeave = 0;
  let terminated = 0;
  let permanent = 0;
  let temporary = 0;
  let missingQid = 0;
  let missingContact = 0;
  let missingHire = 0;
  const statusCounts = new Map<string, number>();
  const locCounts = new Map<string, { code: string; name: string; count: number }>();
  const titleCounts = new Map<string, number>();
  const deptCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();

  for (const s of staff) {
    const statusKey = s.status?.trim() || "active";
    statusCounts.set(statusKey, (statusCounts.get(statusKey) ?? 0) + 1);
    if (isActiveStaffStatus(s.status)) activeStaff += 1;
    else if (isOnLeaveStaffStatus(s.status)) onLeave += 1;
    else if (isTerminatedStaffStatus(s.status)) terminated += 1;
    if (isTerminatedStaffStatus(s.status)) continue;

    if (s.employment_type === "permanent") permanent += 1;
    if (s.employment_type === "temporary") temporary += 1;
    if (!s.qid?.trim()) missingQid += 1;
    if (!s.phone?.trim()) missingContact += 1;
    if (!s.hire_date) missingHire += 1;
    const typeKey = s.employment_type?.trim() || "unspecified";
    typeCounts.set(typeKey, (typeCounts.get(typeKey) ?? 0) + 1);

    if (!isActiveStaffStatus(s.status)) continue;

    const loc = locById.get(s.location_id);
    const code = loc?.code ?? "—";
    const name = rosterSheetLabel(code, loc?.name ?? "Unknown");
    // Headcount and salary use primary location_id only (roaming techs are not double-counted).
    const locBucket = locCounts.get(code) ?? { code, name, count: 0 };
    locBucket.count += 1;
    locCounts.set(code, locBucket);

    const title = s.job_title?.trim() || "Unassigned";
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);

    const deptNames =
      s.staff_departments
        ?.map((d) => d.master_departments?.name)
        .filter((n): n is string => Boolean(n)) ?? [];
    if (deptNames.length) {
      for (const dept of deptNames) {
        deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
      }
    } else {
      const dept = s.department?.trim() || "Unassigned";
      deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
    }
  }

  const recentHires = staff
    .filter((s) => s.hire_date && !isTerminatedStaffStatus(s.status))
    .sort((a, b) => (b.hire_date ?? "").localeCompare(a.hire_date ?? ""))
    .slice(0, 10)
    .map((s) => {
      const loc = locById.get(s.location_id);
      return {
        id: s.id,
        employee_code: s.employee_code,
        full_name: s.full_name,
        job_title: s.job_title,
        location_code: loc?.code ?? "—",
        hire_date: s.hire_date!,
      };
    });

  const canViewSalary = canUserDo(context.roles ?? [], "people.view_salary");
  let salaryTotal: number | null = null;
  let missingMonthly: number | null = null;
  let dailyRateOnly: number | null = null;
  let salaryByLocation: PeopleDashboardSalaryLocation[] | null = null;

  if (canViewSalary) {
    const rosterIds = staff.filter((s) => isActiveRosterStaff(s.status)).map((s) => s.id);
    let comps: CompRow[] = [];
    if (rosterIds.length) {
      const { data: compRows, error: compErr } = await context.supabase
        .from("staff_compensation")
        .select("staff_id, monthly_salary_qar, daily_rate_qar")
        .in("staff_id", rosterIds);
      if (compErr) throw compErr;
      comps = (compRows ?? []) as CompRow[];
    }
    const salary = aggregateActiveRosterSalary(staff, locations ?? [], comps);
    salaryTotal = salary.total;
    missingMonthly = salary.missing_monthly;
    dailyRateOnly = salary.daily_rate_only;
    salaryByLocation = salary.by_location;
  }

  const payload: PeopleDashboardPayload = {
    kpis: {
      total_staff: activeStaff + onLeave,
      active_staff: activeStaff,
      inactive_staff: onLeave + terminated,
      on_leave: onLeave,
      terminated,
      locations_with_staff: locCounts.size,
      permanent,
      temporary,
      missing_qid: missingQid,
      missing_contact: missingContact,
      missing_joining_date: missingHire,
      total_monthly_salary_qar: salaryTotal,
      missing_monthly_salary: missingMonthly,
      daily_rate_only: dailyRateOnly,
    },
    staff_by_location: [...locCounts.values()].sort((a, b) => b.count - a.count),
    staff_by_job_title: [...titleCounts.entries()]
      .map(([job_title, count]) => ({ job_title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    staff_by_department: [...deptCounts.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    staff_by_status: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    staff_by_employment_type: [...typeCounts.entries()].map(([type, count]) => ({ type, count })),
    salary_by_location: salaryByLocation,
    recent_hires: recentHires,
  };

  timer.end({ rowCount: staff.length });
  return payload;
}
