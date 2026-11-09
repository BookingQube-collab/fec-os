/**
 * Aggregations for People → HR Event Reports.
 * Uses real event attendance rows — no invented metrics.
 */

import {
  classifyEventAttendanceStatusBucket,
  type EventAttendanceRoleOption,
} from "@/lib/people-event-attendance-display";
import { classifyAttendanceBucket } from "@/lib/people-event-attendance-overview";
import type { PeopleEventAttendanceRow } from "@/lib/people-event-workforce.functions";

export type EventReportsRoleSummary = {
  roleKey: string;
  roleLabel: string;
  staffCount: number;
  records: number;
  present: number;
  late: number;
  absent: number;
  complete: number;
  missingPunch: number;
  overtimeHours: number;
  attendancePct: number;
};

export type EventReportsDailySummary = {
  date: string;
  records: number;
  present: number;
  late: number;
  absent: number;
  missingPunch: number;
  overtimeHours: number;
  attendancePct: number;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function resolveRoleLabel(
  row: PeopleEventAttendanceRow,
  roles: readonly EventAttendanceRoleOption[],
): { key: string; label: string } {
  if (row.eventRoleId) {
    const role = roles.find((r) => r.id === row.eventRoleId);
    if (role) return { key: role.id, label: role.name || role.code };
    return { key: row.eventRoleId, label: row.roleLabel?.trim() || row.eventRoleId.slice(0, 8) };
  }
  const label = row.roleLabel?.trim();
  if (label) return { key: `label:${label.toLowerCase()}`, label };
  return { key: "unassigned", label: "—" };
}

/** Crew attendance rolled up by event role (from day rows). */
export function buildEventReportsByRole(
  rows: PeopleEventAttendanceRow[],
  roles: readonly EventAttendanceRoleOption[] = [],
): EventReportsRoleSummary[] {
  const map = new Map<
    string,
    {
      label: string;
      staffIds: Set<string>;
      records: number;
      present: number;
      late: number;
      absent: number;
      complete: number;
      missingPunch: number;
      overtimeMinutes: number;
    }
  >();

  for (const row of rows) {
    const { key, label } = resolveRoleLabel(row, roles);
    const entry = map.get(key) ?? {
      label,
      staffIds: new Set<string>(),
      records: 0,
      present: 0,
      late: 0,
      absent: 0,
      complete: 0,
      missingPunch: 0,
      overtimeMinutes: 0,
    };
    if (row.staffId) entry.staffIds.add(row.staffId);
    entry.records += 1;

    const presentBucket = classifyAttendanceBucket(row);
    if (presentBucket === "present") entry.present += 1;
    else if (presentBucket === "late") entry.late += 1;
    else entry.absent += 1;

    const statusBucket = classifyEventAttendanceStatusBucket(row);
    if (statusBucket === "complete") entry.complete += 1;
    else if (statusBucket === "missing") entry.missingPunch += 1;

    const ot = Number(row.overtimeMinutes ?? 0);
    if (Number.isFinite(ot) && ot > 0) entry.overtimeMinutes += ot;

    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([roleKey, v]) => {
      const attended = v.present + v.late;
      return {
        roleKey,
        roleLabel: v.label,
        staffCount: v.staffIds.size,
        records: v.records,
        present: v.present,
        late: v.late,
        absent: v.absent,
        complete: v.complete,
        missingPunch: v.missingPunch,
        overtimeHours: Math.round((v.overtimeMinutes / 60) * 10) / 10,
        attendancePct: pct(attended, v.records),
      };
    })
    .sort((a, b) => b.records - a.records || a.roleLabel.localeCompare(b.roleLabel));
}

/** Day-by-day HR summary across the selected range. */
export function buildEventReportsDailySummary(
  rows: PeopleEventAttendanceRow[],
  dateFrom: string,
  dateTo: string,
): EventReportsDailySummary[] {
  if (!dateFrom || !dateTo) return [];

  const byDay = new Map<
    string,
    {
      records: number;
      present: number;
      late: number;
      absent: number;
      missingPunch: number;
      overtimeMinutes: number;
    }
  >();

  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    byDay.set(d.toISOString().slice(0, 10), {
      records: 0,
      present: 0,
      late: 0,
      absent: 0,
      missingPunch: 0,
      overtimeMinutes: 0,
    });
  }

  for (const row of rows) {
    const day = byDay.get(row.workDate);
    if (!day) continue;
    day.records += 1;
    const presentBucket = classifyAttendanceBucket(row);
    if (presentBucket === "present") day.present += 1;
    else if (presentBucket === "late") day.late += 1;
    else day.absent += 1;
    if (classifyEventAttendanceStatusBucket(row) === "missing") day.missingPunch += 1;
    const ot = Number(row.overtimeMinutes ?? 0);
    if (Number.isFinite(ot) && ot > 0) day.overtimeMinutes += ot;
  }

  return [...byDay.entries()].map(([date, v]) => ({
    date,
    records: v.records,
    present: v.present,
    late: v.late,
    absent: v.absent,
    missingPunch: v.missingPunch,
    overtimeHours: Math.round((v.overtimeMinutes / 60) * 10) / 10,
    attendancePct: pct(v.present + v.late, v.records),
  }));
}
