import type { StaffRow } from "@/lib/queries/module-queries.core";
import { formatLocationLabel } from "@/lib/locations/normalize";
import {
  normalizeDepartmentName,
  splitDepartmentTokens,
} from "@/lib/staff-departments";
import { isActiveStaffStatus } from "@/lib/staff-status";

export type StaffDirectorySort = "name" | "code" | "location";

export type StaffDirectoryFilters = {
  q: string;
  loc: string;
  position: string;
  /** master_departments.id; empty = all. Match junction ids, linked names, or legacy department text. */
  department: string;
  /** Resolved master_departments.name for `department` — used when staff only have legacy text. */
  departmentName?: string;
  type: string;
  e3: string;
  status: string;
  missing: boolean;
  sort: StaffDirectorySort;
};

/** Match master dept id and/or name against junction links + legacy `staff.department` text. */
export function staffMatchesDepartment(
  s: Pick<StaffRow, "department" | "department_ids" | "department_names">,
  departmentId: string,
  departmentName?: string,
): boolean {
  if (!departmentId) return true;
  if ((s.department_ids ?? []).includes(departmentId)) return true;
  const needle = normalizeDepartmentName(departmentName ?? "");
  if (!needle) return false;
  if ((s.department_names ?? []).some((n) => normalizeDepartmentName(n) === needle)) return true;
  return splitDepartmentTokens(s.department).some((t) => normalizeDepartmentName(t) === needle);
}

export type StaffDirectoryKpis = {
  total: number;
  permanent: number;
  joker: number;
  secondment: number;
};

function staffLocationCodes(s: StaffRow): string[] {
  const codes = new Set<string>();
  if (s.location_code) codes.add(s.location_code);
  for (const loc of s.work_locations ?? []) {
    if (loc.code) codes.add(loc.code);
  }
  return [...codes];
}

function formatLocation(s: StaffRow): string {
  return formatLocationLabel(s.location_code, s.location_name);
}

/** Same filter pipeline the Staff directory table uses (all controls, including type). */
export function filterStaffDirectory(staff: StaffRow[], f: StaffDirectoryFilters): StaffRow[] {
  const needle = f.q.trim().toLowerCase();
  const rows = staff.filter((s) => {
    if (needle) {
      const blob = `${s.full_name} ${s.employee_code} ${s.qid ?? ""} ${s.phone ?? ""}`.toLowerCase();
      if (!blob.includes(needle)) return false;
    }
    if (f.loc && !staffLocationCodes(s).includes(f.loc)) return false;
    if (f.department && !staffMatchesDepartment(s, f.department, f.departmentName)) return false;
    if (f.position && s.job_title !== f.position) return false;
    if (f.type && s.employment_type !== f.type) return false;
    if (f.e3 === "yes" && s.e3_enrolled !== true) return false;
    if (f.e3 === "no" && s.e3_enrolled !== false) return false;
    if (f.status === "active" && !isActiveStaffStatus(s.status)) return false;
    if (f.status === "inactive" && isActiveStaffStatus(s.status)) return false;
    if (f.missing && s.qid && s.phone && s.hire_date) return false;
    return true;
  });
  return [...rows].sort((a, b) => {
    if (f.sort === "code") return a.employee_code.localeCompare(b.employee_code);
    if (f.sort === "location") return formatLocation(a).localeCompare(formatLocation(b));
    return a.full_name.localeCompare(b.full_name);
  });
}

/** KPI strip counts — must be called with the same array the table renders. */
export function computeStaffDirectoryKpis(
  rows: Array<Pick<StaffRow, "employment_type">>,
): StaffDirectoryKpis {
  let permanent = 0;
  let joker = 0;
  let secondment = 0;
  for (const s of rows) {
    if (s.employment_type === "permanent") permanent += 1;
    else if (s.employment_type === "joker") joker += 1;
    else if (s.employment_type === "secondment") secondment += 1;
  }
  return { total: rows.length, permanent, joker, secondment };
}
