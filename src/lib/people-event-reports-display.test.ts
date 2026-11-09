import { describe, expect, it } from "vitest";

import {
  buildEventOperationsReportKpis,
  buildEventReportsByRole,
  buildEventReportsDailyCoverageMatrix,
  buildEventReportsDailySummary,
  buildEventReportsExceptions,
} from "@/lib/people-event-reports-display";
import type { PeopleEventAttendanceRow } from "@/lib/people-event-workforce.functions";

function row(partial: Partial<PeopleEventAttendanceRow>): PeopleEventAttendanceRow {
  return {
    id: partial.id ?? "1",
    eventId: partial.eventId ?? "ev-1",
    eventName: partial.eventName ?? "Demo",
    locationId: partial.locationId ?? null,
    locationName: partial.locationName ?? null,
    staffId: partial.staffId ?? "s1",
    staffName: partial.staffName ?? "Alex",
    employeeCode: partial.employeeCode ?? "E1",
    biometricUserId: partial.biometricUserId ?? null,
    workDate: partial.workDate ?? "2026-03-01",
    status: partial.status ?? "present",
    lateMinutes: partial.lateMinutes ?? 0,
    earlyLeaveMinutes: partial.earlyLeaveMinutes ?? 0,
    overtimeMinutes: partial.overtimeMinutes ?? 0,
    missedPunch: partial.missedPunch ?? false,
    // Allow explicit null punches (?? would replace null with the default).
    actualIn: partial.actualIn !== undefined ? partial.actualIn : "09:00",
    actualOut: partial.actualOut !== undefined ? partial.actualOut : "18:00",
    scheduledIn: partial.scheduledIn !== undefined ? partial.scheduledIn : "09:00",
    scheduledOut: partial.scheduledOut !== undefined ? partial.scheduledOut : "18:00",
    workedMinutes: partial.workedMinutes !== undefined ? partial.workedMinutes : 540,
    roleLabel: partial.roleLabel ?? null,
    eventRoleId: partial.eventRoleId ?? null,
  };
}

describe("buildEventOperationsReportKpis", () => {
  it("frames coverage, labour hours, cost, and exceptions", () => {
    const roles = [
      { id: "role-labour", code: "labour", name: "Labour", defaultDayRateQar: 100 },
      { id: "role-crew", code: "crew", name: "Crew", defaultDayRateQar: null },
    ];
    const kpis = buildEventOperationsReportKpis(
      [
        row({
          id: "a",
          staffId: "s1",
          eventRoleId: "role-labour",
          roleLabel: "labour",
          workedMinutes: 600,
        }),
        row({
          id: "b",
          staffId: "s2",
          eventRoleId: "role-crew",
          roleLabel: "crew",
          lateMinutes: 15,
          status: "late",
          workedMinutes: 480,
        }),
        row({
          id: "c",
          staffId: "s3",
          eventRoleId: "role-labour",
          roleLabel: "labour",
          status: "absent",
          actualIn: null,
          actualOut: null,
          workedMinutes: 0,
          scheduledIn: "2026-03-01T06:00:00.000Z",
          scheduledOut: "2026-03-01T15:00:00.000Z",
        }),
      ],
      roles,
    );

    expect(kpis.scheduledCrew).toBe(3);
    expect(kpis.labourHours).toBe(18);
    expect(kpis.estimatedLabourCostQar).toBe(100);
    expect(kpis.costDaysPriced).toBe(1);
    expect(kpis.openExceptions).toBeGreaterThanOrEqual(1);
  });
});

describe("buildEventReportsByRole", () => {
  it("aggregates assigned vs present / late / absent by event role", () => {
    const roles = [
      { id: "role-crew", code: "crew", name: "Crew", defaultDayRateQar: null },
      { id: "role-labour", code: "labour", name: "Labour", defaultDayRateQar: 120 },
    ];
    const summary = buildEventReportsByRole(
      [
        row({
          id: "a",
          staffId: "s1",
          eventRoleId: "role-crew",
          roleLabel: "crew",
          overtimeMinutes: 60,
        }),
        row({
          id: "b",
          staffId: "s2",
          eventRoleId: "role-crew",
          roleLabel: "crew",
          lateMinutes: 15,
          status: "late",
        }),
        row({
          id: "c",
          staffId: "s3",
          eventRoleId: "role-labour",
          roleLabel: "labour",
          missedPunch: true,
          actualOut: null,
          status: "missed_punch",
          actualIn: null,
          workedMinutes: 0,
        }),
      ],
      roles,
    );

    expect(summary).toHaveLength(2);
    const crew = summary.find((r) => r.roleKey === "role-crew");
    const labour = summary.find((r) => r.roleKey === "role-labour");
    expect(crew?.staffCount).toBe(2);
    expect(crew?.assigned).toBe(2);
    expect(labour?.missingPunch).toBe(1);
    expect(labour?.dayRateQar).toBe(120);
  });
});

describe("buildEventReportsDailyCoverageMatrix", () => {
  it("builds date × role coverage cells from real rows", () => {
    const roles = [
      { id: "role-crew", code: "crew", name: "Crew" },
      { id: "role-labour", code: "labour", name: "Labour" },
    ];
    const matrix = buildEventReportsDailyCoverageMatrix(
      [
        row({
          id: "a",
          workDate: "2026-03-01",
          staffId: "s1",
          eventRoleId: "role-crew",
          roleLabel: "crew",
        }),
        row({
          id: "b",
          workDate: "2026-03-01",
          staffId: "s2",
          eventRoleId: "role-labour",
          roleLabel: "labour",
          missedPunch: true,
          actualOut: null,
          status: "missed_punch",
          actualIn: null,
        }),
        row({
          id: "c",
          workDate: "2026-03-03",
          staffId: "s1",
          eventRoleId: "role-crew",
          roleLabel: "crew",
        }),
      ],
      "2026-03-01",
      "2026-03-03",
      roles,
    );

    expect(matrix.days.map((d) => d.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(matrix.roleKeys.map((r) => r.key).sort()).toEqual(["role-crew", "role-labour"]);
    expect(matrix.days[0]?.byRole["role-crew"]?.assigned).toBe(1);
    expect(matrix.days[1]?.assigned).toBe(0);
  });
});

describe("buildEventReportsExceptions", () => {
  it("lists missing punch and absent / uncovered only", () => {
    const exceptions = buildEventReportsExceptions([
      row({ id: "ok", staffId: "s1", status: "present" }),
      row({
        id: "miss",
        staffId: "s2",
        staffName: "Blake",
        missedPunch: true,
        actualOut: null,
        status: "missed_punch",
      }),
      row({
        id: "abs",
        staffId: "s3",
        staffName: "Casey",
        status: "absent",
        actualIn: null,
        actualOut: null,
        workedMinutes: 0,
        scheduledIn: "2026-03-01T06:00:00.000Z",
        scheduledOut: "2026-03-01T15:00:00.000Z",
        workDate: "2026-03-01",
      }),
    ]);

    expect(exceptions.map((e) => e.id)).toEqual(["miss", "abs"]);
    expect(exceptions.find((e) => e.id === "abs")?.kind).toBe("uncovered");
  });
});

describe("buildEventReportsDailySummary", () => {
  it("fills every day in range from real rows", () => {
    const days = buildEventReportsDailySummary(
      [
        row({ id: "a", workDate: "2026-03-01", staffId: "s1" }),
        row({
          id: "b",
          workDate: "2026-03-01",
          staffId: "s2",
          missedPunch: true,
          actualOut: null,
          status: "missed_punch",
        }),
        row({ id: "c", workDate: "2026-03-03", staffId: "s1", overtimeMinutes: 30 }),
      ],
      "2026-03-01",
      "2026-03-03",
    );

    expect(days.map((d) => d.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(days[0]?.records).toBe(2);
    expect(days[0]?.missingPunch).toBe(1);
    expect(days[1]?.records).toBe(0);
    expect(days[2]?.overtimeHours).toBe(0.5);
  });
});
