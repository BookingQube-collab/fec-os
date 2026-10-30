import { describe, expect, it } from "vitest";

import { financeHealthOnly, redactFinanceTotals } from "@/lib/events/finance";
import { FINANCE_REPORT_IDS, redactReportBlockForExport } from "@/lib/events/reports";
import { canUserDo } from "@/lib/rbac";

describe("events finance redaction", () => {
  it("redacts monetary fields while keeping presence flags", () => {
    const strip = {
      original: 100,
      revised: 120,
      committed: 80,
      actual: 50,
      forecast: 110,
      hasBudget: true,
      hasInvoices: true,
      marginPct: 12.5,
      finalRevenue: 200,
    };
    const redacted = redactFinanceTotals(strip);
    expect(redacted.hasBudget).toBe(true);
    expect(redacted.hasInvoices).toBe(true);
    expect(redacted.original).toBeNull();
    expect(redacted.revised).toBeNull();
    expect(redacted.committed).toBeNull();
    expect(redacted.finalRevenue).toBeNull();
    expect(redacted.marginPct).toBeNull();
  });

  it("exposes non-sensitive budget health without amounts", () => {
    expect(
      financeHealthOnly({ hasBudget: true, revised: 100, committed: 40, forecast: 90 }),
    ).toEqual({ hasBudget: true, hasInvoices: false, health: "under" });
    expect(
      financeHealthOnly({ hasBudget: true, revised: 100, committed: 120 }),
    ).toEqual({ hasBudget: true, hasInvoices: false, health: "over" });
  });
});

describe("report export finance redaction", () => {
  it("strips money columns and empties finance report rows without capability", () => {
    expect(FINANCE_REPORT_IDS.has("earned_value_lite")).toBe(true);
    const block = {
      id: "earned_value_lite" as const,
      finance: true,
      columns: [
        { key: "event", labelKey: "events.reports.cols.event" },
        { key: "earned", labelKey: "events.reports.cols.earnedValue", money: true },
        { key: "spi", labelKey: "events.reports.cols.spi" },
      ],
      rows: [{ event: "EVT-1", earned: 500, spi: 1.1 }],
    };
    const redacted = redactReportBlockForExport(block, false);
    expect(redacted.rows).toEqual([]);
    expect(redacted.columns.some((c) => c.money)).toBe(false);
  });
});

describe("events.finance vs events.view RBAC matrix", () => {
  it("view roles without finance cannot claim events.finance", () => {
    expect(canUserDo(["duty_manager"], "events.view")).toBe(true);
    expect(canUserDo(["duty_manager"], "events.finance")).toBe(false);
    expect(canUserDo(["tech_supervisor"], "events.view")).toBe(true);
    expect(canUserDo(["tech_supervisor"], "events.finance")).toBe(false);
    expect(canUserDo(["auditor"], "events.view")).toBe(true);
    expect(canUserDo(["auditor"], "events.finance")).toBe(false);
    expect(canUserDo(["branch_gm"], "events.view")).toBe(true);
    expect(canUserDo(["branch_gm"], "events.finance")).toBe(false);
  });

  it("finance roles include view and finance", () => {
    for (const role of ["ceo", "coo", "cfo", "regional_ops"] as const) {
      expect(canUserDo([role], "events.view")).toBe(true);
      expect(canUserDo([role], "events.finance")).toBe(true);
    }
  });

  it("floor roles stay outside both by default", () => {
    expect(canUserDo(["technician"], "events.view")).toBe(false);
    expect(canUserDo(["technician"], "events.finance")).toBe(false);
    expect(canUserDo(["cashier_host"], "events.view")).toBe(false);
  });
});
