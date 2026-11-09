import { describe, expect, it } from "vitest";

import {
  buildEventReportsByRole,
  buildEventReportsDailySummary,
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
    actualIn: partial.actualIn ?? "09:00",
    actualOut: partial.actualOut ?? "18:00",
    scheduledIn: partial.scheduledIn ?? "09:00",
    scheduledOut: partial.scheduledOut ?? "18:00",
    workedMinutes: partial.workedMinutes ?? 540,
    roleLabel: partial.roleLabel ?? null,
    eventRoleId: partial.eventRoleId ?? null,
  };
}

describe("buildEventReportsByRole", () => {
  it("aggregates staff and punch quality by event role", () => {
    const roles = [
      { id: "role-crew", code: "crew", name: "Crew" },
      { id: "role-labour", code: "labour", name: "Labour" },
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
        }),
      ],
      roles,
    );

    expect(summary).toHaveLength(2);
    const crew = summary.find((r) => r.roleKey === "role-crew");
    const labour = summary.find((r) => r.roleKey === "role-labour");
    expect(crew?.staffCount).toBe(2);
    expect(crew?.records).toBe(2);
    expect(crew?.overtimeHours).toBe(1);
    expect(labour?.missingPunch).toBe(1);
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
