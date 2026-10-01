import type { StaffRow } from "@/lib/queries/module-queries.core";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { expiryBand, isExpiringSoon, qatarTodayYmd } from "@/lib/hr-expiry-bands";
import { activeTemporaryLocationCodes } from "@/lib/staff-temporary-moves";
import {
  normalizeDepartmentName,
  splitDepartmentTokens,
} from "@/lib/staff-departments";
import {
  staffMatchesOrgShowOnly,
  type OrgFocusDepartment,
} from "@/lib/exclude-org-departments";
import { isExitingStaff, isNewJoiner } from "@/lib/staff-hr-alerts";
import {
  countsAsActiveStaff,
  isJokerStaff,
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
  /**
   * View filter. Empty means every department stays.
   * A non-empty list shows only those focus departments (the ones the user unchecked).
   * Ignored when `department` is set — the explicit department choice wins.
   */
  showOrgDepartments?: readonly OrgFocusDepartment[];
  type: string;
  e3: string;
  status: string;
  /** When true, the directory shows Jokers instead of the active-staff list. Default off. */
  showJokers?: boolean;
  nationality: string;
  gender: string;
  sponsorship: string;
  missing: boolean;
  /**
   * KPI / attention quick filter:
   * qid_expiring | qid_expired | passport_expiring | passport_expired |
   * contract_expiring | visa_expiring | new_joiners | exiting |
   * temporary_project (active temporary staff; jokers are not active)
   */
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
  /** Employment type permanent. The Employees tile uses this, not `active`. */
  permanent: number;
  secondment: number;
  temporary: number;
  newJoiners: number;
  exiting: number;
  remote: number;
  onLeave: number;
  resigned: number;
  terminated: number;
  qidExpiringSoon: number;
  passportExpiringSoon: number;
  missingInfo: number;
};

/**
 * People directory location membership: the home branch, plus a temporary site
 * while today is inside that move. Extra dedicated sites (`work_locations`) and
 * punch or visit sites are not membership.
 */
export function dedicatedStaffLocationCodes(
  s: Pick<StaffRow, "location_code" | "work_locations"> & {
    punch_location_codes?: readonly string[] | null;
    temporary_site_moves?: readonly {
      to_location_code?: string | null;
      starts_on: string;
      ends_on: string;
    }[] | null;
  },
  today = qatarTodayYmd(),
): string[] {
  void s.work_locations;
  void s.punch_location_codes;
  const codes = new Set<string>();
  if (s.location_code) codes.add(s.location_code);
  for (const code of activeTemporaryLocationCodes(s.temporary_site_moves, today)) {
    codes.add(code);
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
    if (f.loc && !dedicatedStaffLocationCodes(s).includes(f.loc)) return false;
    if (f.department && !staffMatchesDepartment(s, f.department, f.departmentName)) return false;
    if (
      f.showOrgDepartments?.length &&
      !f.department &&
      !staffMatchesOrgShowOnly(s, f.showOrgDepartments)
    ) {
      return false;
    }
    if (f.position && s.job_title !== f.position) return false;
    if (f.type && s.employment_type !== f.type) return false;
    if (f.e3 === "yes" && s.e3_enrolled !== true) return false;
    if (f.e3 === "no" && s.e3_enrolled !== false) return false;
    if (f.nationality && (s.nationality ?? "").toLowerCase() !== f.nationality.toLowerCase()) return false;
    if (f.gender && (s.gender ?? "").toLowerCase() !== f.gender.toLowerCase()) return false;
    if (f.sponsorship && !(s.sponsorship_info ?? "").toLowerCase().includes(f.sponsorship.toLowerCase())) {
      return false;
    }
    const jokerOnly =
      Boolean(f.showJokers) ||
      f.type === "joker" ||
      normalizeDirectoryStatus(f.status) === "joker";
    if (jokerOnly && !isJokerStaff(s)) return false;
    if (!jokerOnly && f.status === "active" && !countsAsActiveStaff(s.status, s.employment_type)) {
      return false;
    }
    if (!jokerOnly && f.status === "inactive" && countsAsActiveStaff(s.status, s.employment_type)) {
      return false;
    }
    if (!jokerOnly && f.status && f.status !== "active" && f.status !== "inactive") {
      if (normalizeDirectoryStatus(s.status) !== normalizeDirectoryStatus(f.status)) return false;
    }
    if (f.expiry === "qid_expiring" && expiryBand(today, s.qid_expiry) !== "0_30") return false;
    if (f.expiry === "qid_expired" && expiryBand(today, s.qid_expiry) !== "expired") return false;
    if (f.expiry === "passport_expiring" && expiryBand(today, s.passport_expiry) !== "0_30") return false;
    if (f.expiry === "passport_expired" && expiryBand(today, s.passport_expiry) !== "expired") return false;
    if (f.expiry === "contract_expiring") {
      const b = expiryBand(today, s.contract_end);
      if (b !== "expired" && b !== "0_30") return false;
    }
    if (f.expiry === "visa_expiring") {
      const b = expiryBand(today, s.visa_expiry);
      if (b !== "expired" && b !== "0_30") return false;
    }
    if (f.expiry === "new_joiners" && !isNewJoiner(s, today)) return false;
    if (f.expiry === "exiting" && !isExitingStaff(s)) return false;
    if (f.expiry === "temporary_project") {
      if (s.employment_type !== "temporary" || !countsAsActiveStaff(s.status, s.employment_type)) {
        return false;
      }
    }
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

function isPermanentEmploymentType(employmentType: string | null | undefined): boolean {
  return (employmentType ?? "").trim().toLowerCase() === "permanent";
}

/**
 * Rows behind the directory bucket tiles (Secondment, Exiting, and the rest).
 * Location, department, employment type, search, show-only departments, and the other
 * non-status filters narrow every bucket. Status, expiry, and the joker toggle stay
 * off here — those controls are the tile shortcuts — so each bucket still counts
 * inside the shared scope. Total is not this list; it is the table row count.
 * The Permanent tile does not use this list; it keeps the current status filter.
 */
export function filterStaffDirectoryForKpis(staff: StaffRow[], f: StaffDirectoryFilters): StaffRow[] {
  return filterStaffDirectory(staff, { ...f, status: "", expiry: "", showJokers: false });
}

/**
 * Tiles above the directory table.
 * Total is the table: every current filter, including status.
 * Permanent is employment type permanent inside the same shared filters
 * (location, department, show-only, search, and the rest) plus the current
 * status filter, so the number matches the list on screen. Secondment,
 * temporary, and joker are not permanent. Expiry and the joker toggle stay
 * off, as they do for the other buckets.
 * The other tiles keep their own buckets inside the non-status filters
 * so HR can still see secondment, exiting, and the other counts while the
 * table is narrowed.
 */
export function computeStaffDirectoryTileKpis(
  staff: StaffRow[],
  filters: StaffDirectoryFilters,
): StaffDirectoryKpis {
  const buckets = computeStaffDirectoryKpis(filterStaffDirectoryForKpis(staff, filters));
  const type = filters.type.trim().toLowerCase();
  const permanentScope =
    type && type !== "permanent"
      ? []
      : filterStaffDirectory(staff, { ...filters, type: "", expiry: "", showJokers: false });
  return {
    ...buckets,
    permanent: permanentScope.filter((s) => isPermanentEmploymentType(s.employment_type)).length,
    total: filterStaffDirectory(staff, filters).length,
  };
}

/** Bucket counts for one roster. `total` is `rows.length`. Directory tiles use `computeStaffDirectoryTileKpis` so Total matches the table. */
export function computeStaffDirectoryKpis(rows: StaffRow[]): StaffDirectoryKpis {
  const today = qatarTodayYmd();
  let active = 0;
  let permanent = 0;
  let secondment = 0;
  let temporary = 0;
  let newJoiners = 0;
  let exiting = 0;
  let remote = 0;
  let onLeave = 0;
  let resigned = 0;
  let terminated = 0;
  let qidExpiringSoon = 0;
  let passportExpiringSoon = 0;
  let missingInfo = 0;
  for (const s of rows) {
    if (isSecondmentStaffStatus(s.status) || s.employment_type === "secondment") secondment += 1;
    else if (isRemoteStaffStatus(s.status) || s.is_roaming) remote += 1;
    else if (isOnLeaveStaffStatus(s.status)) onLeave += 1;
    else if (isResignedStaffStatus(s.status)) resigned += 1;
    else if (isTerminatedStaffStatus(s.status)) terminated += 1;
    else if (countsAsActiveStaff(s.status, s.employment_type)) active += 1;

    if (isPermanentEmploymentType(s.employment_type)) permanent += 1;
    if (s.employment_type === "temporary" && countsAsActiveStaff(s.status, s.employment_type)) {
      temporary += 1;
    }
    if (isNewJoiner(s, today)) newJoiners += 1;
    if (isExitingStaff(s)) exiting += 1;
    if (!s.qid || !s.phone || !s.hire_date) missingInfo += 1;

    if (isExpiringSoon(today, s.qid_expiry)) qidExpiringSoon += 1;
    if (isExpiringSoon(today, s.passport_expiry)) passportExpiringSoon += 1;
  }
  return {
    total: rows.length,
    active,
    permanent,
    secondment,
    temporary,
    newJoiners,
    exiting,
    remote,
    onLeave,
    resigned,
    terminated,
    qidExpiringSoon,
    passportExpiringSoon,
    missingInfo,
  };
}
