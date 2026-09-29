import { describe, expect, it } from "vitest";

import {
  buildAlertDrafts,
  closureErrors,
  consumeStock,
  detectRepeatFault,
  faultsFromPmChecklist,
  matchImportMachine,
  mtbfDays,
  mttrHours,
  nextMachineStatus,
  nextPartSupplyStatus,
  observationFailedAgain,
  operationalPercent,
  patchSupplierCase,
  pmCompliancePercent,
  transitionFault,
} from "./domain";

describe("arcade closure", () => {
  it("rejects a ticket closed with only the word Resolved", () => {
    const errors = closureErrors({
      problem: "Resolved",
      diagnosis: "Resolved",
      actionTaken: "Resolved",
      partsUsed: "Resolved",
      testingPerformed: "Resolved",
      finalResult: "Resolved",
      recommendations: "Resolved",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => /not only the word Resolved/i.test(error))).toBe(true);
  });

  it("accepts a full repair write-up", () => {
    const errors = transitionFault("TESTING", "RESOLVED", {
      problem: "Pink car stops after the first lap",
      diagnosis: "Radar box lost signal to the control board",
      actionTaken: "Replaced the radar box and reseated the harness",
      partsUsed: "None",
      testingPerformed: "Ten lap cycle with two cars on the track",
      finalResult: "Car completed ten laps without a stop",
      recommendations: "Recheck the harness during the next weekly PM",
    });
    expect(errors).toEqual([]);
  });

  it("blocks an illegal jump from reported to closed", () => {
    expect(transitionFault("REPORTED", "CLOSED").length).toBeGreaterThan(0);
  });
});

describe("arcade stock and waiting parts", () => {
  it("deducts stock and marks low stock at the minimum", () => {
    expect(consumeStock({ onHand: 3, quantity: 2, minimum: 1 })).toEqual({
      onHand: 1,
      stockStatus: "LOW_STOCK",
    });
  });

  it("refuses to consume more than is on hand", () => {
    expect(() => consumeStock({ onHand: 1, quantity: 2, minimum: 0 })).toThrow(/Insufficient stock/);
  });

  it("keeps an ordered part in the supply pipeline", () => {
    expect(nextPartSupplyStatus("ORDERED", 0, 1)).toBe("ORDERED");
  });

  it("moves the machine to waiting for parts with that fault status", () => {
    expect(transitionFault("UNDER_REPAIR", "WAITING_PART")).toEqual([]);
  });
});

describe("supplier diagnostic trail", () => {
  it("keeps troubleshooting when a later supplier response is added", () => {
    const next = patchSupplierCase(
      {
        troubleshootingDone: "Sensor, radar box, and control board already replaced",
        partsTested: "Sensor, radar box, control board",
        technicianFindings: "Fault remains after those replacements",
        supplierResponse: "",
        updates: [],
      },
      {
        supplierResponse: "CQ Amusement asked for a video of the radar LED",
        update: { at: "2026-09-29T10:00:00Z", body: "Sent radar LED video" },
      },
    );
    expect(next.troubleshootingDone).toContain("radar box");
    expect(next.partsTested).toContain("control board");
    expect(next.updates).toHaveLength(1);
    expect(next.supplierResponse).toContain("CQ Amusement");
  });
});

describe("repeat faults and observation", () => {
  it("flags the same machine and category inside the recent window", () => {
    const repeat = detectRepeatFault(
      [
        {
          id: "f1",
          category: "Sensor",
          reportedAt: "2026-08-01T08:00:00Z",
          resolvedAt: "2026-08-02T08:00:00Z",
        },
      ],
      "Sensor",
      "2026-09-15T08:00:00Z",
    );
    expect(repeat.isRepeat).toBe(true);
    expect(repeat.repeatCount).toBe(1);
    expect(repeat.priorFaultId).toBe("f1");
    expect(repeat.daysSinceLastRepair).toBe(44);
  });

  it("does not flag a different category", () => {
    expect(
      detectRepeatFault(
        [{ id: "f1", category: "Sensor", reportedAt: "2026-09-01T00:00:00Z" }],
        "Display",
        "2026-09-10T00:00:00Z",
      ).isRepeat,
    ).toBe(false);
  });

  it("detects a second observation failure", () => {
    expect(observationFailedAgain(["PASS", "ISSUE_FOUND", "ISSUE_FOUND"])).toBe(true);
    expect(observationFailedAgain(["ISSUE_FOUND", "PASS"])).toBe(false);
  });
});

describe("preventive maintenance", () => {
  it("opens a separate fault for FAIL and leaves the PM completed", () => {
    const faults = faultsFromPmChecklist([
      { label: "Safety stop", result: "PASS" },
      { label: "Track sensor", result: "FAIL", notes: "No beam on lane 2" },
      { label: "Display", result: "NA" },
    ]);
    expect(faults).toEqual([
      {
        description: "Track sensor — No beam on lane 2",
        category: "Other",
        severity: "MEDIUM",
        status: "REPORTED",
      },
    ]);
  });

  it("returns null compliance when nothing is due", () => {
    expect(pmCompliancePercent(0, 0)).toBeNull();
    expect(pmCompliancePercent(3, 1)).toBe(75);
  });
});

describe("availability, reliability, import, alerts", () => {
  it("computes operational percent from working over active machines", () => {
    expect(operationalPercent(22, 25)).toBe(88);
    expect(operationalPercent(0, 0)).toBeNull();
  });

  it("does not return a machine to working while another fault is open", () => {
    expect(
      nextMachineStatus({
        proposed: "WORKING",
        openFaultCountExcludingCurrent: 1,
        current: "UNDER_REPAIR",
      }),
    ).toBe("UNDER_REPAIR");
  });

  it("hides MTTR and MTBF until there is enough history", () => {
    expect(mttrHours([{ startedAt: "2026-09-01T00:00:00Z", endedAt: "2026-09-01T02:00:00Z" }])).toBeNull();
    expect(
      mttrHours([
        { startedAt: "2026-09-01T00:00:00Z", endedAt: "2026-09-01T02:00:00Z" },
        { startedAt: "2026-09-02T00:00:00Z", endedAt: "2026-09-02T04:00:00Z" },
        { startedAt: "2026-09-03T00:00:00Z", endedAt: "2026-09-03T03:00:00Z" },
      ]),
    ).toBe(3);
    expect(mtbfDays(["2026-09-01", "2026-09-02"])).toBeNull();
    expect(mtbfDays(["2026-09-01", "2026-09-11", "2026-09-21"])).toBe(10);
  });

  it("flags an import row that cannot be mapped and does not guess", () => {
    const machines = [
      { id: "m1", assetCode: "UA-ARCAR-001", name: "RC Car #1", locationCode: "UA" },
    ];
    expect(matchImportMachine({ assetCode: "UA-ARCAR-001" }, machines)).toEqual({ machineId: "m1" });
    expect(matchImportMachine({ machineName: "RC Car", locationCode: "UA" }, machines)).toEqual({
      needsMapping: true,
      reason: "Machine name and site do not match a machine",
    });
    const unmapped = matchImportMachine({ machineName: "Pink car" }, machines);
    expect("needsMapping" in unmapped && unmapped.needsMapping).toBe(true);
  });

  it("groups ageing rules so a 7 day fault is not also a 24 hour alert", () => {
    const alerts = buildAlertDrafts({
      now: "2026-09-29T12:00:00Z",
      machines: [],
      faults: [
        {
          id: "f1",
          ticketNumber: "ARC-2026-0001",
          machineId: "m1",
          status: "UNDER_REPAIR",
          severity: "HIGH",
          reportedAt: "2026-09-20T12:00:00Z",
          isRepeat: false,
        },
      ],
      cases: [],
      parts: [],
      observationFailedIds: [],
    });
    expect(alerts.map((alert) => alert.rule)).toEqual(["fault_7d"]);
  });
});
