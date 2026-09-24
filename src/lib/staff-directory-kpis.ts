import type { StaffRow } from "@/lib/queries/module-queries.core";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { isExpiringSoon, qatarTodayYmd } from "@/lib/hr-expiry-bands";
import {
  normalizeDepartmentName,
  splitDepartmentTokens,
} from "@/lib/staff-departments";
import {
  isActiveStaffStatus,
  isOnLeaveStaffStatus,
  isRemoteStaffStatus,
  isResignedStaffStatus,
  isSecondmentStaffStatus,
  isTerminatedStaffStatus,
  normalizeDirectoryStatus,
} from "@/lib/staff-status";

export type StaffDirectorySort = "name" | "code" | "location" | "joining" | "qid_expiry" | "passport_expiry";

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
  nationality: string;
  gender: string;
  sponsorship: string;
  missing: boolean;
  /** KPI quick filter: qid_expiring | passport_expiring */
  expiry: string;
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
  active: number;
  secondment: number;
  remote: number;
  onLeave: number;
  resigned: number;
  terminated: number;
  qidExpiringSoon: number;
  passportExpiringSoon: number;
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
  const today = qatarTodayYmd();
  const rows = staff.filter((s) => {
    if (needle) {
      const blob = [
        s.full_name,
        s.employee_code,
        s.qid ?? "",
        s.phone ?? "",
        s.job_title ?? "",
        s.passport_number ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!blob.includes(needle)) return false;
    }
    if (f.loc && !staffLocationCodes(s).includes(f.loc)) return false;
    if (f.department && !staffMatchesDepartment(s, f.department, f.departmentName)) return false;
    if (f.position && s.job_title !== f.position) return false;
    if (f.type && s.employment_type !== f.type) return false;
    if (f.e3 === "yes" && s.e3_enrolled !== true) return false;
    if (f.e3 === "no" && s.e3_enrolled !== false) return false;
    if (f.nationality && (s.nationality ?? "").toLowerCase() !== f.nationality.toLowerCase()) return false;
    if (f.gender && (s.gender ?? "").toLowerCase() !== f.gender.toLowerCase()) return false;
    if (f.sponsorship && !(s.sponsorship_info ?? "").toLowerCase().includes(f.sponsorship.toLowerCase())) {
      return false;
    }
    if (f.status === "active" && !isActiveStaffStatus(s.status)) return false;
    if (f.status === "inactive" && isActiveStaffStatus(s.status)) return false;
    if (f.status && f.status !== "active" && f.status !== "inactive") {
      if (normalizeDirectoryStatus(s.status) !== normalizeDirectoryStatus(f.status)) return false;
    }
    if (f.expiry === "qid_expiring" && !isExpiringSoon(today, s.qid_expiry)) return false;
    if (f.expiry === "passport_expiring" && !isExpiringSoon(today, s.passport_expiry)) return false;
    if (f.missing && s.qid && s.phone && s.hire_date) return false;
    return true;
  });
  return [...rows].sort((a, b) => {
    if (f.sort === "code") return a.employee_code.localeCompare(b.employee_code);
    if (f.sort === "location") return formatLocation(a).localeCompare(formatLocation(b));
    if (f.sort === "joining") return (a.hire_date ?? "").localeCompare(b.hire_date ?? "");
    if (f.sort === "qid_expiry") return (a.qid_expiry ?? "9999").localeCompare(b.qid_expiry ?? "9999");
    if (f.sort === "passport_expiry") {
      return (a.passport_expiry ?? "9999").localeCompare(b.passport_expiry ?? "9999");
    }
    return a.full_name.localeCompare(b.full_name);
  });
}

/** KPI strip counts — must be called with the same array the table renders. */
export function computeStaffDirectoryKpis(rows: StaffRow[]): StaffDirectoryKpis {
  const today = qatarTodayYmd();
  let active = 0;
  let secondment = 0;
  let remote = 0;
  let onLeave = 0;
  let resigned = 0;
  let terminated = 0;
  let qidExpiringSoon = 0;
  let passportExpiringSoon = 0;
  for (const s of rows) {
    if (isSecondmentStaffStatus(s.status) || s.employment_type === "secondment") secondment += 1;
    else if (isRemoteStaffStatus(s.status) || s.is_roaming) remote += 1;
    else if (isOnLeaveStaffStatus(s.status)) onLeave += 1;
    else if (isResignedStaffStatus(s.status)) resigned += 1;
    else if (isTerminatedStaffStatus(s.status)) terminated += 1;
    else if (isActiveStaffStatus(s.status)) active += 1;

    if (isExpiringSoon(today, s.qid_expiry)) qidExpiringSoon += 1;
    if (isExpiringSoon(today, s.passport_expiry)) passportExpiringSoon += 1;
  }
  return {
    total: rows.length,
    active,
    secondment,
    remote,
    onLeave,
    resigned,
    terminated,
    qidExpiringSoon,
    passportExpiringSoon,
  };
}
