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

  it("tints only missed punch rows; other statuses stay untinted", () => {
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
    expect(missing.label).toBe("Absent");
    expect(missing.badgeClass).toMatch(/rose/);
    expect(missing.rowClass).toBe("");

    const lateButFullHours = getAttendanceStatusDisplay({
      status: "late",
      missed_punch: false,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: "2026-08-25T17:30:00.000Z",
      worked_minutes: 540,
      expected_minutes: 540,
    });
    expect(lateButFullHours.label).toBe("Present");
    expect(lateButFullHours.badgeClass).toMatch(/emerald/);
    expect(lateButFullHours.rowClass).toBe("");

    const shortHours = getAttendanceStatusDisplay({
      status: "late",
      missed_punch: false,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: "2026-08-25T16:00:00.000Z",
      worked_minutes: 480,
      expected_minutes: 540,
    });
    expect(shortHours.label).toBe("Late");
    expect(shortHours.badgeClass).toMatch(/amber/);
    expect(shortHours.rowClass).toBe("");

    const legacyShortHoursStatus = getAttendanceStatusDisplay({
      status: "short_hours",
      missed_punch: false,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: "2026-08-25T16:00:00.000Z",
      worked_minutes: 480,
      expected_minutes: 540,
    });
    expect(legacyShortHoursStatus.label).toBe("Late");

    const complete = getAttendanceStatusDisplay({
      status: "present",
      missed_punch: false,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: "2026-08-25T16:18:00.000Z",
      worked_minutes: 540,
      expected_minutes: 540,
    });
    expect(complete.label).toBe("Present");
    expect(complete.rowClass).toBe("");
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
    expect(listing.break_minutes).toBe(60);
    const cells = attendanceListingCells(listing);
    expect(cells.date).toBe("25-08-2026");
    expect(cells.reportingTime).toBe("—");
    expect(cells.firstCheckIn).toMatch(/10:17:44\s*AM/);
    expect(cells.lastCheckOut).toBe("—");
    expect(cells.deviceUserId).toBe("9");
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

  it("uses check-out minus check-in for total hours even when stored minutes deducted a break", () => {
    const cells = attendanceListingCells({
      locationLabel: "INF-CC",
      userName: "Test",
      deviceUserId: "12",
      work_date: "2026-08-25",
      actual_in: "2026-08-25T07:00:00.000Z",
      actual_out: "2026-08-25T17:00:00.000Z",
      overtime_minutes: 0,
      late_minutes: 0,
      worked_minutes: 480,
      break_minutes: 60,
      expected_minutes: 540,
      status: "present",
      missed_punch: false,
    });
    expect(cells.totalHours).toBe("10.00");
    expect(cells.latePunch).toBe("—");
  });

  it("does not deduct the 1h break from Wasanthi 27-Aug clock time", () => {
    const cells = attendanceListingCells({
      locationLabel: "INF-CC — Inflatapark - City Center Doha",
      userName: "WASANTHI",
      deviceUserId: "9",
      work_date: "2026-08-27",
      // 10:26:31 AM → 8:06:26 PM Qatar
      actual_in: "2026-08-27T07:26:31.000Z",
      actual_out: "2026-08-27T17:06:26.000Z",
      overtime_minutes: 40,
      late_minutes: 26,
      worked_minutes: 520, // stale net after 1h break
      break_minutes: 60,
      expected_minutes: 540,
      employment_type: "permanent",
      status: "late",
      missed_punch: false,
    });
    expect(cells.totalHours).toBe("9.67");
    expect(cells.overtime).toBe("Yes");
    expect(cells.overtimeHours).toBe("0.67");
    expect(cells.status).toBe("Present");
    expect(cells.latePunch).toBe("26");
  });

  it("formats late punch with one decimal minute when fractional", () => {
    const cells = attendanceListingCells({
      locationLabel: "INF-CC",
      userName: "Test",
      deviceUserId: "1",
      work_date: "2026-08-27",
      actual_in: "2026-08-27T07:16:30.000Z",
      actual_out: "2026-08-27T17:00:00.000Z",
      // roster 10:30; reporting 30 → display 10:00
      scheduled_in: "2026-08-27T07:30:00.000Z",
      reporting_time_minutes: 30,
      overtime_minutes: 0,
      late_minutes: 1.5,
      worked_minutes: 540,
      break_minutes: 60,
      expected_minutes: 540,
      status: "present",
      missed_punch: false,
    });
    expect(cells.reportingTime).toBe("10:00 AM");
    expect(cells.latePunch).toBe("1.5");
  });

  it("live-computes reporting clock from roster start minus site minutes", () => {
    const cells = attendanceListingCells({
      locationLabel: "INF-CC",
      userName: "Test",
      deviceUserId: "1",
      work_date: "2026-08-27",
      actual_in: null,
      actual_out: null,
      scheduled_in: "2026-08-27T08:00:00.000Z", // roster 11:00
      reporting_time_minutes: 30,
      overtime_minutes: 0,
      late_minutes: 0,
      worked_minutes: null,
      break_minutes: 60,
      expected_minutes: 540,
      status: "absent",
      missed_punch: false,
    });
    expect(cells.reportingTime).toBe("10:30 AM");
  });

  it("shows OT as clock hours − expected when over 9h permanent", () => {
    const cells = attendanceListingCells({
      locationLabel: "INF-CC",
      userName: "WASANTHI",
      deviceUserId: "9",
      work_date: "2026-08-25",
      actual_in: "2026-08-25T07:30:13.000Z",
      actual_out: "2026-08-25T17:35:44.000Z",
      overtime_minutes: 66,
      late_minutes: 30,
      worked_minutes: 546,
      break_minutes: 60,
      expected_minutes: 540,
      employment_type: "permanent",
      status: "present",
      missed_punch: false,
    });
    expect(cells.totalHours).toBe("10.09");
    expect(cells.overtime).toBe("Yes");
    expect(cells.overtimeHours).toBe("1.08");
    expect(cells.status).toBe("Present");
    expect(cells.latePunch).toBe("30");
  });
});
