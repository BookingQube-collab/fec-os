import { describe, expect, it } from "vitest";

import { computeEvLite, plannedProgressPct } from "@/lib/events/evm-lite";

describe("evm-lite", () => {
  it("computes planned progress across a window", () => {
    expect(plannedProgressPct("2026-01-01", "2026-01-11", "2026-01-01")).toBe(0);
    expect(plannedProgressPct("2026-01-01", "2026-01-11", "2026-01-11")).toBe(100);
    expect(plannedProgressPct("2026-01-01", "2026-01-11", "2026-01-06")).toBe(50);
  });

  it("builds SPI/CPI-lite from progress and budget", () => {
    const lite = computeEvLite({
      progressPct: 50,
      start: "2026-01-01",
      end: "2026-01-11",
      today: "2026-01-06",
      budgetRevised: 1000,
      actualCost: 400,
      estimatedHours: 20,
      actualHours: 10,
    });
    expect(lite.plannedPct).toBe(50);
    expect(lite.spi).toBe(1);
    expect(lite.earnedValue).toBe(500);
    expect(lite.cpi).toBe(1.25);
    expect(lite.hoursUtilizationPct).toBe(50);
  });

  it("omits CPI when cost is unavailable", () => {
    const lite = computeEvLite({
      progressPct: 40,
      start: "2026-01-01",
      end: "2026-01-21",
      today: "2026-01-11",
    });
    expect(lite.cpi).toBeNull();
    expect(lite.earnedValue).toBeNull();
    expect(lite.spi).toBe(0.8);
  });
});
