import { describe, expect, it } from "vitest";

import { aggregateDashboardPeriod, attendanceReportRowToDashboardDay } from "./dashboard";
import { computeAttendanceHrReportKpis, type AttendanceHrReportRow } from "./report";
import { suppressAbsentWithoutOnDutyRoster } from "./punch-over-absent";
import { attendanceSharedKpiFlags, computeSharedAttendanceKpis } from "./shared-kpis";

describe("attendanceSharedKpiFlags / computeSharedAttendanceKpis", () => {
  it("counts late minutes as Late while still Present when hours meet expected", () => {
    const row = {
      staff_id: "a",
      status: "late",
      actual_in: "2024-08-25T07:20:00.000Z",
      actual_out: "2024-08-25T17:20:00.000Z",
      late_minutes: 130,
      worked_minutes: 540,
      expected_minutes: 540,
      employment_type: "permanent",
      work_date: "2024-08-25",
    };
    expect(attendanceSharedKpiFlags(row)).toMatchObject({
      present: true,
      late: true,
      absent: false,
      missedPunch: false,
    });
    expect(computeSharedAttendanceKpis([row])).toMatchObject({
      present: 1,
      late: 1,
      uniqueStaff: 1,
    });
  });

  it("defers Missed punch until the day is closed (open incomplete stays Present/Working)", () => {
    const open = {
      staff_id: "mary",
      status: "missed_punch",
      missed_punch: true,
      actual_in: "2099-06-15T07:41:00.000Z",
      actual_out: null,
      scheduled_out: "2099-06-15T17:00:00.000Z",
      late_minutes: 0,
      work_date: "2099-06-15",
      employment_type: "permanent",
      expected_minutes: 540,
    };
    expect(attendanceSharedKpiFlags(open).missedPunch).toBe(false);
    expect(attendanceSharedKpiFlags(open).present).toBe(true);

    const closed = {
      ...open,
      actual_in: "2024-06-15T07:41:00.000Z",
      scheduled_out: "2024-06-15T17:00:00.000Z",
      work_date: "2024-06-15",
    };
    expect(attendanceSharedKpiFlags(closed).missedPunch).toBe(true);
    expect(attendanceSharedKpiFlags(closed).present).toBe(false);
  });

  it("does not inflate Staff with unmapped biometric rows", () => {
    const kpis = computeSharedAttendanceKpis([
      {
        staff_id: "a",
        status: "present",
        actual_in: "2024-05-01T05:00:00.000Z",
        actual_out: "2024-05-01T15:00:00.000Z",
        worked_minutes: 540,
        expected_minutes: 540,
        work_date: "2024-05-01",
      },
      {
        staff_id: null,
        status: "unscheduled",
        actual_in: null,
        actual_out: null,
        work_date: "2024-05-01",
      },
    ]);
    expect(kpis.uniqueStaff).toBe(1);
    expect(kpis.total).toBe(2);
    expect(kpis.unscheduled).toBe(1);
  });

  it("treats stale absent + both punches as Present (listing parity)", () => {
    const flags = attendanceSharedKpiFlags({
      staff_id: "a",
      status: "absent",
      missed_punch: true,
      actual_in: "2024-05-01T05:00:00.000Z",
      actual_out: "2024-05-01T14:00:00.000Z",
      worked_minutes: 480,
      expected_minutes: 480,
      work_date: "2024-05-01",
    });
    expect(flags.present).toBe(true);
    expect(flags.absent).toBe(false);
    expect(flags.missedPunch).toBe(false);
  });

  it("keeps Dashboard aggregate Present/Late/Missed aligned with the shared helper", () => {
    const loc = "11111111-1111-4111-8111-111111111111";
    const rows = [
      {
        location_id: loc,
        staff_id: "a",
        biometric_user_id: null,
        work_date: "2024-08-25",
        actual_in: "2024-08-25T07:20:00.000Z",
        actual_out: "2024-08-25T17:20:00.000Z",
        status: "late",
        late_minutes: 130,
        missed_punch: false,
        punch_count: 2,
        worked_minutes: 540,
        expected_minutes: 540,
        employment_type: "permanent",
      },
      {
        location_id: loc,
        staff_id: "b",
        biometric_user_id: null,
        work_date: "2024-06-15",
        actual_in: "2024-06-15T07:41:00.000Z",
        actual_out: null,
        scheduled_out: "2024-06-15T17:00:00.000Z",
        status: "missed_punch",
        late_minutes: 0,
        missed_punch: true,
        punch_count: 1,
      },
      {
        location_id: loc,
        staff_id: "c",
        biometric_user_id: null,
        work_date: "2024-06-15",
        actual_in: null,
        actual_out: null,
        status: "absent",
        late_minutes: 0,
        missed_punch: false,
        punch_count: 0,
      },
    ];
    const shared = computeSharedAttendanceKpis(rows);
    const agg = aggregateDashboardPeriod(rows, [{ id: loc, code: "INF-CC", name: "InflataPark" }], loc);
    expect(agg.present).toBe(shared.present);
    expect(agg.absent).toBe(shared.absent);
    expect(agg.late).toBe(shared.late);
    expect(agg.missedPunches).toBe(shared.missedPunch);
    expect(agg.uniqueStaff).toBe(shared.uniqueStaff);
    expect(agg.bySite[0].in).toBe(shared.present);
    expect(agg.bySite[0].late).toBe(shared.late);
  });

  it("matches listing KPIs after week-off / unrostered Absent cleanup (dashboard row set)", () => {
    const loc = "11111111-1111-4111-8111-111111111111";
    const raw = [
      {
        id: "1",
        location_id: loc,
        staff_id: "off-staff",
        biometric_user_id: null,
        work_date: "2026-10-05",
        status: "absent",
        actual_in: null,
        actual_out: null,
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 0,
        missed_punch: false,
        punch_count: 0,
        worked_minutes: null,
        employment_type: "permanent",
        staff_name: "Week Off",
        employee_code: "W1",
        qid: null,
        location_code: "INF-CC",
        location_name: "InflataPark",
        location_region: null,
      },
      {
        id: "2",
        location_id: loc,
        staff_id: "ghost",
        biometric_user_id: null,
        work_date: "2026-10-05",
        status: "absent",
        actual_in: null,
        actual_out: null,
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 0,
        missed_punch: false,
        punch_count: 0,
        worked_minutes: null,
        employment_type: "permanent",
        staff_name: "No Roster",
        employee_code: "G1",
        qid: null,
        location_code: "INF-CC",
        location_name: "InflataPark",
        location_region: null,
      },
      {
        id: "3",
        location_id: loc,
        staff_id: "on-duty",
        biometric_user_id: null,
        work_date: "2026-10-06",
        status: "present",
        actual_in: "2026-10-06T05:00:00.000Z",
        actual_out: "2026-10-06T14:00:00.000Z",
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 0,
        missed_punch: false,
        punch_count: 2,
        worked_minutes: 540,
        expected_minutes: 540,
        employment_type: "permanent",
        staff_name: "Present",
        employee_code: "P1",
        qid: null,
        location_code: "INF-CC",
        location_name: "InflataPark",
        location_region: null,
      },
    ] satisfies AttendanceHrReportRow[];

    // Raw summary Absents would inflate Dashboard before listing cleanup.
    expect(computeAttendanceHrReportKpis(raw).absent).toBe(2);

    const cleaned = suppressAbsentWithoutOnDutyRoster({
      rows: raw as unknown as Array<Record<string, unknown>>,
      roster: [
        { staff_id: "off-staff", work_date: "2026-10-05", is_week_off: true },
        { staff_id: "on-duty", work_date: "2026-10-06", is_week_off: false },
      ],
    }) as unknown as AttendanceHrReportRow[];

    const listingKpis = computeAttendanceHrReportKpis(cleaned);
    const dayRows = cleaned.map(attendanceReportRowToDashboardDay);
    const dashAgg = aggregateDashboardPeriod(
      dayRows,
      [{ id: loc, code: "INF-CC", name: "InflataPark" }],
      loc,
    );

    expect(listingKpis.absent).toBe(0);
    expect(listingKpis.present).toBe(1);
    expect(listingKpis.uniqueStaff).toBe(2); // week-off staff + present staff remain
    expect(dashAgg.absent).toBe(listingKpis.absent);
    expect(dashAgg.present).toBe(listingKpis.present);
    expect(dashAgg.late).toBe(listingKpis.late);
    expect(dashAgg.missedPunches).toBe(listingKpis.missedPunch);
    expect(dashAgg.uniqueStaff).toBe(listingKpis.uniqueStaff);
    expect(dashAgg.bySite[0].in).toBe(listingKpis.present);
  });
});
