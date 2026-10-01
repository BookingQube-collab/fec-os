import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readWorkbookMatrices } from "@/lib/spreadsheet/workbook";
import { gridFromMatrix, machineKey, parseArcadeWorkbooks, parseCalendarDate, resolveVenueCode, type SheetGrid } from "./workbook-import";
import { WorkbookPlanInput } from "./schemas";

const DAMAGE = "A:/Weekly Meeting/week39/MACHINE DAMAGE REPORT  (Magic Table).xlsx";
const AUGUST = "A:/Weekly Meeting/week39/E3 Monthly Maintenance Report (August).xlsx";

async function book(path: string): Promise<SheetGrid[]> {
  const workbook = await readWorkbookMatrices(readFileSync(path), { raw: false, defval: "" });
  return workbook.sheetNames.map((name) => gridFromMatrix(name, workbook.sheets[name] ?? []));
}

describe("arcade workbook import", () => {
  it("maps the Qatar venue names used in the technician sheets", () => {
    expect(resolveVenueCode("Crayons and Bricks Place Vendome")).toBe("CB-VM");
    expect(resolveVenueCode("Crayons and Brikcs Dar Al Salaam")).toBe("CB-DSM");
    expect(resolveVenueCode("Kids City Driving School Doha Mall")).toBe("KDS-DM");
    expect(resolveVenueCode("Kids City Driving School City Center")).toBe("KDS-CC");
    expect(resolveVenueCode("Urban Arena Doha Mall")).toBe("UA-DM");
    expect(resolveVenueCode("Inflata Park City Center")).toBe("INF-CC");
    expect(resolveVenueCode("C & B")).toBeNull();
  });

  it("reads the technician date formats, including the August typos", () => {
    expect(parseCalendarDate("September 11, 2026")).toBe("2026-09-11");
    expect(parseCalendarDate("Aug 4 to Aug 7, 2026")).toBe("2026-08-04");
    expect(parseCalendarDate("Augsut 11, 2026")).toBe("2026-08-11");
    expect(parseCalendarDate("January 0, 1900")).toBeNull();
  });

  it("keeps Magic Table and the August rows the admin panel should show", async () => {
    if (!existsSync(DAMAGE) || !existsSync(AUGUST)) return;
    const damage = (await book(DAMAGE))[0];
    const maintenance = await book(AUGUST);
    const plan = parseArcadeWorkbooks({ damage, maintenance });
    const magic = plan.machines.find((machine) => machineKey(machine.name) === "magic table");
    expect(magic?.locationCode).toBe("CB-VM");
    expect(plan.damage).toHaveLength(1);
    expect(plan.damage[0]?.description).toMatch(/touch screen/i);
    expect(plan.damage[0]?.reportedOn).toBe("2026-09-11");
    expect(plan.maintenance.length).toBeGreaterThan(20);
    expect(plan.parts.length).toBeGreaterThan(15);
    expect(plan.headline).toMatchObject({ units: 68, repaired: 55, pending: 12, ongoing: 3 });
    const suppliers = plan.machines.map((machine) => machine.supplierName).filter(Boolean);
    expect(suppliers).toContain("Epark");
    expect(suppliers).toContain("Yuto");
    expect(suppliers).not.toContain("RC Track");
    expect(suppliers).not.toContain("Jack Photo Booth");
    expect(plan.machines.every((machine) => machine.name.length > 1)).toBe(true);
    const parsed = WorkbookPlanInput.safeParse(plan);
    if (!parsed.success) console.error(parsed.error.issues.slice(0, 8));
    expect(parsed.success).toBe(true);
  });
});
