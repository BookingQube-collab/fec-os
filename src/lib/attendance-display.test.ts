import { describe, expect, it } from "vitest";

import {
  attendanceListingCells,
  formatPunchTime12h,
  formatWorkDateDdMmYyyy,
  getAttendanceStatusDisplay,
} from "./attendance-display";
import { attendanceHrToListingSource, type AttendanceHrReportRow } from "./attendance-hr/report";

describe("attendance listing display", () => {
  it("formats work date as DD-MM-YYYY", () => {
    expect(formatWorkDateDdMmYyyy("2026-08-25")).toBe("25-08-2026");
  });

  it("formats punch time as 12-hour Qatar time with seconds", () => {
    expect(formatPunchTime12h("2026-08-25T07:17:44.000Z")).toMatch(/10:17:44\s*AM/);
    expect(formatPunchTime12h(null)).toBe("");
  });

  it("styles incomplete and missing punch statuses", () => {
    const incomplete = getAttendanceStatusDisplay({
      status: "missed_punch",
      missed_punch: true,
      actual_in: "2026-08-25T07:17:44.000Z",
      actual_out: null,
    });
    expect(incomplete.label).toBe("Incomplete");
    expect(incomplete.badgeClass).toMatch(/amber/);

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
      staff_name: "Ahmed Ali",
      employee_code: "E3-012",
      qid: null,
      location_code: "INF-CC",
      location_name: "Inflatapark",
      location_region: "City Center Doha",
    };
    const listing = attendanceHrToListingSource(row);
    expect(listing.locationLabel).toBe("Inflatapark - City Center Doha");
    expect(listing.userName).toBe("Ahmed Ali");
    const cells = attendanceListingCells(listing);
    expect(cells.date).toBe("25-08-2026");
    expect(cells.firstCheckIn).toMatch(/10:17:44\s*AM/);
    expect(cells.lastCheckOut).toBe("—");
    expect(cells.overtime).toBe("No");
    expect(cells.overtimeHours).toBe("—");
    expect(cells.status).toBe("Incomplete");
  });
});
