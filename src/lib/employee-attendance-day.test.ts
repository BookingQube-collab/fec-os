import { describe, expect, it } from "vitest";

import {
  preferMyAttendanceSummaryRow,
  preferMyRosterDayRow,
  resolveEmployeeDayAttendanceDisplay,
  sumEmployeePeriodHours,
} from "@/lib/employee-attendance-day";

describe("resolveEmployeeDayAttendanceDisplay", () => {
  it("forces weekly_off and clears missed punch when roster is week off", () => {
    expect(
      resolveEmployeeDayAttendanceDisplay({
        status: "absent",
        missedPunch: true,
        isWeekOff: true,
        leaveType: null,
      }),
    ).toEqual({ status: "weekly_off", missedPunch: false });

    expect(
      resolveEmployeeDayAttendanceDisplay({
        status: "missed_punch",
        missedPunch: true,
        isWeekOff: true,
      }),
    ).toEqual({ status: "weekly_off", missedPunch: false });
  });

  it("leaves on-duty absent alone when roster is not week off", () => {
    expect(
      resolveEmployeeDayAttendanceDisplay({
        status: "absent",
        missedPunch: true,
        isWeekOff: false,
      }),
    ).toEqual({ status: "absent", missedPunch: true });
  });

  it("prefers leave type over week-off flag", () => {
    expect(
      resolveEmployeeDayAttendanceDisplay({
        status: "absent",
        missedPunch: true,
        isWeekOff: true,
        leaveType: "comp_off",
      }),
    ).toEqual({ status: "comp_off", missedPunch: false });
  });
});

describe("preferMyAttendanceSummaryRow", () => {
  const absentMp = {
    status: "absent",
    missedPunch: true,
    actualIn: null,
    actualOut: null,
    workedMinutes: 0,
  };
  const weeklyOff = {
    status: "weekly_off",
    missedPunch: false,
    actualIn: null,
    actualOut: null,
    workedMinutes: 0,
  };

  it("prefers weekly_off over punchless Absent/missed-punch sibling (Oct 21 style)", () => {
    expect(preferMyAttendanceSummaryRow(weeklyOff, absentMp)).toBe(true);
    expect(preferMyAttendanceSummaryRow(absentMp, weeklyOff)).toBe(false);
  });

  it("still prefers a complete punch day over week-off", () => {
    const worked = {
      status: "present",
      missedPunch: false,
      actualIn: "2026-10-21T05:00:00.000Z",
      actualOut: "2026-10-21T14:00:00.000Z",
      workedMinutes: 540,
    };
    expect(preferMyAttendanceSummaryRow(worked, weeklyOff)).toBe(true);
    expect(preferMyAttendanceSummaryRow(weeklyOff, worked)).toBe(false);
  });
});

describe("preferMyRosterDayRow", () => {
  it("prefers week-off over on-duty sibling site", () => {
    expect(preferMyRosterDayRow({ isWeekOff: true }, { isWeekOff: false })).toBe(true);
    expect(preferMyRosterDayRow({ isWeekOff: false }, { isWeekOff: true })).toBe(false);
  });
});

describe("sumEmployeePeriodHours", () => {
  it("excludes roster week-off days even when summary is Absent with 9h scheduled", () => {
    const byDate = new Map([
      [
        "2026-10-21",
        {
          workDate: "2026-10-21",
          status: "absent",
          actualIn: null,
          actualOut: null,
          workedMinutes: 0,
          scheduledIn: "2026-10-21T06:00:00.000Z",
          scheduledOut: "2026-10-21T15:00:00.000Z",
        },
      ],
      [
        "2026-10-22",
        {
          workDate: "2026-10-22",
          status: "present",
          actualIn: "2026-10-22T05:00:00.000Z",
          actualOut: "2026-10-22T15:00:00.000Z",
          workedMinutes: 600,
          scheduledIn: "2026-10-22T06:00:00.000Z",
          scheduledOut: "2026-10-22T15:00:00.000Z",
        },
      ],
    ]);
    const rosterByDate = new Map([
      [
        "2026-10-21",
        {
          workDate: "2026-10-21",
          shiftStart: null,
          shiftEnd: null,
          isWeekOff: true,
        },
      ],
      [
        "2026-10-22",
        {
          workDate: "2026-10-22",
          shiftStart: "09:00",
          shiftEnd: "18:00",
          isWeekOff: false,
        },
      ],
    ]);

    const totals = sumEmployeePeriodHours(
      byDate,
      rosterByDate,
      "2026-10-21",
      "2026-10-22",
      "2026-10-25",
    );

    // 21st must not add 9h required; 22nd contributes ~10h worked / 9h required from schedule.
    expect(totals.requiredHours).toBe(9);
    expect(totals.workedHours).toBe(10);
    expect(totals.shortfallHours).toBe(0);
  });

  it("excludes WO day showing worked/required hours (Oct 25 style)", () => {
    const byDate = new Map([
      [
        "2026-10-25",
        {
          workDate: "2026-10-25",
          status: "absent",
          actualIn: "2026-10-25T08:00:00.000Z",
          actualOut: "2026-10-25T10:21:36.000Z",
          workedMinutes: 142,
          scheduledIn: "2026-10-25T06:00:00.000Z",
          scheduledOut: "2026-10-25T15:00:00.000Z",
          missedPunch: true,
        },
      ],
    ]);
    const rosterByDate = new Map([
      [
        "2026-10-25",
        {
          workDate: "2026-10-25",
          shiftStart: "09:00",
          shiftEnd: "18:00",
          isWeekOff: true,
        },
      ],
    ]);

    const totals = sumEmployeePeriodHours(
      byDate,
      rosterByDate,
      "2026-10-25",
      "2026-10-25",
      "2026-10-25",
    );

    expect(totals.workedHours).toBe(0);
    expect(totals.requiredHours).toBe(0);
    expect(totals.shortfallHours).toBe(0);
  });

  it("excludes compensatory off from required hours", () => {
    const byDate = new Map([
      [
        "2026-10-10",
        {
          workDate: "2026-10-10",
          status: "comp_off",
          actualIn: null,
          actualOut: null,
          scheduledIn: "2026-10-10T06:00:00.000Z",
          scheduledOut: "2026-10-10T15:00:00.000Z",
        },
      ],
    ]);
    const rosterByDate = new Map([
      [
        "2026-10-10",
        {
          workDate: "2026-10-10",
          shiftStart: "09:00",
          shiftEnd: "18:00",
          isWeekOff: false,
          leaveType: "comp_off",
        },
      ],
    ]);

    expect(
      sumEmployeePeriodHours(byDate, rosterByDate, "2026-10-10", "2026-10-10", "2026-10-25"),
    ).toEqual({ workedHours: 0, requiredHours: 0, shortfallHours: 0 });
  });

  it("excludes annual leave from worked and required hours", () => {
    const byDate = new Map([
      [
        "2026-10-12",
        {
          workDate: "2026-10-12",
          status: "absent",
          actualIn: null,
          actualOut: null,
          scheduledIn: "2026-10-12T06:00:00.000Z",
          scheduledOut: "2026-10-12T15:00:00.000Z",
        },
      ],
    ]);
    const rosterByDate = new Map([
      [
        "2026-10-12",
        {
          workDate: "2026-10-12",
          shiftStart: "09:00",
          shiftEnd: "18:00",
          isWeekOff: false,
          leaveType: "annual_leave",
        },
      ],
    ]);

    expect(
      sumEmployeePeriodHours(byDate, rosterByDate, "2026-10-12", "2026-10-12", "2026-10-25"),
    ).toEqual({ workedHours: 0, requiredHours: 0, shortfallHours: 0 });
  });
});
