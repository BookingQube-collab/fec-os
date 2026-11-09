import { describe, expect, it } from "vitest";

import {
  eventAttendanceRowMatchesRole,
  filterEventAttendanceRowsByRole,
} from "@/lib/people-event-attendance-display";
import type { PeopleEventAttendanceRow } from "@/lib/people-event-workforce.functions";

function row(
  overrides: Partial<PeopleEventAttendanceRow> & Pick<PeopleEventAttendanceRow, "id">,
): PeopleEventAttendanceRow {
  return {
    eventId: "11111111-1111-1111-1111-111111111111",
    eventName: "Demo",
    staffId: "22222222-2222-2222-2222-222222222222",
    staffName: "Hamza",
    employeeCode: "EVT-LBR40",
    workDate: "2026-11-23",
    status: "present",
    locationId: null,
    locationName: null,
    biometricUserId: null,
    scheduledIn: null,
    scheduledOut: null,
    actualIn: null,
    actualOut: null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    workedMinutes: 0,
    missedPunch: false,
    roleLabel: null,
    eventRoleId: null,
    ...overrides,
  };
}

const roles = [
  { id: "role-crew", code: "crew", name: "Crew" },
  { id: "role-labour", code: "labour", name: "Labour" },
  { id: "role-cashier", code: "cashier", name: "Cashier" },
];

describe("eventAttendanceRowMatchesRole", () => {
  it("passes all rows when no role is selected", () => {
    expect(eventAttendanceRowMatchesRole(row({ id: "a" }), null, roles)).toBe(true);
    expect(eventAttendanceRowMatchesRole(row({ id: "a" }), "", roles)).toBe(true);
  });

  it("matches by eventRoleId first", () => {
    expect(
      eventAttendanceRowMatchesRole(
        row({ id: "a", eventRoleId: "role-labour", roleLabel: "crew" }),
        "role-labour",
        roles,
      ),
    ).toBe(true);
  });

  it("falls back to role_label vs code/name", () => {
    expect(
      eventAttendanceRowMatchesRole(
        row({ id: "a", roleLabel: "Labour" }),
        "role-labour",
        roles,
      ),
    ).toBe(true);
    expect(
      eventAttendanceRowMatchesRole(
        row({ id: "a", roleLabel: "cashier" }),
        "role-cashier",
        roles,
      ),
    ).toBe(true);
    expect(
      eventAttendanceRowMatchesRole(
        row({ id: "a", roleLabel: "crew" }),
        "role-labour",
        roles,
      ),
    ).toBe(false);
  });
});

describe("filterEventAttendanceRowsByRole", () => {
  it("filters the list by selected role", () => {
    const rows = [
      row({ id: "1", eventRoleId: "role-crew", roleLabel: "crew" }),
      row({ id: "2", roleLabel: "labour" }),
      row({ id: "3", roleLabel: "Cashier" }),
    ];
    expect(filterEventAttendanceRowsByRole(rows, null, roles)).toHaveLength(3);
    expect(filterEventAttendanceRowsByRole(rows, "role-labour", roles).map((r) => r.id)).toEqual([
      "2",
    ]);
  });
});
