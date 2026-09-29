import { describe, expect, it } from "vitest";

import { buildMonthlyArcadeReport, buildSupplierPerformance, buildWeeklyArcadeReport } from "./reports";

describe("arcade reports", () => {
  it("builds the weekly report from activity counts and site groups", () => {
    const report = buildWeeklyArcadeReport({
      weekStart: "2026-09-21",
      weekEnd: "2026-09-27",
      generatedAt: "2026-09-29T00:00:00Z",
      sites: [
        {
          locationId: "l1",
          siteName: "Urban Arena - Doha Mall",
          active: 25,
          working: 22,
          down: 0,
          underRepair: 2,
          underObservation: 0,
          waitingPart: 1,
          waitingSupplier: 0,
          pmDue: 1,
          pmOverdue: 0,
        },
      ],
      opened: 4,
      resolved: 3,
      pending: 1,
      waitingParts: 1,
      waitingSuppliers: 0,
      repeatFaults: 1,
      pmCompleted: 6,
      pmOverdue: 2,
      partsConsumed: 2,
      partsCost: 140,
      faults: [
        {
          ticketNumber: "ARC-2026-0004",
          site: "Urban Arena - Doha Mall",
          machine: "RC Car #2",
          status: "WAITING_PART",
          severity: "HIGH",
          category: "Sensor",
          summary: "Lane sensor dark",
        },
      ],
    });
    expect(report.title).toBe("E3 ARCADE TECHNICAL WEEKLY REPORT");
    expect(report.availability).toBe(88);
    expect(report.pmCompliance).toBe(75);
    expect(report.siteGroups[0]?.faults).toHaveLength(1);
  });

  it("compares this month with the previous month from measurable rows", () => {
    const report = buildMonthlyArcadeReport({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      previousPeriodStart: "2026-08-01",
      previousPeriodEnd: "2026-08-31",
      now: "2026-09-30T00:00:00Z",
      activeMachines: 10,
      workingMachines: 8,
      pmCompleted: 4,
      pmOverdue: 1,
      faults: [
        {
          id: "a",
          machineId: "m1",
          machineName: "RC Car #1",
          siteName: "Urban Arena - Doha Mall",
          category: "Sensor",
          status: "RESOLVED",
          severity: "HIGH",
          reportedAt: "2026-09-02T00:00:00Z",
          resolvedAt: "2026-09-02T04:00:00Z",
          isRepeat: false,
          downtimeStartedAt: "2026-09-02T00:00:00Z",
          downtimeEndedAt: "2026-09-02T04:00:00Z",
        },
        {
          id: "b",
          machineId: "m1",
          machineName: "RC Car #1",
          siteName: "Urban Arena - Doha Mall",
          category: "Sensor",
          status: "RESOLVED",
          severity: "MEDIUM",
          reportedAt: "2026-09-10T00:00:00Z",
          resolvedAt: "2026-09-10T02:00:00Z",
          isRepeat: true,
          downtimeStartedAt: null,
          downtimeEndedAt: null,
        },
        {
          id: "c",
          machineId: "m1",
          machineName: "RC Car #1",
          siteName: "Urban Arena - Doha Mall",
          category: "Sensor",
          status: "RESOLVED",
          severity: "LOW",
          reportedAt: "2026-09-20T00:00:00Z",
          resolvedAt: "2026-09-20T03:00:00Z",
          isRepeat: true,
          downtimeStartedAt: null,
          downtimeEndedAt: null,
        },
        {
          id: "old",
          machineId: "m1",
          machineName: "RC Car #1",
          siteName: "Urban Arena - Doha Mall",
          category: "Power",
          status: "CLOSED",
          severity: "LOW",
          reportedAt: "2026-08-05T00:00:00Z",
          resolvedAt: "2026-08-06T00:00:00Z",
          isRepeat: false,
          downtimeStartedAt: null,
          downtimeEndedAt: null,
        },
      ],
      partUsages: [{ machineId: "m1", quantity: 1, cost: 40, usedOn: "2026-09-02" }],
      supplierCases: [
        {
          openedOn: "2026-09-03T00:00:00Z",
          firstResponseAt: "2026-09-03T06:00:00Z",
          status: "AWAITING_PART",
        },
      ],
    });
    expect(report.faults).toBe(3);
    expect(report.previousFaults).toBe(1);
    expect(report.repeatFaults).toBe(2);
    expect(report.partsCost).toBe(40);
    expect(report.supplierResponseHours).toBe(6);
    expect(report.mttrHours).toBe(3);
    expect(report.highestFailureMachines[0]?.machineName).toBe("RC Car #1");
    expect(report.sitesByFaults[0]?.faults).toBe(3);
  });

  it("scores suppliers only from measured cases and machines", () => {
    const rows = buildSupplierPerformance({
      now: "2026-09-29T00:00:00Z",
      vendors: [{ id: "v1", name: "CQ Amusement" }],
      machines: [
        { vendorId: "v1", status: "WORKING", warrantyExpiresOn: "2027-01-01" },
        { vendorId: "v1", status: "DOWN", warrantyExpiresOn: "2026-01-01" },
      ],
      cases: [
        {
          vendorId: "v1",
          status: "AWAITING_PART",
          openedAt: "2026-09-01T00:00:00Z",
          firstResponseAt: "2026-09-01T08:00:00Z",
          resolvedAt: null,
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      vendorName: "CQ Amusement",
      machines: 2,
      working: 1,
      down: 1,
      openCases: 1,
      averageResponseHours: 8,
      averageResolutionHours: null,
      pendingParts: 1,
      warrantyMachines: 1,
    });
  });
});
