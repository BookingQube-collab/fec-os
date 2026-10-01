import { describe, expect, it } from "vitest";

import { mapRosterPeriodByDayIndex, monthBounds, nextPayrollMonth } from "./roster-period";
import {
  filterRosterCopyRows,
  flexibleMultiSiteRosterStaff,
  planRosterCopyByLocation,
  rosterCopyDestinationKey,
  rosterCopyProtectedDestinationKeys,
} from "./roster-copy";

const octoberRows = [
  { location_id: "kds", staff_id: "louie", work_date: "2026-09-28", shift_start: "09:00", shift_end: "17:00" },
  { location_id: "wm", staff_id: "louie", work_date: "2026-09-29", shift_start: "14:00", shift_end: "22:00" },
  { location_id: "kds", staff_id: "russell", work_date: "2026-09-30", shift_start: "10:00", shift_end: "18:00" },
  { location_id: "ho", staff_id: "ada", work_date: "2026-09-28", shift_start: "08:00", shift_end: "16:00" },
];

describe("roster copy location filter", () => {
  it("site-wise copy includes only the selected location ids", () => {
    const source = monthBounds("2026-10");
    const target = monthBounds(nextPayrollMonth("2026-10"));
    const dateMap = mapRosterPeriodByDayIndex(source.dateFrom, source.dateTo, target.dateFrom, target.dateTo);
    const planned = planRosterCopyByLocation(octoberRows, ["kds", "wm"], dateMap);

    expect(source).toEqual({ dateFrom: "2026-09-28", dateTo: "2026-10-27" });
    expect(planned.skipped).toBe(0);
    expect(planned.rows.map((row) => [row.location_id, row.staff_id, row.work_date, row.shift_start])).toEqual([
      ["kds", "louie", "2026-10-28", "09:00"],
      ["wm", "louie", "2026-10-29", "14:00"],
      ["kds", "russell", "2026-10-30", "10:00"],
    ]);
    expect(planned.rows.some((row) => row.location_id === "ho")).toBe(false);
    expect(new Set(planned.rows.map((row) => row.location_id))).toEqual(new Set(["kds", "wm"]));
  });

  it("keeps every location when the filter is omitted", () => {
    expect(filterRosterCopyRows(octoberRows, undefined).map((row) => row.location_id)).toEqual([
      "kds",
      "wm",
      "kds",
      "ho",
    ]);
    expect(filterRosterCopyRows(octoberRows, null)).toHaveLength(octoberRows.length);
  });

  it("copies nothing when the site list is empty", () => {
    expect(filterRosterCopyRows(octoberRows, [])).toEqual([]);
  });

  it("replace scope keeps other destination sites and blocks same-day overwrites", () => {
    const destination = [
      { id: "a", location_id: "kds", staff_id: "louie", work_date: "2026-10-28" },
      { id: "b", location_id: "ho", staff_id: "ada", work_date: "2026-10-28" },
      { id: "c", location_id: "wm", staff_id: "louie", work_date: "2026-10-29" },
    ];
    expect(filterRosterCopyRows(destination, ["kds"]).map((row) => row.id)).toEqual(["a"]);
    const protectedKeys = rosterCopyProtectedDestinationKeys(destination, ["kds"]);
    expect(protectedKeys.has(rosterCopyDestinationKey("ada", "2026-10-28"))).toBe(true);
    expect(protectedKeys.has(rosterCopyDestinationKey("louie", "2026-10-28"))).toBe(false);
    expect(protectedKeys.has(rosterCopyDestinationKey("louie", "2026-10-29"))).toBe(true);
  });

  it("lists flexible multi-site staff with each location kept", () => {
    const staff = flexibleMultiSiteRosterStaff([
      { staffId: "louie", staffName: "Louie", locationId: "kds", flexibleAttendance: true },
      { staffId: "louie", staffName: "Louie", locationId: "wm", flexibleAttendance: true },
      { staffId: "russell", staffName: "Russell", locationId: "kds", flexibleAttendance: true },
      { staffId: "russell", staffName: "Russell", locationId: "fnb", flexibleAttendance: true },
      { staffId: "ada", staffName: "Ada", locationId: "ho", flexibleAttendance: false },
      { staffId: "ada", staffName: "Ada", locationId: "wm", flexibleAttendance: false },
      { staffId: "sam", staffName: "Sam", locationId: "kds", flexibleAttendance: true },
    ]);

    expect(staff.map((person) => person.staffName)).toEqual(["Louie", "Russell"]);
    expect(staff.find((person) => person.staffId === "louie")?.locationIds).toEqual(["kds", "wm"]);
    expect(staff.find((person) => person.staffId === "russell")?.locationIds).toEqual(["kds", "fnb"]);
  });
});
