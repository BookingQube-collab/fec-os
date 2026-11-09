import { describe, expect, it } from "vitest";

import {
  buildDemoStaffPool,
  demoEmployeeCode,
  demoPunchIsos,
  demoPunchPattern,
  EVENT_WORKFORCE_DEMO_COUNTS,
  EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION,
  EVENT_WORKFORCE_DEMO_MAX_DAYS,
  formatStaffCodeBeforeName,
  QATAR_EVENT_DEMO_DAY_RATES_QAR,
  validateDemoDateRange,
  assertDemoDeleteConfirmation,
} from "./event-workforce-demo";

describe("event workforce demo pool", () => {
  it("builds 65 crew + 4 cashier + 40 labour with unique codes and names", () => {
    const pool = buildDemoStaffPool();
    expect(pool).toHaveLength(
      EVENT_WORKFORCE_DEMO_COUNTS.crew +
        EVENT_WORKFORCE_DEMO_COUNTS.cashier +
        EVENT_WORKFORCE_DEMO_COUNTS.labour,
    );
    expect(pool.filter((p) => p.bucket === "crew")).toHaveLength(65);
    expect(pool.filter((p) => p.bucket === "cashier")).toHaveLength(4);
    expect(pool.filter((p) => p.bucket === "labour")).toHaveLength(40);
    const codes = new Set(pool.map((p) => p.code));
    expect(codes.size).toBe(pool.length);
    const names = new Set(pool.map((p) => p.fullName));
    expect(names.size).toBe(pool.length);
    expect(demoEmployeeCode("crew", 1)).toBe("EVT-CRW01");
    expect(demoEmployeeCode("cashier", 1)).toBe("EVT-CSH01");
    expect(demoEmployeeCode("labour", 40)).toBe("EVT-LBR40");
  });

  it("formats code before name", () => {
    expect(formatStaffCodeBeforeName("EVT-CSH01", "Abdallah Osman")).toBe(
      "EVT-CSH01 · Abdallah Osman",
    );
  });

  it("documents Qatar labour day rates", () => {
    expect(QATAR_EVENT_DEMO_DAY_RATES_QAR.labour).toBe(150);
    expect(QATAR_EVENT_DEMO_DAY_RATES_QAR.cleaner).toBe(130);
    expect(QATAR_EVENT_DEMO_DAY_RATES_QAR.maintenance).toBe(180);
  });
});

describe("demo date range", () => {
  it("rejects inverted and oversized ranges", () => {
    expect(validateDemoDateRange("2026-12-10", "2026-12-01")).toMatch(/on or after/i);
    expect(validateDemoDateRange("2026-12-01", "2026-12-20")).toMatch(
      new RegExp(String(EVENT_WORKFORCE_DEMO_MAX_DAYS)),
    );
    expect(validateDemoDateRange("2026-12-01", "2026-12-03")).toBeNull();
  });

  it("requires delete confirmation phrase", () => {
    expect(() => assertDemoDeleteConfirmation("nope")).toThrow(/DELETE EVENT DATA/);
    expect(() => assertDemoDeleteConfirmation(EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION)).not.toThrow();
  });
});

describe("demo punches", () => {
  it("varies patterns and builds Qatar-offset ISOs", () => {
    const patterns = new Set(
      Array.from({ length: 20 }, (_, i) => demoPunchPattern(i, 0)),
    );
    expect(patterns.has("complete")).toBe(true);
    expect(patterns.has("late") || patterns.has("missed_out") || patterns.has("absent")).toBe(
      true,
    );
    const late = demoPunchIsos({
      workDate: "2026-12-17",
      scheduledInHm: "09:00",
      scheduledOutHm: "18:00",
      pattern: "late",
    });
    expect(late.inIso).toContain("+03:00");
    expect(late.outIso).toContain("18:00");
    const absent = demoPunchIsos({
      workDate: "2026-12-17",
      scheduledInHm: "09:00",
      scheduledOutHm: "18:00",
      pattern: "absent",
    });
    expect(absent).toEqual({ inIso: null, outIso: null });
  });
});
