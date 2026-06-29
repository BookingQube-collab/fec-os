import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";

export interface PeopleDashboardFilters {
  locationId?: string | null;
}

export interface PeopleDashboardKpis {
  total_staff: number;
  active_staff: number;
  on_leave: number;
  terminated: number;
  locations_with_staff: number;
}

export interface PeopleDashboardPayload {
  kpis: PeopleDashboardKpis;
  staff_by_location: Array<{ code: string; name: string; count: number }>;
  staff_by_job_title: Array<{ job_title: string; count: number }>;
  staff_by_department: Array<{ department: string; count: number }>;
  staff_by_status: Array<{ status: string; count: number }>;
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
};

function emptyPayload(): PeopleDashboardPayload {
  return {
    kpis: {
      total_staff: 0,
      active_staff: 0,
      on_leave: 0,
      terminated: 0,
      locations_with_staff: 0,
    },
    staff_by_location: [],
    staff_by_job_title: [],
    staff_by_department: [],
    staff_by_status: [],
    recent_hires: [],
  };
}

export async function fetchPeopleDashboard(
  context: AuthContext,
  filters: PeopleDashboardFilters = {},
): Promise<PeopleDashboardPayload> {
  const timer = createTimer("fetchPeopleDashboard", "people-dashboard");

  let locQ = context.supabase
    .from("locations")
    .select("id, code, name")
    .in("status", ["active", "maintenance"]);
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
    .select("id, employee_code, full_name, job_title, department, status, hire_date, location_id, staff_departments(department_id, master_departments(name, sort_order))")
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
  const statusCounts = new Map<string, number>();
  const locCounts = new Map<string, { code: string; name: string; count: number }>();
  const titleCounts = new Map<string, number>();
  const deptCounts = new Map<string, number>();

  for (const s of staff) {
    statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1);
    if (s.status === "active") activeStaff += 1;
    else if (s.status === "on_leave") onLeave += 1;
    else if (s.status === "terminated") terminated += 1;

    const loc = locById.get(s.location_id);
    const code = loc?.code ?? "—";
    const name = loc?.name ?? "Unknown";
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
    .filter((s) => s.hire_date)
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

  const payload: PeopleDashboardPayload = {
    kpis: {
      total_staff: staff.length,
      active_staff: activeStaff,
      on_leave: onLeave,
      terminated,
      locations_with_staff: locCounts.size,
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
    recent_hires: recentHires,
  };

  timer.end({ rowCount: staff.length });
  return payload;
}
