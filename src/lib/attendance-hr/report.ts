import { rosterSheetLabel } from "@/lib/locations/normalize";
import { formatLocationLabel } from "@/lib/attendance-display";

export type AttendanceHrReportRow = {
  id: string;
  location_id: string;
  staff_id: string | null;
  biometric_user_id: string | null;
  work_date: string;
  status: string;
  actual_in: string | null;
  actual_out: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  missed_punch: boolean;
  punch_count: number;
  staff_name: string | null;
  employee_code: string | null;
  qid: string | null;
  location_code: string | null;
  location_name: string | null;
  location_region: string | null;
};

export function isAttendanceHrUnmappedSearch(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  return q === "unmapped" || q === "غير مرتبط";
}

export function attendanceHrStaffMatches(
  row: {
    staff_name?: string | null;
    employee_code?: string | null;
    qid?: string | null;
    biometric_user_id?: string | null;
  },
  raw: string,
): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  if (isAttendanceHrUnmappedSearch(q)) return !row.staff_name;
  const compact = q.replace(/\s+/g, "");
  const fields = [row.staff_name ?? "", row.employee_code ?? "", row.qid ?? "", row.biometric_user_id ?? ""];
  return fields.some((field) => {
    const value = field.toLowerCase();
    return value.includes(q) || value.replace(/\s+/g, "").includes(compact);
  });
}

export function formatAttendanceHrLocation(code?: string | null, name?: string | null): string {
  if (!code && !name) return "";
  if (!code) return name ?? "";
  const label = rosterSheetLabel(code, name);
  return label && label !== code ? `${code} · ${label}` : code;
}

export function attendanceHrExportStaffName(row: Pick<AttendanceHrReportRow, "staff_name">, unmapped = "Unmapped"): string {
  return row.staff_name?.trim() || unmapped;
}

/** Site name for the people-style attendance listing (no venue code prefix). */
export function attendanceHrListingLocation(
  row: Pick<AttendanceHrReportRow, "location_code" | "location_name" | "location_region">,
): string {
  if (row.location_name && row.location_region) {
    return formatLocationLabel({ name: row.location_name, region: row.location_region });
  }
  const label = rosterSheetLabel(row.location_code ?? "", row.location_name);
  return label || row.location_name || row.location_code || "—";
}

export function attendanceHrToListingSource(
  row: AttendanceHrReportRow,
  unmapped = "Unmapped",
): {
  id: string;
  locationLabel: string;
  userName: string;
  userNameUnmapped: boolean;
  work_date: string;
  actual_in: string | null;
  actual_out: string | null;
  overtime_minutes: number;
  status: string;
  missed_punch: boolean;
} {
  const mappedName = row.staff_name?.trim() ?? "";
  return {
    id: row.id,
    locationLabel: attendanceHrListingLocation(row),
    userName: mappedName || unmapped,
    userNameUnmapped: !mappedName,
    work_date: row.work_date,
    actual_in: row.actual_in,
    actual_out: row.actual_out,
    overtime_minutes: row.overtime_minutes,
    status: row.status,
    missed_punch: row.missed_punch,
  };
}

export type AttendanceHrReportKpis = {
  total: number;
  uniqueStaff: number;
  present: number;
  absent: number;
  late: number;
  missedPunch: number;
  unscheduled: number;
};

function reportIdentityKey(row: AttendanceHrReportRow): string {
  if (row.staff_id) return `staff:${row.staff_id}`;
  if (row.biometric_user_id) return `bio:${row.location_id}:${row.biometric_user_id}`;
  return `row:${row.id}`;
}

/** Counts for the HR reports KPI strip. Uses the same filtered rows as the table. */
export function computeAttendanceHrReportKpis(rows: AttendanceHrReportRow[]): AttendanceHrReportKpis {
  const identities = new Set<string>();
  let present = 0;
  let absent = 0;
  let late = 0;
  let missedPunch = 0;
  let unscheduled = 0;

  for (const row of rows) {
    identities.add(reportIdentityKey(row));
    if (row.status === "present") present += 1;
    if (row.status === "absent") absent += 1;
    if (row.status === "late" || Number(row.late_minutes) > 0) late += 1;
    if (row.status === "missed_punch" || row.missed_punch) missedPunch += 1;
    if (row.status === "unscheduled") unscheduled += 1;
  }

  return {
    total: rows.length,
    uniqueStaff: identities.size,
    present,
    absent,
    late,
    missedPunch,
    unscheduled,
  };
}
