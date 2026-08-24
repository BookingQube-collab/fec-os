import { rosterSheetLabel } from "@/lib/locations/normalize";

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
