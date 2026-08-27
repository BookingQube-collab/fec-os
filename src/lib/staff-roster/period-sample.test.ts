import { describe, expect, it } from "vitest";

import {
  buildAttendanceRosterPreview,
  looksLikeShiftRosterHeaders,
  parseAttendanceRosterFile,
} from "@/lib/attendance-hr/roster-upload";
import { staffPlacementsForScope } from "@/lib/staff-sample-scope";

import {
  PEOPLE_ROSTER_SAMPLE_HEADERS,
  PEOPLE_ROSTER_SAMPLE_SHEET,
  buildPeopleRosterSampleMatrix,
  buildPeopleRosterSampleXlsx,
  formatE3RosterDate,
  peopleRosterSampleFilename,
  weekdayLongName,
} from "./period-sample";

const INF = "11111111-1111-4111-8111-111111111111";
const KDS = "22222222-2222-4222-8222-222222222222";

const locations = [
  { id: INF, code: "INF-CC", name: "Inflatapark" },
  { id: KDS, code: "KDS-CC", name: "Kids Driving School" },
];

const staff = [
  {
    id: "s-amna",
    full_name: "Amna Al-Naimi",
    employee_code: "INF-CC-BM",
    qid: "28910000001",
    location_id: INF,
    work_location_ids: [] as string[],
    phone: "55500001",
    job_title: "Branch Manager",
  },
];

describe("people roster period sample", () => {
  const placements = staffPlacementsForScope(staff, locations, {
    scopeLocationId: INF,
    accessibleLocationIds: new Set([INF, KDS]),
  });

  it("uses the E3 date-wise roster headers and leaves SHIFT/STATUS empty", () => {
    const { headers, rows, title } = buildPeopleRosterSampleMatrix(["2026-08-16", "2026-08-17"], placements, {
      periodMode: "week",
    });
    expect([...headers]).toEqual([...PEOPLE_ROSTER_SAMPLE_HEADERS]);
    expect(headers).not.toContain("salary");
    expect(title).toBe("DATE WISE WEEKLY ROSTER");
    expect(rows[0]).toEqual([
      "16-Aug-2026",
      "Sunday",
      "Amna Al-Naimi",
      "Branch Manager",
      "Inflatapark - City Center",
      "",
      "",
    ]);
    expect(rows[1]).toEqual([
      "17-Aug-2026",
      "Monday",
      "Amna Al-Naimi",
      "Branch Manager",
      "Inflatapark - City Center",
      "",
      "",
    ]);
  });

  it("titles a month sample as DATE WISE MONTHLY ROSTER", () => {
    const { title, periodLine } = buildPeopleRosterSampleMatrix(["2026-08-01", "2026-08-31"], placements, {
      periodMode: "month",
    });
    expect(title).toBe("DATE WISE MONTHLY ROSTER");
    expect(periodLine).toContain("1-Aug-2026 to 31-Aug-2026");
  });

  it("parses the generated workbook as a shift roster (not a salary/directory workbook)", async () => {
    const { buffer, headers } = await buildPeopleRosterSampleXlsx(["2026-08-16"], placements, { periodMode: "week" });
    expect([...headers]).toEqual([...PEOPLE_ROSTER_SAMPLE_HEADERS]);
    expect(looksLikeShiftRosterHeaders([...headers])).toBe(true);

    const parsed = await parseAttendanceRosterFile("e3-date-wise-roster-inf-cc.xlsx", buffer);
    expect(parsed.error).toBeUndefined();
    expect(parsed.sheetName).toBe(PEOPLE_ROSTER_SAMPLE_SHEET);
    expect(parsed.records[0]).toMatchObject({
      DATE: "16-Aug-2026",
      DAY: "Sunday",
      EMPLOYEE: "Amna Al-Naimi",
      POSITION: "Branch Manager",
      LOCATION: "Inflatapark - City Center",
      SHIFT: "",
      STATUS: "",
    });

    const preview = buildAttendanceRosterPreview({
      records: parsed.records,
      periodMode: "week",
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
      selectedLocationId: INF,
      staff: [
        {
          id: "s-amna",
          full_name: "Amna Al-Naimi",
          employee_code: "INF-CC-BM",
          qid: "28910000001",
          location_id: INF,
          work_location_ids: [],
        },
      ],
      locations: [{ id: INF, code: "INF-CC", name: "Inflatapark", region: "City Center" }],
      shifts: [],
    });
    expect(preview.errors).toHaveLength(0);
    expect(preview.matched).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      staffLabel: "Amna Al-Naimi",
      locationCode: "INF-CC",
      workDate: "2026-08-16",
      isWeekOff: false,
    });
  });

  it("names the workbook by location and period", () => {
    expect(peopleRosterSampleFilename("2026-08-16", "2026-08-22", "INF-CC")).toBe(
      "e3-date-wise-roster-inf-cc-2026-08-16-to-2026-08-22.xlsx",
    );
    expect(peopleRosterSampleFilename("2026-08-01", "2026-08-31", null)).toContain("all-");
  });

  it("formats E3 dates and weekdays the way the source roster does", () => {
    expect(formatE3RosterDate("2026-07-28")).toBe("28-Jul-2026");
    expect(weekdayLongName("2026-07-28")).toBe("Tuesday");
  });
});
