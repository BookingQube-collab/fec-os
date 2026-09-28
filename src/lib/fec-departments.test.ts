import { describe, expect, it } from "vitest";

import { filterDepartmentsForLocation } from "./department-audience";
import { fecDepartmentForSiteStaff, normalizeLabel } from "./fec-departments";
import { splitDepartmentTokens } from "./staff-departments";

describe("fecDepartmentForSiteStaff", () => {
  it("maps exact catalog titles and the site labels that mean the same role", () => {
    expect(fecDepartmentForSiteStaff("Crew / Attendant", "Battle Arena")).toBe("Crew / Attendant");
    expect(fecDepartmentForSiteStaff("Attendant", "Operations")).toBe("Crew / Attendant");
    expect(fecDepartmentForSiteStaff("Venue Supervisor", null)).toBe("Site Supervisor");
    expect(fecDepartmentForSiteStaff("Sr. Site Supervisor", null)).toBe("Sr. Site Supervisor");
    expect(fecDepartmentForSiteStaff("Head Chef", "F&B Cafe")).toBe("Head Chef");
    expect(fecDepartmentForSiteStaff("Chef", "F&B")).toBe("Chef");
    expect(fecDepartmentForSiteStaff("Barista", "F&B Cafe")).toBe("Barista");
    expect(fecDepartmentForSiteStaff("F&B Manager", "F&B Cafe")).toBe("F&B Manager");
    expect(fecDepartmentForSiteStaff("Artist", null)).toBe("Artist");
    expect(fecDepartmentForSiteStaff("Cleaner", "Driving lane")).toBe("Cleaner");
    expect(fecDepartmentForSiteStaff("FEC Arcade Technician", null)).toBe("FEC Arcade Technician");
  });

  it("keeps FEC cashiers and F&B cashiers distinct", () => {
    expect(fecDepartmentForSiteStaff("Cashier", "Ticketing Counter")).toBe("Cashier");
    expect(fecDepartmentForSiteStaff("Cashier", "Cashier")).toBe("Cashier");
    expect(fecDepartmentForSiteStaff("Cashier", "F&B Cafe")).toBe("F&B Cashier");
    expect(fecDepartmentForSiteStaff("Cashier", "F&B")).toBe("F&B Cashier");
  });

  it("does not guess compound or unmatched titles", () => {
    expect(fecDepartmentForSiteStaff("Cashier / Attendant", "INFLATA park")).toBeNull();
    expect(fecDepartmentForSiteStaff("Attendant / Artist", "Operations")).toBeNull();
    expect(fecDepartmentForSiteStaff("Barista / Waitres/ Cashier", "F&B")).toBeNull();
    expect(fecDepartmentForSiteStaff("Pastry Chef", "F&B Cafe")).toBeNull();
    expect(fecDepartmentForSiteStaff("Dishwasher/Cook", "F&B Cafe")).toBeNull();
    expect(fecDepartmentForSiteStaff("Shift Lead", "Battle Arena")).toBeNull();
    expect(fecDepartmentForSiteStaff("Technician", "Maintenance")).toBeNull();
    expect(fecDepartmentForSiteStaff("HR Manager", "HR")).toBeNull();
    expect(fecDepartmentForSiteStaff("Birthday Specialist", null)).toBeNull();
    expect(fecDepartmentForSiteStaff(null, "Battle Arena")).toBeNull();
  });

  it("uses a blank title plus an exact catalog department", () => {
    expect(fecDepartmentForSiteStaff("", "Cleaner")).toBe("Cleaner");
    expect(fecDepartmentForSiteStaff(null, "Chef")).toBe("Chef");
  });

  it("normalizes slash spacing before matching", () => {
    expect(normalizeLabel("Crew/Attendant")).toBe("crew / attendant");
    expect(fecDepartmentForSiteStaff("Crew/Attendant", null)).toBe("Crew / Attendant");
  });
});

describe("splitDepartmentTokens catalog names", () => {
  it("keeps slash titles as one department and still splits activity compounds", () => {
    expect(splitDepartmentTokens("Crew / Attendant")).toEqual(["Crew / Attendant"]);
    expect(splitDepartmentTokens("Managing Director / Chief Executive Officer")).toEqual([
      "Managing Director / Chief Executive Officer",
    ]);
    expect(splitDepartmentTokens("F&B Cafe + Operations")).toEqual(["F&B Cafe", "Operations"]);
    expect(splitDepartmentTokens("Driving Lane/ Yalla Toys")).toEqual(["Driving Lane", "Yalla Toys"]);
  });
});

describe("filterDepartmentsForLocation", () => {
  const rows = [
    { id: "ho-fin", name: "Finance", audience: "ho", active: true },
    { id: "fec-crew", name: "Crew / Attendant", audience: "fec", active: true },
    { id: "old", name: "Battle Arena", audience: "fec", active: false },
  ];

  it("keeps head office departments on HO and the FEC catalog on sites", () => {
    expect(filterDepartmentsForLocation(rows, "HO").map((row) => row.id)).toEqual(["ho-fin"]);
    expect(filterDepartmentsForLocation(rows, "INF-CC").map((row) => row.id)).toEqual(["fec-crew"]);
    expect(filterDepartmentsForLocation(rows, null).map((row) => row.id)).toEqual(["ho-fin", "fec-crew"]);
  });

  it("keeps a current assignment that is outside the location list", () => {
    expect(filterDepartmentsForLocation(rows, "INF-CC", ["ho-fin"]).map((row) => row.id)).toEqual([
      "ho-fin",
      "fec-crew",
    ]);
  });
});
