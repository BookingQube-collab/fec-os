import { describe, expect, it } from "vitest";

import { expectedOnDutyStaffIds, expectedRowsForDay, isWorkDateCovered } from "./roster-expected";
import {
  attendanceRosterPeriod,
  buildAttendanceRosterPreview,
  matchAttendanceRosterStaff,
  parseDutyCell,
  parseRosterDateCell,
  parseShiftRange,
  parseTimeCell,
  qatarWeekBounds,
} from "./roster-upload";
import { parseCsv } from "@/lib/csv-parse";

const INF = "11111111-1111-4111-8111-111111111111";
const KDS = "22222222-2222-4222-8222-222222222222";

const locations = [
  { id: INF, code: "INF-CC", name: "InflataPark", region: "City Center" },
  { id: KDS, code: "KDS-CC", name: "Kids Driving School", region: "City Center" },
];

const staff = [
  {
    id: "s-hassan",
    full_name: "Hassan Al-Kaabi",
    employee_code: "KDS-CC-BM",
    qid: "28911234567",
    location_id: KDS,
    work_location_ids: [] as string[],
  },
  {
    id: "s-sara",
    full_name: "Sara Khan",
    employee_code: "INF-CC-STF01",
    qid: "28919876543",
    location_id: INF,
    work_location_ids: [KDS],
  },
  {
    id: "s-twin-a",
    full_name: "Ahmed Ali",
    employee_code: "INF-CC-STF02",
    qid: "11111111111",
    location_id: INF,
    work_location_ids: [] as string[],
  },
  {
    id: "s-twin-b",
    full_name: "Ahmed Ali",
    employee_code: "KDS-CC-STF01",
    qid: "22222222222",
    location_id: KDS,
    work_location_ids: [] as string[],
  },
];

describe("attendance roster period", () => {
  it("snaps a mid-week date to Sunday–Saturday in Qatar", () => {
    expect(qatarWeekBounds("2026-08-17")).toEqual({ dateFrom: "2026-08-16", dateTo: "2026-08-22" });
  });

  it("uses the whole month for month mode", () => {
    expect(attendanceRosterPeriod({ mode: "month", month: "2026-08" })).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
  });
});

describe("parse helpers", () => {
  it("reads duty off/yes and shift ranges", () => {
    expect(parseDutyCell("Off")).toEqual({ isWeekOff: true, known: true });
    expect(parseDutyCell("Yes")).toEqual({ isWeekOff: false, known: true });
    expect(parseTimeCell("9:00")).toBe("09:00");
    expect(parseShiftRange("14:00-22:00")).toEqual({ start: "14:00", end: "22:00" });
  });

  it("parses Qatar-style dates", () => {
    expect(parseRosterDateCell("2026-08-17")).toBe("2026-08-17");
    expect(parseRosterDateCell("17/08/2026")).toBe("2026-08-17");
    expect(parseRosterDateCell("17 Aug 2026")).toBe("2026-08-17");
  });
});

describe("matchAttendanceRosterStaff", () => {
  it("matches QID first, then employee code, then exact name+location", () => {
    expect(matchAttendanceRosterStaff({ qid: "28911234567", employeeCode: "", name: "", locationId: KDS }, staff).staffId).toBe(
      "s-hassan",
    );
    expect(matchAttendanceRosterStaff({ qid: "", employeeCode: "INF-CC-STF01", name: "", locationId: INF }, staff).staffId).toBe(
      "s-sara",
    );
    expect(
      matchAttendanceRosterStaff({ qid: "", employeeCode: "", name: "Hassan Al-Kaabi", locationId: KDS }, staff).staffId,
    ).toBe("s-hassan");
  });

  it("never merges similar names and never matches name without location", () => {
    expect(
      matchAttendanceRosterStaff({ qid: "", employeeCode: "", name: "Hassan Kaabi", locationId: KDS }, staff).matchRule,
    ).toBe("name_unmatched");
    expect(
      matchAttendanceRosterStaff({ qid: "", employeeCode: "", name: "Hassan Al-Kaabi", locationId: null }, staff).matchRule,
    ).toBe("name_needs_location");
    expect(matchAttendanceRosterStaff({ qid: "", employeeCode: "", name: "Ahmed Ali", locationId: INF }, staff).staffId).toBe(
      "s-twin-a",
    );
  });

  it("does not fall through from a wrong QID to name", () => {
    const result = matchAttendanceRosterStaff(
      { qid: "99999999999", employeeCode: "", name: "Hassan Al-Kaabi", locationId: KDS },
      staff,
    );
    expect(result.staffId).toBeNull();
    expect(result.matchRule).toBe("qid_unmatched");
  });
});

describe("buildAttendanceRosterPreview", () => {
  it("parses the downloadable template and matches by employee code", () => {
    const csv = [
      "date,staff_name,qid,employee_code,location,location_name,shift_start,shift_end,duty",
      "2026-08-16,Hassan Al-Kaabi,,KDS-CC-BM,KDS-CC,Kids Driving School - City Center,09:00,17:00,Yes",
      "2026-08-17,Hassan Al-Kaabi,,KDS-CC-BM,KDS-CC,Kids Driving School - City Center,,,Off",
    ].join("\n");
    const preview = buildAttendanceRosterPreview({
      records: parseCsv(csv),
      periodMode: "week",
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
      selectedLocationId: KDS,
      staff,
      locations,
      shifts: [],
    });
    expect(preview.errors).toHaveLength(0);
    expect(preview.matched).toBe(2);
    expect(preview.rows.filter((r) => r.isWeekOff)).toHaveLength(1);
    expect(preview.rows.every((r) => r.staffId === "s-hassan")).toBe(true);
    expect(preview.rows.every((r) => r.locationCode === "KDS-CC")).toBe(true);
  });

  it("matches location code and ignores location_name when both are present", () => {
    const csv = [
      "date,employee_code,location,location_name,duty",
      "2026-08-16,KDS-CC-BM,KDS-CC,Wrong Name That Should Be Ignored,Yes",
    ].join("\n");
    const preview = buildAttendanceRosterPreview({
      records: parseCsv(csv),
      periodMode: "week",
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
      selectedLocationId: KDS,
      staff,
      locations,
      shifts: [],
    });
    expect(preview.matched).toBe(1);
    expect(preview.rows[0]?.locationCode).toBe("KDS-CC");
  });

  it("expands weekday rows across a selected week only", () => {
    const csv = ["employee_code,weekday,location,duty", "KDS-CC-BM,sun,KDS-CC,Yes", "KDS-CC-BM,mon,KDS-CC,Off"].join("\n");
    const preview = buildAttendanceRosterPreview({
      records: parseCsv(csv),
      periodMode: "week",
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
      selectedLocationId: KDS,
      staff,
      locations,
      shifts: [],
    });
    expect(preview.matched).toBe(2);
    expect(preview.rows.map((r) => r.workDate).sort()).toEqual(["2026-08-16", "2026-08-17"]);
  });

  it("skips dated rows outside the selected period instead of writing other months", () => {
    const csv = [
      "date,employee_code,location,duty",
      "2026-07-31,KDS-CC-BM,KDS-CC,Yes",
      "2026-08-16,KDS-CC-BM,KDS-CC,Yes",
    ].join("\n");
    const preview = buildAttendanceRosterPreview({
      records: parseCsv(csv),
      periodMode: "month",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      selectedLocationId: KDS,
      staff,
      locations,
      shifts: [],
    });
    expect(preview.rows.filter((r) => r.status === "skipped")).toHaveLength(1);
    expect(preview.matched).toBe(1);
  });

  it("accepts the Daily Ops dated shift CSV so supervisors can reuse that file", () => {
    const csv = [
      "location_code,employee_code,date,start_time,end_time,role_label,status",
      "KDS-CC,KDS-CC-BM,2026-08-16,09:00,17:00,Branch Manager,scheduled",
    ].join("\n");
    const preview = buildAttendanceRosterPreview({
      records: parseCsv(csv),
      periodMode: "week",
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
      selectedLocationId: KDS,
      staff,
      locations,
      shifts: [],
    });
    expect(preview.matched).toBe(1);
    expect(preview.rows[0]).toMatchObject({ staffId: "s-hassan", workDate: "2026-08-16", isWeekOff: false });
  });

  it("rejects employee-roster style columns", () => {
    const csv = ["location,employee name,qid,salary,joining date", "KDS-CC,Hassan,28911234567,3000,2022-01-01"].join("\n");
    const preview = buildAttendanceRosterPreview({
      records: parseCsv(csv),
      periodMode: "week",
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
      selectedLocationId: KDS,
      staff,
      locations,
      shifts: [],
    });
    expect(preview.errors[0]).toMatch(/Employee Roster/i);
    expect(preview.matched).toBe(0);
  });
});

describe("expectedRowsForDay", () => {
  it("uses uploaded assignments and does not invent absents on empty covered days", () => {
    expect(
      isWorkDateCovered("2026-08-17", [{ start: "2026-08-16", end: "2026-08-22" }]),
    ).toBe(true);
    const day = expectedRowsForDay({
      workDate: "2026-08-17",
      dayRoster: [{ staff_id: "s-hassan", work_date: "2026-08-17", shift_template_id: null, is_week_off: false }],
      fallbackStaffIds: ["s-hassan", "s-twin-b"],
      coveredByUpload: true,
    });
    expect(day.map((r) => r.staff_id)).toEqual(["s-hassan"]);
    expect(
      expectedOnDutyStaffIds([
        { staff_id: "s-hassan", work_date: "2026-08-17", shift_template_id: null, is_week_off: false },
        { staff_id: "s-twin-b", work_date: "2026-08-17", shift_template_id: null, is_week_off: true },
      ]),
    ).toEqual(["s-hassan"]);
    expect(
      expectedRowsForDay({
        workDate: "2026-08-21",
        dayRoster: [],
        fallbackStaffIds: ["s-hassan", "s-twin-b"],
        coveredByUpload: true,
      }),
    ).toEqual([]);
  });

  it("falls back to all site staff when no roster was uploaded for that period", () => {
    const day = expectedRowsForDay({
      workDate: "2026-08-01",
      dayRoster: [],
      fallbackStaffIds: ["a", "b"],
      coveredByUpload: false,
    });
    expect(day.map((r) => r.staff_id)).toEqual(["a", "b"]);
  });
});
