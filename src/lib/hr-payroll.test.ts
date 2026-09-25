import { describe, expect, it } from "vitest";

import { canMarkPayrollPosted } from "./hr-ot";
import { HR_POLICY_DEFAULTS } from "./hr-policy";
import {
  assertCanDeletePayrollPeriod,
  assertPeriodEditable,
  buildWpsExportRows,
  canDeletePayrollPeriod,
  computeDailyRateBasicQar,
  computePayrollLineAmounts,
  computeProrationFactor,
  fecPeriodForMonth,
  filterConsumableOtClaims,
  isDailyRateCompensation,
  lockedLineResistsPolicyChange,
  partitionByPaymentMethod,
  resolveDailyRatePayroll,
  resolvePaymentMethod,
  sumOtAmounts,
} from "./hr-payroll";

describe("daily-rate joker pay", () => {
  it("detects day-rate when monthly is empty", () => {
    expect(isDailyRateCompensation({ monthlySalaryQar: null, dailyRateQar: 1200 })).toBe(true);
    expect(isDailyRateCompensation({ monthlySalaryQar: 0, dailyRateQar: 1200 })).toBe(true);
    expect(isDailyRateCompensation({ monthlySalaryQar: 5000, dailyRateQar: 1200 })).toBe(false);
    expect(isDailyRateCompensation({ monthlySalaryQar: null, dailyRateQar: null })).toBe(false);
  });

  it("computes basic as day_rate × present punch days", () => {
    expect(computeDailyRateBasicQar(1200, 18)).toBe(21600);
    expect(computeDailyRateBasicQar(1200, 0)).toBe(0);
  });

  it("treats joker monthly-filed amount as day rate", () => {
    expect(
      resolveDailyRatePayroll({
        employmentType: "joker",
        monthlySalaryQar: 150,
        dailyRateQar: null,
      }),
    ).toEqual({ dailyPay: true, dayRateQar: 150 });
    expect(
      resolveDailyRatePayroll({
        employmentType: "joker",
        monthlySalaryQar: 150,
        dailyRateQar: 120,
      }),
    ).toEqual({ dailyPay: true, dayRateQar: 120 });
    expect(
      resolveDailyRatePayroll({
        employmentType: "permanent",
        monthlySalaryQar: 4000,
        dailyRateQar: null,
      }),
    ).toEqual({ dailyPay: false, dayRateQar: null });
    expect(computeDailyRateBasicQar(150, 12)).toBe(1800);
  });
});

describe("AT#11 separates WPS / cheque / bank-transfer employees", () => {
  it("resolves defaults by employment category", () => {
    expect(resolvePaymentMethod({ employmentCategory: "permanent" })).toBe("wps");
    expect(resolvePaymentMethod({ employmentCategory: "secondment" })).toBe("cheque");
    expect(resolvePaymentMethod({ employmentCategory: "joker" })).toBe("cheque");
    expect(resolvePaymentMethod({ employmentCategory: "family_visa" })).toBe("bank_transfer");
  });

  it("allows per-employee override", () => {
    expect(
      resolvePaymentMethod({ override: "bank_transfer", employmentCategory: "permanent" }),
    ).toBe("bank_transfer");
  });

  it("partitions lines by payment method", () => {
    const parts = partitionByPaymentMethod([
      { paymentMethod: "wps" as const, id: "1" },
      { paymentMethod: "cheque" as const, id: "2" },
      { paymentMethod: "bank_transfer" as const, id: "3" },
      { paymentMethod: "wps" as const, id: "4" },
      { paymentMethod: "cash" as const, id: "5" },
    ]);
    expect(parts.wps).toHaveLength(2);
    expect(parts.cheque).toHaveLength(1);
    expect(parts.bank_transfer).toHaveLength(1);
    expect(parts.cash).toHaveLength(1);
  });

  it("builds WPS export with SIF-like headers", () => {
    const rows = buildWpsExportRows([
      {
        employeeCode: "E1",
        employeeName: "Ali",
        month: "2026-09",
        fixedIncome: 4000,
        variableIncome: 200,
        deductions: 100,
        netQar: 4100,
        paymentMethod: "wps",
        iban: "QA00",
      },
    ]);
    expect(rows[0]?.[0]).toBe("Employee ID");
    expect(rows[1]?.[10]).toBe("4100");
  });
});

describe("AT#12 unpaid leave / absence affects net", () => {
  it("deducts unpaid leave days from net", () => {
    const proration = computeProrationFactor({
      dateFrom: "2026-08-28",
      dateTo: "2026-09-27",
      unpaidLeaveDays: 0,
    });
    const full = computePayrollLineAmounts({
      basicQar: 3000,
      proration,
      paymentMethod: "wps",
      unpaidLeaveDays: 0,
      dailyRateQar: 100,
    });
    const withLeave = computePayrollLineAmounts({
      basicQar: 3000,
      proration: { ...proration, unpaidLeaveDays: 3 },
      paymentMethod: "wps",
      unpaidLeaveDays: 3,
      dailyRateQar: 100,
    });
    expect(withLeave.netQar).toBe(full.netQar - 300);
    expect(withLeave.deductions.some((d) => d.code === "unpaid_leave")).toBe(true);
  });

  it("prorates when hire mid-cycle", () => {
    const mid = computeProrationFactor({
      dateFrom: "2026-08-28",
      dateTo: "2026-09-27",
      hireDate: "2026-09-13",
    });
    expect(mid.factor).toBeLessThan(1);
    expect(mid.activeDays).toBeLessThan(mid.periodDays);
  });
});

describe("AT#4 regression — OT enters payroll only once", () => {
  it("consumes only hr_approved claims", () => {
    const claims = [
      { status: "hr_approved", amountQar: 150 },
      { status: "payroll_posted", amountQar: 200 },
      { status: "submitted", amountQar: 50 },
    ];
    const consumable = filterConsumableOtClaims(claims);
    expect(consumable).toHaveLength(1);
    expect(sumOtAmounts(consumable)).toBe(150);
    expect(canMarkPayrollPosted("payroll_posted")).toBe(false);
  });
});

describe("AT#20 locked period resists edit / policy rewrite", () => {
  it("blocks edit when locked", () => {
    expect(() => assertPeriodEditable("locked")).toThrow(/Locked payroll period/);
    expect(() => assertPeriodEditable("draft")).not.toThrow();
  });

  it("policy change does not mutate locked line amounts", () => {
    const locked = computePayrollLineAmounts({
      basicQar: 4000,
      proration: { factor: 1, unpaidLeaveDays: 0 },
      paymentMethod: "wps",
    });
    const afterPolicy = lockedLineResistsPolicyChange(locked, 9000);
    expect(afterPolicy.grossQar).toBe(locked.grossQar);
    expect(afterPolicy.netQar).toBe(locked.netQar);
    expect(afterPolicy.netQar).not.toBe(9000);
  });
});

describe("FEC cycle helpers", () => {
  it("uses 28–27 bounds for month", () => {
    const p = fecPeriodForMonth("2026-09");
    expect(p.dateFrom).toBe("2026-08-28");
    expect(p.dateTo).toBe("2026-09-27");
  });

  it("policy defaults stay QAR / Asia/Qatar", () => {
    expect(HR_POLICY_DEFAULTS.payroll.currency).toBe("QAR");
    expect(HR_POLICY_DEFAULTS.payroll.timezone).toBe("Asia/Qatar");
  });
});

describe("payroll period delete gate", () => {
  it("allows draft / attendance_validation / hr_review only", () => {
    expect(canDeletePayrollPeriod("draft")).toBe(true);
    expect(canDeletePayrollPeriod("attendance_validation")).toBe(true);
    expect(canDeletePayrollPeriod("hr_review")).toBe(true);
    expect(canDeletePayrollPeriod("finance_review")).toBe(false);
    expect(canDeletePayrollPeriod("paid")).toBe(false);
    expect(canDeletePayrollPeriod("locked")).toBe(false);
    expect(canDeletePayrollPeriod("not_a_real_status")).toBe(false);
  });

  it("tells locked periods to reopen first", () => {
    expect(() => assertCanDeletePayrollPeriod("locked")).toThrow(/reopen/i);
    expect(() => assertCanDeletePayrollPeriod("draft")).not.toThrow();
  });
});
