import { describe, expect, it } from "vitest";

import {
  aggregateLineStats,
  buildEventPayrollKpis,
  eventPayrollUiStatus,
  formatPayrollMonthLabel,
  formatQarAmount,
} from "@/lib/people-event-payroll-display";

describe("people-event-payroll-display", () => {
  it("maps workflow statuses to mockup UI buckets", () => {
    expect(eventPayrollUiStatus("locked")).toBe("completed");
    expect(eventPayrollUiStatus("paid")).toBe("completed");
    expect(eventPayrollUiStatus("draft")).toBe("open");
    expect(eventPayrollUiStatus("hr_review")).toBe("in_review");
  });

  it("formats month and QAR without inventing values", () => {
    expect(formatPayrollMonthLabel("2026-12")).toMatch(/Dec.*2026|2026.*Dec/);
    expect(formatQarAmount(184250)).toBe("QAR 184,250.00");
  });

  it("aggregates line stats and KPI totals from real rows", () => {
    const stats = aggregateLineStats([
      { periodId: "a", staffId: "s1", netQar: 100, workingHours: 10 },
      { periodId: "a", staffId: "s2", netQar: 50, workingHours: 5 },
      { periodId: "b", staffId: "s1", netQar: 20, workingHours: null },
    ]);
    expect(stats.get("a")).toEqual({
      crewCount: 2,
      totalHours: 15,
      payrollAmountQar: 150,
    });
    const kpis = buildEventPayrollKpis(
      [
        { id: "a", month: "2026-12", status: "locked" },
        { id: "b", month: "2026-11", status: "draft" },
      ],
      stats,
      2,
    );
    expect(kpis.totalPeriods).toBe(2);
    expect(kpis.completedPeriods).toBe(1);
    expect(kpis.completedPct).toBe(50);
    expect(kpis.crewPaid).toBe(2);
    expect(kpis.totalHours).toBe(15);
    expect(kpis.payrollAmountQar).toBe(170);
    expect(kpis.totalPeriodsDeltaPct).toBeNull();
  });
});
