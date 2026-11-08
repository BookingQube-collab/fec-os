import { describe, expect, it } from "vitest";

import {
  normalizePayrollCycle,
  periodBoundsForCycle,
  PAYROLL_CYCLE_CALENDAR_MONTH,
  PAYROLL_CYCLE_FEC_28_27,
} from "@/lib/attendance-hr/payroll-cycle";

describe("payroll cycle", () => {
  it("defaults to FEC 28–27", () => {
    expect(normalizePayrollCycle(null)).toBe(PAYROLL_CYCLE_FEC_28_27);
    const fec = periodBoundsForCycle("2026-11", PAYROLL_CYCLE_FEC_28_27);
    expect(fec.dateFrom).toBe("2026-10-28");
    expect(fec.dateTo).toBe("2026-11-27");
  });

  it("supports calendar month for HO override", () => {
    const cal = periodBoundsForCycle("2026-11", PAYROLL_CYCLE_CALENDAR_MONTH);
    expect(cal.dateFrom).toBe("2026-11-01");
    expect(cal.dateTo).toBe("2026-11-30");
  });
});
