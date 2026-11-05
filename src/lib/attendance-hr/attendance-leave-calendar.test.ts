import { describe, expect, it } from "vitest";

import {
  aggregateCalendarDays,
  aggregateCalendarKpis,
  buildAttendanceExceptions,
  calendarKpiPercent,
  calendarMonthBounds,
  calendarStatusCode,
  calendarWeekBounds,
  dayCellSummaryParts,
  formatDayCellSummary,
  locationShortageHints,
  type CalendarLocationBreakdown,
} from "@/lib/attendance-hr/attendance-leave-calendar";
import type { AttendanceHrReportRow } from "@/lib/attendance-hr/report";
import { attendanceHrToListingSource } from "@/lib/attendance-hr/report";

function row(partial: Partial<AttendanceHrReportRow> & Pick<AttendanceHrReportRow, "id" | "work_date" | "status">): AttendanceHrReportRow {
  return {
    location_id: "loc-1",
    staff_id: partial.staff_id ?? `staff-${partial.id}`,
    biometric_user_id: null,
    actual_in: null,
    actual_out: null,
    late_minutes: 0,
    early_leave_minutes: 0,
    overtime_minutes: 0,
    missed_punch: false,
    punch_count: 0,
    worked_minutes: null,
    employment_type: "permanent",
    staff_name: partial.staff_name ?? "Test Person",
    employee_code: "E1",
    qid: null,
    location_code: "INF-CC",
    location_name: "InflataPark",
    location_region: null,
    has_roster_assignment: true,
    scheduled_in: "2026-11-05T05:00:00.000Z",
    scheduled_out: "2026-11-05T14:00:00.000Z",
    ...partial,
  };
}

describe("attendance-leave-calendar helpers", () => {
  it("builds calendar month bounds", () => {
    expect(calendarMonthBounds("2026-11")).toEqual({ dateFrom: "2026-11-01", dateTo: "2026-11-30" });
  });

  it("builds Monday-start week bounds", () => {
    expect(calendarWeekBounds("2026-11-05")).toEqual({ dateFrom: "2026-11-02", dateTo: "2026-11-08" });
  });

  it("aggregates past actuals and keeps late as present subset", () => {
    const today = "2026-11-05";
    const rows = [
      row({
        id: "1",
        work_date: today,
        status: "present",
        actual_in: "2026-11-05T05:05:00.000Z",
        actual_out: "2026-11-05T14:00:00.000Z",
        late_minutes: 12,
        staff_id: "a",
      }),
      row({ id: "2", work_date: today, status: "absent", staff_id: "b" }),
      row({ id: "3", work_date: today, status: "annual_leave", staff_id: "c" }),
      row({ id: "4", work_date: today, status: "weekly_off", staff_id: "d" }),
    ];
    const kpis = aggregateCalendarKpis(rows, today, { today });
    expect(kpis.present).toBe(1);
    expect(kpis.late).toBe(1);
    expect(kpis.absent).toBe(1);
    expect(kpis.leave).toBe(1);
    expect(kpis.weekOff).toBe(1);
    expect(kpis.present + kpis.absent + kpis.leave + kpis.weekOff).toBe(4);
  });

  it("never confirms future attendance as present", () => {
    const today = "2026-11-05";
    const future = "2026-11-10";
    const rows = [
      row({
        id: "1",
        work_date: future,
        status: "present",
        actual_in: "2026-11-10T05:00:00.000Z",
        staff_id: "a",
      }),
      row({ id: "2", work_date: future, status: "annual_leave", staff_id: "b" }),
      row({ id: "3", work_date: future, status: "weekly_off", staff_id: "c" }),
    ];
    const days = aggregateCalendarDays(rows, { today });
    const day = days.find((d) => d.workDate === future)!;
    expect(day.isFuture).toBe(true);
    expect(day.buckets.present).toBe(0);
    expect(day.buckets.absent).toBe(0);
    expect(day.buckets.late).toBe(0);
    expect(day.buckets.scheduled).toBe(1);
    expect(day.buckets.leave).toBe(1);
    expect(day.buckets.weekOff).toBe(1);
    expect(formatDayCellSummary(day)).toContain("S 1");
    expect(formatDayCellSummary(day)).toContain("L 1");
    expect(dayCellSummaryParts(day)).toEqual(
      expect.arrayContaining([
        { code: "S", count: 1 },
        { code: "L", count: 1 },
        { code: "WO", count: 1 },
      ]),
    );
  });

  it("includes LT in past day cell parts when late count > 0", () => {
    const agg = {
      workDate: "2026-11-05",
      isToday: true,
      isFuture: false,
      buckets: {
        scheduled: 10,
        present: 8,
        absent: 1,
        leave: 1,
        late: 2,
        weekOff: 0,
        holiday: 0,
        missedPunch: 0,
      },
    };
    expect(dayCellSummaryParts(agg)).toEqual([
      { code: "P", count: 8 },
      { code: "A", count: 1 },
      { code: "L", count: 1 },
      { code: "LT", count: 2 },
    ]);
    expect(formatDayCellSummary(agg)).toBe("P 8 | A 1 | L 1 | LT 2");
  });

  it("maps calendar codes including late subset", () => {
    const listing = attendanceHrToListingSource(
      row({
        id: "1",
        work_date: "2026-11-05",
        status: "present",
        late_minutes: 8,
        actual_in: "2026-11-05T05:10:00.000Z",
        actual_out: "2026-11-05T14:00:00.000Z",
      }),
    );
    expect(calendarStatusCode(listing)).toBe("LT");
  });

  it("builds exception groups and shortage hints", () => {
    const today = "2026-11-05";
    const rows = [
      row({ id: "1", work_date: today, status: "absent", staff_name: "Absent One", staff_id: "a" }),
      row({
        id: "2",
        work_date: today,
        status: "present",
        late_minutes: 9,
        actual_in: "2026-11-05T05:20:00.000Z",
        actual_out: "2026-11-05T14:00:00.000Z",
        staff_name: "Late Two",
        staff_id: "b",
      }),
    ];
    const exceptions = buildAttendanceExceptions(rows, today, { today });
    expect(exceptions.some((g) => g.kind === "absent" && g.names.includes("Absent One"))).toBe(true);
    expect(exceptions.some((g) => g.kind === "late" && g.names.includes("Late Two"))).toBe(true);

    const locations: CalendarLocationBreakdown[] = [
      {
        locationId: "loc-1",
        locationCode: "INF-CC",
        locationName: "InflataPark",
        buckets: {
          scheduled: 10,
          present: 5,
          absent: 3,
          leave: 1,
          late: 1,
          weekOff: 0,
          holiday: 0,
          missedPunch: 0,
        },
      },
    ];
    expect(locationShortageHints(locations)[0]?.coveragePct).toBe(60);
    expect(calendarKpiPercent(5, 10)).toBe(50);
  });
});
