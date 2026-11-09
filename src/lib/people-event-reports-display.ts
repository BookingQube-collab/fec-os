/**
 * Aggregations for People → HR Event Operations Report.
 * Coverage, exceptions, and cost readiness — not punch-ledger detail.
 * Uses real event attendance rows + role day rates — no invented metrics.
 */

import {
  classifyEventAttendanceStatusBucket,
  type EventAttendanceRoleOption,
} from "@/lib/people-event-attendance-display";
import { classifyAttendanceBucket } from "@/lib/people-event-attendance-overview";
import { resolveLabourDayRateQar } from "@/lib/events/event-roles";
import type { PeopleEventAttendanceRow } from "@/lib/people-event-workforce.functions";

export type EventReportsRoleOption = EventAttendanceRoleOption & {
  defaultDayRateQar?: number | null;
};

export type EventReportsRoleSummary = {
  roleKey: string;
  roleLabel: string;
  /** Day-rows scheduled / loaded for this role (= assigned). */
  assigned: number;
  staffCount: number;
  present: number;
  late: number;
  absent: number;
  missingPunch: number;
  coveragePct: number;
  attendancePct: number;
  labourHours: number;
  estimatedCostQar: number | null;
  dayRateQar: number | null;
};

export type EventReportsDailyCoverageCell = {
  assigned: number;
  present: number;
  late: number;
  absent: number;
  coveragePct: number;
};

export type EventReportsDailyCoverageRow = {
  date: string;
  byRole: Record<string, EventReportsDailyCoverageCell>;
  assigned: number;
  covered: number;
  coveragePct: number;
};

export type EventReportsDailyCoverageMatrix = {
  roleKeys: Array<{ key: string; label: string }>;
  days: EventReportsDailyCoverageRow[];
};

export type EventReportsExceptionKind = "missing_punch" | "absent" | "uncovered";

export type EventReportsException = {
  id: string;
  workDate: string;
  staffId: string;
  staffName: string;
  employeeCode: string | null;
  roleLabel: string;
  kind: EventReportsExceptionKind;
};

export type EventOperationsReportKpis = {
  scheduledCrew: number;
  coveragePct: number;
  attendanceRatePct: number;
  labourHours: number;
  estimatedLabourCostQar: number | null;
  costDaysPriced: number;
  costDaysUnpriced: number;
  openExceptions: number;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveRoleLabel(
  row: PeopleEventAttendanceRow,
  roles: readonly EventReportsRoleOption[],
): { key: string; label: string; dayRateQar: number | null } {
  if (row.eventRoleId) {
    const role = roles.find((r) => r.id === row.eventRoleId);
    if (role) {
      return {
        key: role.id,
        label: role.name || role.code,
        dayRateQar: resolveLabourDayRateQar({
          role_default_day_rate_qar: role.defaultDayRateQar ?? null,
        }),
      };
    }
    return {
      key: row.eventRoleId,
      label: row.roleLabel?.trim() || row.eventRoleId.slice(0, 8),
      dayRateQar: null,
    };
  }
  const label = row.roleLabel?.trim();
  if (label) {
    const byName = roles.find(
      (r) =>
        r.name.trim().toLowerCase() === label.toLowerCase() ||
        r.code.trim().toLowerCase() === label.toLowerCase(),
    );
    return {
      key: byName?.id ?? `label:${label.toLowerCase()}`,
      label: byName?.name || label,
      dayRateQar: resolveLabourDayRateQar({
        role_default_day_rate_qar: byName?.defaultDayRateQar ?? null,
      }),
    };
  }
  return { key: "unassigned", label: "—", dayRateQar: null };
}

function isAttended(row: PeopleEventAttendanceRow): boolean {
  const bucket = classifyAttendanceBucket(row);
  return bucket === "present" || bucket === "late";
}

/** Executive KPIs for coverage & cost readiness (distinct from Attendance punch KPIs). */
export function buildEventOperationsReportKpis(
  rows: PeopleEventAttendanceRow[],
  roles: readonly EventReportsRoleOption[] = [],
): EventOperationsReportKpis {
  const staffIds = new Set<string>();
  let present = 0;
  let late = 0;
  let absent = 0;
  let openExceptions = 0;
  let workedMinutes = 0;
  let estimatedLabourCostQar = 0;
  let costDaysPriced = 0;
  let costDaysUnpriced = 0;

  for (const row of rows) {
    if (row.staffId) staffIds.add(row.staffId);
    const bucket = classifyAttendanceBucket(row);
    if (bucket === "present") present += 1;
    else if (bucket === "late") late += 1;
    else {
      absent += 1;
      openExceptions += 1;
    }
    // Incomplete punches on an otherwise attended day (not already counted as absent).
    if (
      bucket !== "absent" &&
      classifyEventAttendanceStatusBucket(row) === "missing"
    ) {
      openExceptions += 1;
    }

    const wm = Number(row.workedMinutes ?? 0);
    if (Number.isFinite(wm) && wm > 0) workedMinutes += wm;

    if (isAttended(row)) {
      const { dayRateQar } = resolveRoleLabel(row, roles);
      if (dayRateQar != null && dayRateQar > 0) {
        estimatedLabourCostQar += dayRateQar;
        costDaysPriced += 1;
      } else {
        costDaysUnpriced += 1;
      }
    }
  }

  const assigned = present + late + absent;
  const attended = present + late;

  return {
    scheduledCrew: staffIds.size,
    coveragePct: pct(attended, assigned),
    attendanceRatePct: pct(present, assigned),
    labourHours: round1(workedMinutes / 60),
    estimatedLabourCostQar:
      costDaysPriced > 0 ? round2(estimatedLabourCostQar) : null,
    costDaysPriced,
    costDaysUnpriced,
    openExceptions,
  };
}

/** Crew attendance rolled up by event role — assigned / present / late / absent. */
export function buildEventReportsByRole(
  rows: PeopleEventAttendanceRow[],
  roles: readonly EventReportsRoleOption[] = [],
): EventReportsRoleSummary[] {
  const map = new Map<
    string,
    {
      label: string;
      dayRateQar: number | null;
      staffIds: Set<string>;
      assigned: number;
      present: number;
      late: number;
      absent: number;
      missingPunch: number;
      workedMinutes: number;
      estimatedCostQar: number;
      costDaysPriced: number;
    }
  >();

  for (const row of rows) {
    const { key, label, dayRateQar } = resolveRoleLabel(row, roles);
    const entry = map.get(key) ?? {
      label,
      dayRateQar,
      staffIds: new Set<string>(),
      assigned: 0,
      present: 0,
      late: 0,
      absent: 0,
      missingPunch: 0,
      workedMinutes: 0,
      estimatedCostQar: 0,
      costDaysPriced: 0,
    };
    if (dayRateQar != null && entry.dayRateQar == null) entry.dayRateQar = dayRateQar;
    if (row.staffId) entry.staffIds.add(row.staffId);
    entry.assigned += 1;

    const presentBucket = classifyAttendanceBucket(row);
    if (presentBucket === "present") entry.present += 1;
    else if (presentBucket === "late") entry.late += 1;
    else entry.absent += 1;

    if (classifyEventAttendanceStatusBucket(row) === "missing") entry.missingPunch += 1;

    const wm = Number(row.workedMinutes ?? 0);
    if (Number.isFinite(wm) && wm > 0) entry.workedMinutes += wm;

    if (isAttended(row) && dayRateQar != null && dayRateQar > 0) {
      entry.estimatedCostQar += dayRateQar;
      entry.costDaysPriced += 1;
    }

    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([roleKey, v]) => {
      const attended = v.present + v.late;
      return {
        roleKey,
        roleLabel: v.label,
        assigned: v.assigned,
        staffCount: v.staffIds.size,
        present: v.present,
        late: v.late,
        absent: v.absent,
        missingPunch: v.missingPunch,
        coveragePct: pct(attended, v.assigned),
        attendancePct: pct(v.present, v.assigned),
        labourHours: round1(v.workedMinutes / 60),
        estimatedCostQar: v.costDaysPriced > 0 ? round2(v.estimatedCostQar) : null,
        dayRateQar: v.dayRateQar,
      };
    })
    .sort((a, b) => b.assigned - a.assigned || a.roleLabel.localeCompare(b.roleLabel));
}

/** Date × role coverage matrix (not punch detail). */
export function buildEventReportsDailyCoverageMatrix(
  rows: PeopleEventAttendanceRow[],
  dateFrom: string,
  dateTo: string,
  roles: readonly EventReportsRoleOption[] = [],
): EventReportsDailyCoverageMatrix {
  if (!dateFrom || !dateTo) return { roleKeys: [], days: [] };

  const roleMeta = new Map<string, string>();
  const byDayRole = new Map<string, EventReportsDailyCoverageCell>();

  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  for (const row of rows) {
    if (!dates.includes(row.workDate)) continue;
    const { key, label } = resolveRoleLabel(row, roles);
    roleMeta.set(key, label);
    const cellKey = `${row.workDate}|${key}`;
    const cell = byDayRole.get(cellKey) ?? {
      assigned: 0,
      present: 0,
      late: 0,
      absent: 0,
      coveragePct: 0,
    };
    cell.assigned += 1;
    const bucket = classifyAttendanceBucket(row);
    if (bucket === "present") cell.present += 1;
    else if (bucket === "late") cell.late += 1;
    else cell.absent += 1;
    cell.coveragePct = pct(cell.present + cell.late, cell.assigned);
    byDayRole.set(cellKey, cell);
  }

  const roleKeys = [...roleMeta.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const days = dates.map((date) => {
    const byRole: Record<string, EventReportsDailyCoverageCell> = {};
    let assigned = 0;
    let covered = 0;
    for (const role of roleKeys) {
      const cell = byDayRole.get(`${date}|${role.key}`);
      if (cell) {
        byRole[role.key] = cell;
        assigned += cell.assigned;
        covered += cell.present + cell.late;
      }
    }
    return {
      date,
      byRole,
      assigned,
      covered,
      coveragePct: pct(covered, assigned),
    };
  });

  return { roleKeys, days };
}

/** Short actionable exceptions list — missing punch, absent, uncovered (scheduled but absent). */
export function buildEventReportsExceptions(
  rows: PeopleEventAttendanceRow[],
  roles: readonly EventReportsRoleOption[] = [],
  limit = 80,
): EventReportsException[] {
  const out: EventReportsException[] = [];

  for (const row of rows) {
    const { label } = resolveRoleLabel(row, roles);
    const bucket = classifyAttendanceBucket(row);
    const scheduled = Boolean(row.scheduledIn || row.scheduledOut);

    // Full absence first (Attendance status bucket also maps Absent → "missing").
    if (bucket === "absent") {
      out.push({
        id: row.id,
        workDate: row.workDate,
        staffId: row.staffId,
        staffName: row.staffName?.trim() || "—",
        employeeCode: row.employeeCode,
        roleLabel: label,
        kind: scheduled ? "uncovered" : "absent",
      });
      continue;
    }

    if (classifyEventAttendanceStatusBucket(row) === "missing") {
      out.push({
        id: row.id,
        workDate: row.workDate,
        staffId: row.staffId,
        staffName: row.staffName?.trim() || "—",
        employeeCode: row.employeeCode,
        roleLabel: label,
        kind: "missing_punch",
      });
    }
  }

  out.sort((a, b) => {
    if (a.workDate !== b.workDate) return b.workDate.localeCompare(a.workDate);
    return a.staffName.localeCompare(b.staffName);
  });

  return out.slice(0, limit);
}

/** @deprecated Prefer buildEventReportsDailyCoverageMatrix — kept for older callers/tests. */
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

/** Day-by-day HR summary across the selected range (legacy shape). */
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
