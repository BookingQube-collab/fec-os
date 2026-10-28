import { describe, expect, it } from "vitest";

import { scheduledIsoFromHm } from "@/lib/attendance-hr/late-punch";
import {
  isRosterPunchFillSubjectRow,
  mayFillRosterDevicePunches,
  mergeRosterPunchFillStaffIds,
  planRosterPunchFill,
  ROSTER_PUNCH_FILL_NOTE,
  ROSTER_PUNCH_FILL_SOURCE,
  rosterFillAudience,
} from "@/lib/attendance-hr/roster-punch-fill";

const LOCATION = "11111111-1111-1111-1111-111111111111";

describe("who may fill missed device punches from the roster", () => {
  it("allows Head of Operations only, and refuses Sr. Site Supervisor even with branch_gm", () => {
    expect(mayFillRosterDevicePunches({ roles: ["regional_ops"] })).toBe(true);
    expect(
      mayFillRosterDevicePunches({
        roles: ["cashier_host"],
        jobTitle: "Head of Operations / FEC-IT",
      }),
    ).toBe(true);
    expect(rosterFillAudience({ roles: ["regional_ops"], jobTitle: "Head of Operations" })).toBe("team");
    expect(rosterFillAudience({ roles: [], jobTitle: "Head of Operations" })).toBe("team");

    // Mary: Sr. Site Supervisor keeps branch_gm for other scopes — must not unlock Fill.
    expect(
      mayFillRosterDevicePunches({
        roles: ["branch_gm"],
        jobTitle: "Sr. Site Supervisor",
      }),
    ).toBe(false);
    expect(rosterFillAudience({ roles: ["branch_gm"], jobTitle: "Sr. Site Supervisor" })).toBeNull();

    expect(mayFillRosterDevicePunches({ roles: ["ceo"] })).toBe(false);
    expect(mayFillRosterDevicePunches({ roles: ["branch_gm"] })).toBe(false);
    expect(mayFillRosterDevicePunches({ roles: ["cashier_host"], jobTitle: "General Manager" })).toBe(false);
    expect(mayFillRosterDevicePunches({ roles: ["cashier_host"] })).toBe(false);
    expect(mayFillRosterDevicePunches({ roles: ["tech_supervisor"], jobTitle: "Site Supervisor" })).toBe(false);
    expect(mayFillRosterDevicePunches({ roles: ["duty_manager"], jobTitle: "Duty Manager" })).toBe(false);
    expect(rosterFillAudience({ roles: ["cashier_host"] })).toBeNull();
    expect(rosterFillAudience({ roles: ["ceo"] })).toBeNull();
  });

  it("unions location-scoped Active Jokers onto the reporting-team fill picker", () => {
    expect(
      mergeRosterPunchFillStaffIds({
        teamStaffIds: ["crew-a", "mary"],
        scopedJokerStaffIds: ["mohamed-joker", "crew-a"],
      }),
    ).toEqual(["crew-a", "mary", "mohamed-joker"]);

    expect(
      mergeRosterPunchFillStaffIds({
        teamStaffIds: [],
        scopedJokerStaffIds: ["mohamed-joker"],
      }),
    ).toEqual(["mohamed-joker"]);
  });

  it("keeps roster-visible jokers as fill subjects alongside directory-active staff", () => {
    expect(isRosterPunchFillSubjectRow({ status: "joker", employment_type: "joker" })).toBe(true);
    expect(isRosterPunchFillSubjectRow({ status: "active", employment_type: "joker" })).toBe(true);
    expect(isRosterPunchFillSubjectRow({ status: "active", employment_type: "permanent" })).toBe(true);
    expect(isRosterPunchFillSubjectRow({ status: "serving_notice" })).toBe(true);
    expect(isRosterPunchFillSubjectRow({ status: "terminated", employment_type: "joker" })).toBe(false);
    expect(
      isRosterPunchFillSubjectRow({
        status: "joker",
        employment_type: "joker",
        deleted_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("roster shift fill", () => {
  it("writes punch-in and punch-out from the shift and skips an OFF day, a missing shift, and a device punch", () => {
    const result = planRosterPunchFill({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-04",
      assignments: [
        {
          workDate: "2026-10-01",
          locationId: LOCATION,
          isWeekOff: false,
          shiftStart: "09:00",
          shiftEnd: "17:00",
        },
        {
          workDate: "2026-10-02",
          locationId: LOCATION,
          isWeekOff: true,
          shiftStart: "09:00",
          shiftEnd: "17:00",
        },
        {
          workDate: "2026-10-03",
          locationId: LOCATION,
          isWeekOff: false,
          shiftStart: "10:00",
          shiftEnd: "18:00",
        },
      ],
      punches: [{ workDate: "2026-10-03", source: "adms_push" }],
    });

    expect(result.filledDays).toBe(1);
    expect(result.skippedDays).toBe(3);
    expect(result.punches).toEqual([
      {
        workDate: "2026-10-01",
        locationId: LOCATION,
        punchType: "in",
        punchAt: scheduledIsoFromHm("2026-10-01", "09:00"),
        attendanceDate: "2026-10-01",
        source: ROSTER_PUNCH_FILL_SOURCE,
        note: ROSTER_PUNCH_FILL_NOTE,
      },
      {
        workDate: "2026-10-01",
        locationId: LOCATION,
        punchType: "out",
        punchAt: scheduledIsoFromHm("2026-10-01", "17:00"),
        attendanceDate: "2026-10-01",
        source: ROSTER_PUNCH_FILL_SOURCE,
        note: ROSTER_PUNCH_FILL_NOTE,
      },
    ]);
    expect(result.punches.some((punch) => punch.workDate === "2026-10-02" || punch.workDate === "2026-10-03")).toBe(
      false,
    );
  });

  it("skips a day that was already filled from the roster", () => {
    const result = planRosterPunchFill({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-01",
      assignments: [
        {
          workDate: "2026-10-01",
          locationId: LOCATION,
          isWeekOff: false,
          shiftStart: "09:00",
          shiftEnd: "17:00",
        },
      ],
      punches: [{ workDate: "2026-10-01", source: ROSTER_PUNCH_FILL_SOURCE }],
    });
    expect(result.filledDays).toBe(0);
    expect(result.skippedDays).toBe(1);
    expect(result.punches).toEqual([]);
  });
});
