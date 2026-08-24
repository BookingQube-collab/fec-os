import { describe, expect, it } from "vitest";

import { directoryStaffForScope, staffPlacementsForScope } from "./staff-sample-scope";

const INF = "loc-inf";
const KDS = "loc-kds";
const locations = [
  { id: INF, code: "INF-CC" },
  { id: KDS, code: "KDS-CC" },
];
const staff = [
  {
    id: "a",
    full_name: "Amna",
    employee_code: "INF-CC-BM",
    qid: "1",
    location_id: INF,
    work_location_ids: [] as string[],
  },
  {
    id: "r",
    full_name: "Russell",
    employee_code: "FEC-TEC01",
    qid: null,
    location_id: INF,
    work_location_ids: [KDS],
  },
];

describe("staff sample scope", () => {
  it("directory sample lists each person once at home", () => {
    const rows = directoryStaffForScope(staff, locations, {
      scopeLocationId: null,
      accessibleLocationIds: new Set([INF, KDS]),
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "r")?.locationCode).toBe("INF-CC");
  });

  it("directory sample for one site includes roaming workers without duplicating them", () => {
    const rows = directoryStaffForScope(staff, locations, {
      scopeLocationId: KDS,
      accessibleLocationIds: new Set([INF, KDS]),
    });
    expect(rows.map((r) => r.id)).toEqual(["r"]);
  });

  it("roster placements expand roaming to each work site", () => {
    const all = staffPlacementsForScope(staff, locations, {
      scopeLocationId: null,
      accessibleLocationIds: new Set([INF, KDS]),
    });
    expect(all.filter((p) => p.staff.id === "r")).toHaveLength(2);
  });
});
