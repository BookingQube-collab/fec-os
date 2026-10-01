import { describe, expect, it } from "vitest";

import { mapRosterPeriodByDayIndex, monthBounds, nextPayrollMonth } from "./roster-period";
import {
  fbCafeRosterStaff,
  filterRosterCopyRows,
  flexibleMultiSiteRosterStaff,
  flexibleRosterStaff,
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

  it("staff-id filter copies only those people and keeps each row location", () => {
    const source = monthBounds("2026-10");
    const target = monthBounds(nextPayrollMonth("2026-10"));
    const dateMap = mapRosterPeriodByDayIndex(source.dateFrom, source.dateTo, target.dateFrom, target.dateTo);
    const selected = filterRosterCopyRows(octoberRows, null, { staffIds: ["louie"] });
    const planned = planRosterCopyByLocation(selected, null, dateMap);

    expect(planned.skipped).toBe(0);
    expect(planned.rows.map((row) => [row.location_id, row.staff_id, row.work_date])).toEqual([
      ["kds", "louie", "2026-10-28"],
      ["wm", "louie", "2026-10-29"],
    ]);
    expect(filterRosterCopyRows(octoberRows, null, { staffIds: [] })).toEqual([]);
    expect(filterRosterCopyRows(octoberRows, undefined).map((row) => row.staff_id)).toEqual([
      "louie",
      "louie",
      "russell",
      "ada",
    ]);
  });

  it("staff filter on destination rows leaves other people out of the replace set", () => {
    const destination = [
      { id: "a", location_id: "kds", staff_id: "louie", work_date: "2026-10-28" },
      { id: "b", location_id: "ho", staff_id: "ada", work_date: "2026-10-28" },
      { id: "c", location_id: "wm", staff_id: "louie", work_date: "2026-10-29" },
      { id: "d", location_id: "fnb", staff_id: "russell", work_date: "2026-10-30" },
    ];
    expect(filterRosterCopyRows(destination, null, { staffIds: ["louie"] }).map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("department filter keeps F&B Cafe rows and each row location", () => {
    const rows = [
      { location_id: "kds", staff_id: "cafe", departmentNames: ["F&B Cafe"] },
      { location_id: "wm", staff_id: "cafe", departmentNames: ["F&B Cafe"] },
      { location_id: "ho", staff_id: "fb", department: "F&B" },
      { location_id: "code", staff_id: "code", departmentCodes: ["FB"] },
      { location_id: "cafe-code", staff_id: "cafe-code", departmentCodes: ["FB_CAFE"] },
      { location_id: "fnb", staff_id: "fnb", department: "FnB Cafe" },
      { location_id: "and", staff_id: "and", departmentNames: ["F and B Cafe"] },
      { location_id: "mgr", staff_id: "mgr", departmentNames: ["F&B Manager"] },
      { location_id: "bar", staff_id: "bar", departmentNames: ["Barista"] },
      { location_id: "both", staff_id: "both", departmentNames: ["Barista", "F&B Cafe"] },
      { location_id: "ops", staff_id: "ops", departmentNames: ["Operations"] },
    ];
    const selected = filterRosterCopyRows(rows, null, { department: "fb_cafe" });
    expect(selected.map((row) => [row.location_id, row.staff_id])).toEqual([
      ["kds", "cafe"],
      ["wm", "cafe"],
      ["ho", "fb"],
      ["code", "code"],
      ["cafe-code", "cafe-code"],
      ["fnb", "fnb"],
      ["and", "and"],
      ["both", "both"],
    ]);

    const staffIds = [...new Set(selected.map((row) => row.staff_id))];
    const destination = [
      { id: "cafe-kds", location_id: "kds", staff_id: "cafe", work_date: "2026-10-28" },
      { id: "ada", location_id: "kds", staff_id: "ada", work_date: "2026-10-28" },
      { id: "bar", location_id: "fnb", staff_id: "bar", work_date: "2026-10-29" },
    ];
    expect(filterRosterCopyRows(destination, null, { staffIds }).map((row) => row.id)).toEqual(["cafe-kds"]);
    expect(fbCafeRosterStaff([
      { staffId: "cafe", staffName: "Cafe Crew", departmentNames: ["F&B Cafe"] },
      { staffId: "mgr", staffName: "F&B Manager", departmentNames: ["F&B Manager"] },
      { staffId: "bar", staffName: "Barista", departmentNames: ["Barista"] },
      { staffId: "fnb", staffName: "FnB", department: "FnB Cafe" },
    ]).map((person) => person.staffName)).toEqual(["Cafe Crew", "FnB"]);
  });

  it("lists everyone with flexible reporting, including a single site", () => {
    const rows = [
      { staffId: "louie", staffName: "Louie", locationId: "kds", flexibleAttendance: true },
      { staffId: "louie", staffName: "Louie", locationId: "wm", flexibleAttendance: true },
      { staffId: "russell", staffName: "Russell", locationId: "kds", flexibleAttendance: true },
      { staffId: "russell", staffName: "Russell", locationId: "fnb", flexibleAttendance: true },
      { staffId: "ada", staffName: "Ada", locationId: "ho", flexibleAttendance: false },
      { staffId: "ada", staffName: "Ada", locationId: "wm", flexibleAttendance: false },
      { staffId: "sam", staffName: "Sam", locationId: "kds", flexibleAttendance: true },
    ];
    expect(flexibleRosterStaff(rows).map((person) => person.staffName)).toEqual(["Louie", "Russell", "Sam"]);
    expect(flexibleRosterStaff(rows).find((person) => person.staffId === "sam")?.locationIds).toEqual(["kds"]);
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
