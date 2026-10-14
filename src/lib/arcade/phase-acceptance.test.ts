import { describe, expect, it } from "vitest";

import { canUseArcadeTechnical } from "@/lib/arcade/access";
import { consumeStock, faultsFromPmChecklist, machineStatusForFault, nextMachineStatus, nextPmDate } from "@/lib/arcade/domain";
import { scheduleForMachine } from "@/lib/arcade/pm-plan";
import { mtbfDays, mttrHours } from "@/lib/arcade/domain";
import { arcadeReportCsv, buildWeeklyArcadeReport, technicianWorkload } from "@/lib/arcade/reports";
import { applyTaskSignoff, taskDraftFromSource } from "@/lib/arcade/task-board";
import { transferStock } from "@/lib/arcade/stock-ledger";

const SITE = "site-a";

/**
 * Phase 13 workflow checks that can run without a signed-in browser session.
 * Create/edit, QR, and the live screens still need the app and database.
 */
describe("arcade phase acceptance", () => {
  it("keeps one schedule per game and advances the next visit", () => {
    const row = scheduleForMachine(
      [
        { id: "old", machine_id: "m1", next_due_on: "2026-10-01", active: true },
        { id: "later", machine_id: "m1", next_due_on: "2026-11-01", active: true },
      ],
      "m1",
    );
    expect(row?.id).toBe("old");
    expect(nextPmDate("WEEKLY", "2026-10-01")).toBe("2026-10-08");
  });

  it("opens a fault from a failed inspection and returns the machine when that fault closes", () => {
    const faults = faultsFromPmChecklist([
      { label: "Belts", result: "PASS" },
      { label: "Sensor", result: "FAIL", notes: "Dark lane" },
    ]);
    expect(faults).toHaveLength(1);
    expect(faults[0]?.description).toContain("Sensor");
    expect(machineStatusForFault("RESOLVED")).toBe("WORKING");
    expect(
      nextMachineStatus({ proposed: "WORKING", openFaultCountExcludingCurrent: 0, current: "UNDER_REPAIR" }),
    ).toBe("WORKING");
    expect(
      nextMachineStatus({ proposed: "WORKING", openFaultCountExcludingCurrent: 1, current: "UNDER_REPAIR" }),
    ).toBe("UNDER_REPAIR");
  });

  it("requests stock by deducting it and transfers the remainder without going negative", () => {
    expect(consumeStock({ onHand: 4, quantity: 1, minimum: 1 }).onHand).toBe(3);
    expect(transferStock({
      fromOnHand: 3,
      toOnHand: 0,
      quantity: 2,
      fromLocationId: "warehouse",
      toLocationId: SITE,
    })).toEqual({ fromOnHand: 1, toOnHand: 2 });
  });

  it("lets a supervisor sign off someone else's card and keeps a technician off another site", () => {
    const card = {
      ...taskDraftFromSource({
        sourceType: "fault",
        sourceId: "fault-1",
        title: "Sensor repair",
        dueOn: "2026-10-14",
        technicianStaffId: "tech-1",
        priority: "high",
      }),
      id: "card-1",
      estimatedMinutes: 30,
      actualMinutes: 40,
      status: "DONE" as const,
      evidence: "Sensor replaced and tested",
      verification: "PENDING" as const,
    };
    expect(applyTaskSignoff(card, "APPROVED", { staffId: "tech-1", canVerify: true }).ok).toBe(false);
    const signed = applyTaskSignoff(card, "APPROVED", { staffId: "lead-1", canVerify: true });
    expect(signed.ok && signed.task.verification).toBe("APPROVED");
    expect(
      canUseArcadeTechnical(
        { roles: ["cashier_host"], jobTitle: "FEC Technician", staffRole: "technician", locationIds: [SITE] },
        "site-b",
      ),
    ).toBe(false);
  });

  it("withholds mean-time figures and names unassigned faults when the sample is incomplete", () => {
    expect(mttrHours([])).toBeNull();
    expect(mtbfDays(["2026-10-01"])).toBeNull();
    const report = buildWeeklyArcadeReport({
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      generatedAt: "2026-10-14T00:00:00Z",
      sites: [],
      opened: 0,
      resolved: 0,
      pending: 0,
      waitingParts: 0,
      waitingSuppliers: 0,
      repeatFaults: 0,
      pmCompleted: 0,
      pmOverdue: 0,
      partsConsumed: 0,
      partsCost: 0,
      faults: [],
    });
    expect(report.availability).toBeNull();
    const load = technicianWorkload([
      { technicianStaffId: null, technicianName: null, resolved: false },
      { technicianStaffId: "tech-1", technicianName: "Nabil", resolved: false },
    ]);
    expect(load.unassigned).toBe(1);
    expect(load.technicians[0]?.name).toBe("Nabil");
    expect(arcadeReportCsv([])).toContain("ticket,machine,site");
  });
});
