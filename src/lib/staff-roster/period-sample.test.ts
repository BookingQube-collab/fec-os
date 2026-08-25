import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "@/lib/csv-parse";
import { buildAttendanceRosterPreview } from "@/lib/attendance-hr/roster-upload";
import { staffPlacementsForScope } from "@/lib/staff-sample-scope";

import {
  PEOPLE_ROSTER_SAMPLE_HEADERS,
  buildPeopleRosterSampleMatrix,
  buildPeopleRosterSampleXlsx,
  peopleRosterSampleFilename,
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
  },
];

describe("people roster period sample", () => {
  const placements = staffPlacementsForScope(staff, locations, {
    scopeLocationId: INF,
    accessibleLocationIds: new Set([INF, KDS]),
  });

  it("prefills name and location from the directory and leaves shift/week-off empty", () => {
    const { headers, rows } = buildPeopleRosterSampleMatrix(["2026-08-16", "2026-08-17"], placements);
    expect([...headers]).toEqual([...PEOPLE_ROSTER_SAMPLE_HEADERS]);
    expect(headers).not.toContain("salary");
    expect(rows[0]).toEqual([
      "2026-08-16",
      "Amna Al-Naimi",
      "28910000001",
      "INF-CC-BM",
      "INF-CC",
      "Inflatapark - City Center",
      "",
      "",
      "",
    ]);
    expect(rows[1]?.[1]).toBe("Amna Al-Naimi");
    expect(rows[1]?.[4]).toBe("INF-CC");
  });

  it("parses as a shift roster (not a salary/directory workbook)", () => {
    const { headers, rows } = buildPeopleRosterSampleMatrix(["2026-08-16"], placements);
    const csv = toCsv(headers, rows);
    const preview = buildAttendanceRosterPreview({
      records: parseCsv(csv),
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
      isWeekOff: false,
    });
  });

  it("names the workbook by location and period", () => {
    expect(peopleRosterSampleFilename("2026-08-16", "2026-08-22", "INF-CC")).toBe(
      "employee-roster-sample-inf-cc-2026-08-16-to-2026-08-22.xlsx",
    );
    expect(peopleRosterSampleFilename("2026-08-01", "2026-08-31", null)).toContain("all-");
  });

  it("writes an xlsx workbook with roster headers and no salary column", async () => {
    const { buffer, headers } = await buildPeopleRosterSampleXlsx(["2026-08-16"], placements);
    expect([...headers]).toEqual([...PEOPLE_ROSTER_SAMPLE_HEADERS]);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
    expect(Object.keys(rows[0] ?? {})).toEqual([...PEOPLE_ROSTER_SAMPLE_HEADERS]);
    expect(Object.keys(rows[0] ?? {})).not.toContain("salary");
    expect(rows[0]).toMatchObject({
      date: "2026-08-16",
      staff_name: "Amna Al-Naimi",
      location: "INF-CC",
      shift_start: "",
      shift_end: "",
      duty: "",
    });
  });
});
