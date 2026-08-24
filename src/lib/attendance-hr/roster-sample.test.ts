import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv-parse";
import { staffPlacementsForScope } from "@/lib/staff-sample-scope";

import { buildAttendanceRosterSampleCsv, rosterSampleFilename } from "./roster-sample";

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
  },
  {
    id: "s-russell",
    full_name: "Russell Bombita Pante",
    employee_code: "FEC-TEC01",
    qid: null,
    location_id: INF,
    work_location_ids: [KDS],
  },
];

describe("attendance roster sample", () => {
  it("prefills saved staff and dates, leaving shift times blank", () => {
    const placements = staffPlacementsForScope(staff, locations, {
      scopeLocationId: INF,
      accessibleLocationIds: new Set([INF, KDS]),
    });
    const { csv, rowCount } = buildAttendanceRosterSampleCsv(["2026-08-16", "2026-08-17"], placements);
    const rows = parseCsv(csv);
    expect(rowCount).toBe(4);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      date: "2026-08-16",
      staff_name: "Amna Al-Naimi",
      qid: "28910000001",
      employee_code: "INF-CC-BM",
      location: "INF-CC",
      location_name: "Inflatapark - City Center",
      shift_start: "",
      shift_end: "",
      duty: "Yes",
    });
    expect(rows.some((r) => r.staff_name === "Russell Bombita Pante" && r.location === "INF-CC")).toBe(true);
    expect(Object.keys(rows[0])).toEqual([
      "date",
      "staff_name",
      "qid",
      "employee_code",
      "location",
      "location_name",
      "shift_start",
      "shift_end",
      "duty",
    ]);
  });

  it("includes roaming staff at a selected work site", () => {
    const placements = staffPlacementsForScope(staff, locations, {
      scopeLocationId: KDS,
      accessibleLocationIds: new Set([INF, KDS]),
    });
    expect(placements).toHaveLength(1);
    expect(placements[0].staff.employee_code).toBe("FEC-TEC01");
    expect(placements[0].locationCode).toBe("KDS-CC");
    expect(placements[0].locationName).toBe("Kids Driving School - City Center");
  });

  it("names the file by scope and period", () => {
    expect(rosterSampleFilename("2026-08-01", "2026-08-31", "INF-CC")).toBe(
      "attendance-roster-sample-inf-cc-2026-08-01-to-2026-08-31.csv",
    );
    expect(rosterSampleFilename("2026-08-16", "2026-08-22", null)).toContain("all-");
  });
});
