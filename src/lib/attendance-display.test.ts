import { describe, expect, it } from "vitest";

import {
  attendanceDateRange,
  attendanceListingCells,
  formatPunchTime12h,
  formatWorkDateDdMmYyyy,
  getAttendanceStatusDisplay,
} from "./attendance-display";
import { attendanceHrToListingSource, type AttendanceHrReportRow } from "./attendance-hr/report";

describe("attendance listing display", () => {
  it("defaults the month preset to the FEC 28–27 cycle", () => {
    expect(attendanceDateRange("month", "2026-08-15")).toEqual({ from: "2026-07-28", to: "2026-08-27" });
    expect(attendanceDateRange("month", "2026-08-28")).toEqual({ from: "2026-08-28", to: "2026-09-27" });
  });
  it("formats work date as DD-MM-YYYY", () => {
    expect(formatWorkDateDdMmYyyy("2026-08-25")).toBe("25-08-2026");
  });

  it("formats punch time as 12-hour Qatar time with seconds", () => {
    expect(formatPunchTime12h("2026-08-25T07:17:44.000Z")).toMatch(/10:17:44\s*AM/);
    expect(formatPunchTime12h(null)).toBe("");
  });

  it("styles missed punch and missing punch statuses with full-row tints", () => {
    const missed = getAttendanceStatusDisplay({
      status: "missed_punch",
      missed_punch: true,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: null,
    });
    expect(missed.label).toBe("Missed punch");
    expect(missed.badgeClass).toMatch(/amber/);
    expect(missed.rowClass).toMatch(/amber/);
    expect(missed.rowClass).toMatch(/\[&>td\]:bg-/);

    const aliased = getAttendanceStatusDisplay({
      status: "incomplete",
      missed_punch: false,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: null,
    });
    expect(aliased.label).toBe("Missed punch");
    expect(aliased.rowClass).toMatch(/amber/);

    const missing = getAttendanceStatusDisplay({
      status: "absent",
      missed_punch: false,
      actual_in: null,
      actual_out: null,
    });
    expect(missing.label).toBe("Missing Punch");
    expect(missing.badgeClass).toMatch(/rose/);

    const complete = getAttendanceStatusDisplay({
      status: "present",
      missed_punch: false,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: "2026-08-25T16:00:00.000Z",
    });
    expect(complete.label).toBe("Complete");
  });

  it("maps HR rows onto the people listing columns", () => {
    const row: AttendanceHrReportRow = {
      id: "1",
      location_id: "loc-1",
      staff_id: "staff-1",
      biometric_user_id: "9",
      work_date: "2026-08-25",
      status: "missed_punch",
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      missed_punch: true,
      punch_count: 1,
      worked_minutes: null,
      employment_type: "permanent",
      staff_name: "Ahmed Ali",
      employee_code: "E3-012",
      qid: null,
      location_code: "INF-CC",
      location_name: "Inflatapark",
      location_region: "City Center Doha",
    };
    const listing = attendanceHrToListingSource(row);
    expect(listing.locationLabel).toBe("INF-CC — Inflatapark - City Center Doha");
    expect(listing.userName).toBe("Ahmed Ali");
    expect(listing.deviceUserId).toBe("9");
    expect(listing.systemUserId).toBe("staff-1");
    expect(listing.break_minutes).toBe(60);
    const cells = attendanceListingCells(listing);
    expect(cells.date).toBe("25-08-2026");
    expect(cells.firstCheckIn).toMatch(/10:17:44\s*AM/);
    expect(cells.lastCheckOut).toBe("—");
    expect(cells.deviceUserId).toBe("9");
    expect(cells.systemUserId).toBe("staff-1");
    expect(cells.overtime).toBe("No");
    expect(cells.overtimeHours).toBe("—");
    expect(cells.status).toBe("Missed punch");
  });

  it("tints weekly off rows and keeps the Weekly off label", () => {
    const weekly = getAttendanceStatusDisplay({
      status: "weekly_off",
      missed_punch: false,
      actual_in: null,
      actual_out: null,
    });
    expect(weekly.label).toBe("Weekly off");
    expect(weekly.rowClass).toMatch(/sky/);
    expect(weekly.rowClass).toMatch(/\[&>td\]:bg-/);

    const aliased = getAttendanceStatusDisplay({
      status: "week_off",
      missed_punch: false,
      actual_in: null,
      actual_out: null,
    });
    expect(aliased.label).toBe("Weekly off");
    expect(aliased.rowClass).toBe(weekly.rowClass);
  });

  it("prefers stored worked_minutes for total hours", () => {
    const cells = attendanceListingCells({
      locationLabel: "INF-CC",
      userName: "Test",
      deviceUserId: "12",
      systemUserId: "uuid-1",
      work_date: "2026-08-25",
      actual_in: "2026-08-25T07:00:00.000Z",
      actual_out: "2026-08-25T17:00:00.000Z",
      overtime_minutes: 0,
      worked_minutes: 480,
      break_minutes: 60,
      status: "present",
      missed_punch: false,
    });
    expect(cells.totalHours).toBe("8.00");
  });
});
