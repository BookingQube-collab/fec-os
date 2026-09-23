import { describe, expect, it } from "vitest";

import {
  attendanceGridCellContent,
  attendanceGridTone,
  attendanceListingStaffKey,
  buildAttendanceMatrix,
  rosterMatrixCellKey,
} from "./attendance-matrix";
import type { AttendanceListingSource } from "@/lib/attendance-display";

function listing(partial: Partial<AttendanceListingSource> & Pick<AttendanceListingSource, "work_date">): AttendanceListingSource {
  return {
    id: partial.id ?? "r1",
    staffKey: partial.staffKey,
    locationLabel: partial.locationLabel ?? "INF-CC — Site",
    userName: partial.userName ?? "Ada",
    userNameUnmapped: partial.userNameUnmapped,
    deviceUserId: partial.deviceUserId ?? "9",
    employeeCode: partial.employeeCode ?? "INF-CC-STF01",
    qid: partial.qid ?? null,
    work_date: partial.work_date,
    actual_in: partial.actual_in ?? null,
    actual_out: partial.actual_out ?? null,
    scheduled_in: partial.scheduled_in ?? null,
    scheduled_out: partial.scheduled_out ?? null,
    overtime_minutes: partial.overtime_minutes ?? 0,
    late_minutes: partial.late_minutes ?? 0,
    worked_minutes: partial.worked_minutes ?? null,
    expected_minutes: partial.expected_minutes,
    status: partial.status ?? "present",
    missed_punch: partial.missed_punch ?? false,
  };
}

describe("attendance matrix", () => {
  it("groups day rows onto one sticky staff line across the period", () => {
    const rows = [
      listing({
        id: "1",
        staffKey: "staff:a",
        userName: "Ada",
        work_date: "2026-07-28",
        actual_in: "2026-07-28T07:00:00.000Z",
        actual_out: "2026-07-28T16:00:00.000Z",
      }),
      listing({
        id: "2",
        staffKey: "staff:a",
        userName: "Ada",
        work_date: "2026-07-29",
        status: "weekly_off",
      }),
      listing({
        id: "3",
        staffKey: "staff:b",
        userName: "Bob",
        employeeCode: "B1",
        work_date: "2026-07-28",
        status: "missed_punch",
        missed_punch: true,
        actual_in: "2026-07-28T07:20:00.000Z",
      }),
    ];

    const matrix = buildAttendanceMatrix(rows, "2026-07-28", "2026-07-29");
    expect(matrix.dates).toEqual(["2026-07-28", "2026-07-29"]);
    expect(matrix.staff.map((s) => s.staffId)).toEqual(["staff:a", "staff:b"]);
    expect(matrix.byStaffDate.get(rosterMatrixCellKey("staff:a", "2026-07-28"))).toHaveLength(1);
    expect(matrix.byStaffDate.get(rosterMatrixCellKey("staff:a", "2026-07-29"))?.[0]?.status).toBe("weekly_off");
    expect(matrix.monthSpans).toEqual([{ monthKey: "2026-07", startIdx: 0, count: 2 }]);
  });

  it("encodes late / missed / off tones for compact cells", () => {
    expect(
      attendanceGridTone(
        listing({
          work_date: "2026-08-01",
          status: "late",
          late_minutes: 12,
          actual_in: "2026-08-01T07:20:00.000Z",
          actual_out: "2026-08-01T16:00:00.000Z",
        }),
      ),
    ).toBe("late");

    const lateCell = attendanceGridCellContent(
      listing({
        work_date: "2026-08-01",
        status: "late",
        late_minutes: 12,
        actual_in: "2026-08-01T07:20:00.000Z",
        actual_out: "2026-08-01T16:00:00.000Z",
      }),
    );
    expect(lateCell.tone).toBe("late");
    expect(lateCell.secondary).toBeTruthy();
    expect(lateCell.meta).toMatch(/L/);

    expect(
      attendanceGridTone(
        listing({
          work_date: "2026-08-02",
          status: "missed_punch",
          missed_punch: true,
          actual_in: "2026-08-02T07:00:00.000Z",
        }),
      ),
    ).toBe("missed_punch");

    // Stale missed_punch flag with both punches must not tint Missed (flexible unlock)
    expect(
      attendanceGridTone(
        listing({
          work_date: "2026-09-20",
          status: "missed_punch",
          missed_punch: true,
          actual_in: "2026-09-20T07:13:41.000Z",
          actual_out: "2026-09-20T16:13:41.000Z", // exactly 9h → meets permanent expected
          worked_minutes: 540,
          expected_minutes: 540,
        }),
      ),
    ).toBe("present");

    expect(attendanceGridTone(listing({ work_date: "2026-08-03", status: "weekly_off" }))).toBe("weekly_off");
    expect(attendanceListingStaffKey(listing({ work_date: "2026-08-03", staffKey: "staff:x" }))).toBe("staff:x");
  });
});
