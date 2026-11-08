import { describe, expect, it } from "vitest";

import { canMarkPayrollPosted } from "./hr-ot";
import { HR_POLICY_DEFAULTS } from "./hr-policy";
import {
  assertCanDeletePayrollPeriod,
  assertPayrollResetConfirmation,
  assertPeriodEditable,
  buildWpsExportRows,
  canDeletePayrollPeriod,
  computeDailyRateBasicQar,
  computePayrollLineAmounts,
  computeProrationFactor,
  resolveEarnedBasicQar,
  fecPeriodForMonth,
  filterConsumableOtClaims,
  filterPayableOtClaims,
  filterVisibleOtClaims,
  isDailyRateCompensation,
  isPayrollVisibleOtStatus,
  lockedLineResistsPolicyChange,
  computeDailyRateBasicFromHistory,
  mergeUnpaidDaysForPayroll,
  minutesToOtHours,
  otClaimMinutes,
  partitionByPaymentMethod,
  estimatePayrollReadinessPay,
  resolveDailyRatePayroll,
  resolveDayRateOnDate,
  resolveEarnedBasicWithPreviousWindow,
  resolvePaymentMethod,
  sumOtAmounts,
  sumVisibleOtAmountsByStaff,
  sumVisibleOtMinutesByStaff,
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

  it("resolves joker day rate from salary history as-of work date", () => {
    const history = [
      { effectiveOn: "2026-03-16", dailyRateQar: 60, createdAt: "2026-03-16T10:00:00Z" },
      { effectiveOn: "2026-01-01", dailyRateQar: 50, createdAt: "2026-01-01T10:00:00Z" },
    ];
    expect(
      resolveDayRateOnDate({
        workDate: "2026-02-10",
        history,
        employmentType: "joker",
        fallbackDailyRateQar: 60,
      }),
    ).toBe(50);
    expect(
      resolveDayRateOnDate({
        workDate: "2026-03-16",
        history,
        employmentType: "joker",
        fallbackDailyRateQar: 60,
      }),
    ).toBe(60);
    expect(
      resolveDayRateOnDate({
        workDate: "2025-12-20",
        history,
        employmentType: "joker",
        fallbackDailyRateQar: 60,
      }),
    ).toBe(60);
  });

  it("sums joker basic across mixed rate windows", () => {
    const history = [
      { effectiveOn: "2026-03-16", dailyRateQar: 60 },
      { effectiveOn: "2026-01-01", dailyRateQar: 50 },
    ];
    // 50+50+60+60 = 220; tied day counts keep the first rate seen (50).
    expect(
      computeDailyRateBasicFromHistory({
        workedDates: ["2026-03-10", "2026-03-11", "2026-03-20", "2026-03-21"],
        history,
        employmentType: "joker",
        fallbackDailyRateQar: 60,
      }),
    ).toEqual({ basicQar: 220, primaryDayRateQar: 50, distinctRates: 2 });
  });

  it("pays monthly staff from listing worked days, not the full basic", () => {
    const contract = 7800;
    // FEC payroll window 28 Jul–27 Aug is 31 calendar days, not a fixed 30.
    const periodDays = 31;
    const workedDays = 10;
    const earned = resolveEarnedBasicQar({
      dailyPay: false,
      contractBasicQar: contract,
      dailyRateQar: null,
      workedDays,
      periodDays,
    });
    const expected = Math.round(((contract / periodDays) * workedDays + Number.EPSILON) * 100) / 100;
    expect(earned).toBe(expected);
    expect(earned).toBe(2516.13);
    expect(earned).not.toBe(contract);
    // ÷30 paid the full contract at exactly 30 worked days even when the period is 31.
    const thirtyOfThirtyOne = resolveEarnedBasicQar({
      dailyPay: false,
      contractBasicQar: contract,
      dailyRateQar: contract / 30,
      workedDays: 30,
      periodDays,
    });
    expect(thirtyOfThirtyOne).toBe(7548.39);
    expect(thirtyOfThirtyOne).not.toBe(contract);
    expect(
      resolveEarnedBasicQar({
        dailyPay: false,
        contractBasicQar: contract,
        dailyRateQar: null,
        workedDays: 0,
        periodDays,
      }),
    ).toBe(0);
    expect(
      resolveEarnedBasicQar({
        dailyPay: true,
        contractBasicQar: contract,
        dailyRateQar: 150,
        workedDays: 10,
        periodDays,
      }),
    ).toBe(1500);
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
    const rows = buildWpsExportRows(
      [
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
      ],
      { employerEid: "EMP1", establishmentId: "EST1", salaryMonth: "2026-09" },
    );
    expect(rows[0]?.[0]).toBe("EHR");
    expect(rows[0]?.[1]).toBe("EMP1");
    expect(rows[2]?.[0]).toBe("Employee ID");
    const body = rows.find((r) => r[0] === "E1");
    expect(body?.[10]).toBe("4100");
    expect(rows.at(-1)?.[0]).toMatch(/^SCR\|/);
  });
});

describe("payroll readiness pay preview", () => {
  it("estimates monthly staff as contract ÷ period days × paid days (+ allowances)", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      dailyRateQar: null,
      contractBasicQar: 6000,
      allowancesQar: 500,
      paidDays: 30,
      periodDays: 30,
    });
    expect(preview.paySource).toBe("estimate");
    expect(preview.earnedBasicQar).toBe(6000);
    expect(preview.allowancesQar).toBe(500);
    expect(preview.payQar).toBe(6500);
  });

  it("estimates joker day-rate × paid days without allowances", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "joker",
      monthlySalaryQar: 150,
      dailyRateQar: null,
      paidDays: 24,
      periodDays: 31,
    });
    expect(preview.dailyPay).toBe(true);
    expect(preview.paySource).toBe("estimate");
    expect(preview.payQar).toBe(3600);
    expect(preview.allowancesQar).toBe(0);
  });

  it("marks missing compensation when no rate is set", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: null,
      dailyRateQar: null,
      paidDays: 28,
      periodDays: 31,
    });
    expect(preview.paySource).toBe("missing");
    expect(preview.payQar).toBe(0);
    expect(preview.missingCompensation).toBe(true);
  });

  it("uses previous day-rate for paid dates entirely inside the window", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "joker",
      monthlySalaryQar: null,
      dailyRateQar: 60,
      paidDays: 3,
      periodDays: 31,
      paidDates: ["2026-03-10", "2026-03-11", "2026-03-12"],
      previousWindow: {
        amountQar: 50,
        from: "2026-03-01",
        to: "2026-03-31",
        kind: "daily",
      },
    });
    expect(preview.usedPreviousWindow).toBe(true);
    expect(preview.previousDays).toBe(3);
    expect(preview.currentDays).toBe(0);
    expect(preview.payQar).toBe(150);
  });

  it("splits a straddling month between previous and current joker rates", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "joker",
      dailyRateQar: 60,
      paidDays: 4,
      periodDays: 31,
      paidDates: ["2026-03-14", "2026-03-15", "2026-03-16", "2026-03-17"],
      previousWindow: {
        amountQar: 50,
        from: "2026-03-01",
        to: "2026-03-15",
        kind: "daily",
      },
    });
    // 50+50 + 60+60
    expect(preview.previousDays).toBe(2);
    expect(preview.currentDays).toBe(2);
    expect(preview.payQar).toBe(220);
  });

  it("keeps current-only pay when no previous window is set", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "joker",
      dailyRateQar: 60,
      paidDays: 2,
      periodDays: 31,
      paidDates: ["2026-03-10", "2026-03-11"],
      previousWindow: null,
    });
    expect(preview.usedPreviousWindow).toBe(false);
    expect(preview.payQar).toBe(120);
  });

  it("splits a straddling month for monthly package previous price", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 4,
      periodDays: 30,
      paidDates: ["2026-05-14", "2026-05-15", "2026-05-16", "2026-05-17"],
      previousWindow: {
        amountQar: 4500,
        from: "2026-05-01",
        to: "2026-05-15",
        kind: "monthly",
      },
    });
    // (4500/30)*2 + (6000/30)*2 = 150+150 + 200+200 = 700
    expect(preview.previousDays).toBe(2);
    expect(preview.currentDays).toBe(2);
    expect(preview.earnedBasicQar).toBe(700);
    expect(preview.payQar).toBe(700);
  });

  it("adds submitted OT formula amounts into readiness Pay", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 30,
      periodDays: 30,
      otQar: 187.5,
    });
    expect(preview.otQar).toBe(187.5);
    expect(preview.earnedBasicQar).toBe(6000);
    expect(preview.payQar).toBe(6187.5);
  });

  it("adds unpaid air-ticket allowance into readiness Pay", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 30,
      periodDays: 30,
      otQar: 100,
      airTicketQar: 1200,
    });
    expect(preview.otQar).toBe(100);
    expect(preview.airTicketQar).toBe(1200);
    expect(preview.payQar).toBe(7300);
  });

  it("pays a full day when punch-in is on time (no lateDates)", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 1,
      periodDays: 30,
      paidDates: ["2026-03-10"],
      lateDates: [],
    });
    expect(preview.lateDays).toBe(0);
    expect(preview.earnedBasicQar).toBe(200);
    expect(preview.payQar).toBe(200);
  });

  it("deducts late punch-in as half-day salary", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 2,
      periodDays: 30,
      paidDates: ["2026-03-10", "2026-03-11"],
      lateDates: ["2026-03-11"],
    });
    // on-time 200 + late 100 = 300
    expect(preview.lateDays).toBe(1);
    expect(preview.currentDays).toBe(1.5);
    expect(preview.earnedBasicQar).toBe(300);
    expect(preview.payQar).toBe(300);
  });

  it("applies configured full-day late deduct and period escalation", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 3,
      periodDays: 30,
      paidDates: ["2026-03-10", "2026-03-11", "2026-03-12"],
      lateDates: ["2026-03-10", "2026-03-11", "2026-03-12"],
      lateDeductPolicy: {
        enabled: true,
        unitsPerLateDay: 0.5,
        escalateAfterCount: 3,
        escalateExtraUnits: 1,
      },
    });
    // 3 × 0.5 − 1 escalate = 0.5 paid units → 100 QAR
    expect(preview.lateDays).toBe(3);
    expect(preview.currentDays).toBe(0.5);
    expect(preview.earnedBasicQar).toBe(100);
  });

  it("skips late deduct when policy disabled", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 1,
      periodDays: 30,
      paidDates: ["2026-03-11"],
      lateDates: ["2026-03-11"],
      lateDeductPolicy: {
        enabled: false,
        unitsPerLateDay: 0.5,
        escalateAfterCount: 0,
        escalateExtraUnits: 1,
      },
    });
    expect(preview.earnedBasicQar).toBe(200);
    expect(preview.currentDays).toBe(1);
  });

  it("keeps late half-day on previous-price window days", () => {
    const preview = estimatePayrollReadinessPay({
      employmentType: "joker",
      dailyRateQar: 60,
      paidDays: 2,
      periodDays: 31,
      paidDates: ["2026-03-10", "2026-03-11"],
      lateDates: ["2026-03-10"],
      previousWindow: {
        amountQar: 50,
        from: "2026-03-01",
        to: "2026-03-31",
        kind: "daily",
      },
    });
    // late previous 25 + on-time previous 50 = 75
    expect(preview.usedPreviousWindow).toBe(true);
    expect(preview.previousDays).toBe(1.5);
    expect(preview.payQar).toBe(75);
  });

  it("does not cut leave/WO via lateDates that are not in paid worked set", () => {
    // Leave/WO dates are never listed as lateDates by listPayrollLateWorkedDates;
    // if a stale late date sneaks in but is not a paidDate, it is ignored.
    const preview = estimatePayrollReadinessPay({
      employmentType: "permanent",
      monthlySalaryQar: 6000,
      contractBasicQar: 6000,
      allowancesQar: 0,
      paidDays: 2,
      periodDays: 30,
      paidDates: ["2026-03-10", "2026-03-11"],
      lateDates: ["2026-03-99"],
    });
    expect(preview.lateDays).toBe(0);
    expect(preview.earnedBasicQar).toBe(400);
  });
});

describe("resolveEarnedBasicWithPreviousWindow", () => {
  it("pays the full previous package when every paid day is inside the window", () => {
    const paidDates = Array.from({ length: 30 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `2026-05-${day}`;
    });
    const result = resolveEarnedBasicWithPreviousWindow({
      dailyPay: false,
      contractBasicQar: 6000,
      dailyRateQar: null,
      paidDates,
      periodDays: 30,
      previousWindow: {
        amountQar: 4500,
        from: "2026-05-01",
        to: "2026-05-31",
        kind: "monthly",
      },
    });
    expect(result.usedPreviousWindow).toBe(true);
    expect(result.previousDays).toBe(30);
    expect(result.earnedBasicQar).toBe(4500);
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

  it("merges attendance absences with leave unpaid without double-counting synced leave", () => {
    expect(
      mergeUnpaidDaysForPayroll({
        leaveUnpaidDays: 2,
        attendanceAbsentDays: 3,
        attendanceUnpaidLeaveDays: 2,
      }),
    ).toBe(5);
    expect(
      mergeUnpaidDaysForPayroll({
        leaveUnpaidDays: 0,
        attendanceAbsentDays: 4,
        attendanceUnpaidLeaveDays: 1,
      }),
    ).toBe(5);
    expect(
      mergeUnpaidDaysForPayroll({
        leaveUnpaidDays: 3,
        attendanceAbsentDays: 0,
        attendanceUnpaidLeaveDays: 0,
      }),
    ).toBe(3);
  });

  it("deducts attendance absences from monthly net at daily rate", () => {
    const proration = computeProrationFactor({
      dateFrom: "2026-07-28",
      dateTo: "2026-08-27",
    });
    const unpaidDays = mergeUnpaidDaysForPayroll({
      leaveUnpaidDays: 0,
      attendanceAbsentDays: 2,
      attendanceUnpaidLeaveDays: 0,
    });
    const full = computePayrollLineAmounts({
      basicQar: 3000,
      proration,
      paymentMethod: "wps",
      unpaidLeaveDays: 0,
      dailyRateQar: 100,
    });
    const withAbsent = computePayrollLineAmounts({
      basicQar: 3000,
      proration: { ...proration, unpaidLeaveDays: unpaidDays },
      paymentMethod: "wps",
      unpaidLeaveDays: unpaidDays,
      dailyRateQar: 100,
    });
    expect(withAbsent.netQar).toBe(full.netQar - 200);
    expect(withAbsent.deductions.some((d) => d.code === "unpaid_leave")).toBe(true);
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
  it("marks payroll_posted only for gm_approved; Pay still sums submitted pipeline amounts", () => {
    const claims = [
      { status: "gm_approved", amountQar: 150, staff_id: "a" },
      { status: "payroll_posted", amountQar: 200, staff_id: "a" },
      { status: "submitted", amountQar: 50, staff_id: "a" },
    ];
    const consumable = filterConsumableOtClaims(claims);
    expect(consumable).toHaveLength(1);
    expect(sumOtAmounts(consumable)).toBe(150);
    expect(canMarkPayrollPosted("payroll_posted")).toBe(false);

    const payable = filterPayableOtClaims(claims);
    expect(payable).toHaveLength(3);
    expect(sumOtAmounts(payable)).toBe(400);
    expect(sumVisibleOtAmountsByStaff(claims).get("a")).toBe(400);
  });
});

describe("payroll visible / submitted OT hours", () => {
  it("includes submitted Ops/F&B pipeline statuses but not cancelled/rejected/draft", () => {
    expect(isPayrollVisibleOtStatus("submitted")).toBe(true);
    expect(isPayrollVisibleOtStatus("ops_approved")).toBe(true);
    expect(isPayrollVisibleOtStatus("gm_approved")).toBe(true);
    expect(isPayrollVisibleOtStatus("draft")).toBe(false);
    expect(isPayrollVisibleOtStatus("cancelled")).toBe(false);
    expect(isPayrollVisibleOtStatus("rejected")).toBe(false);
    expect(isPayrollVisibleOtStatus("changes_requested")).toBe(false);
  });

  it("prefers approved minutes then claimed, and sums by staff", () => {
    expect(otClaimMinutes({ claimed_minutes: 90, approved_minutes: 120 })).toBe(120);
    expect(otClaimMinutes({ claimedMinutes: 45 })).toBe(45);
    expect(minutesToOtHours(90)).toBe(1.5);

    const byStaff = sumVisibleOtMinutesByStaff([
      { staff_id: "ops1", status: "submitted", claimed_minutes: 60 },
      { staff_id: "ops1", status: "ops_approved", claimed_minutes: 90, approved_minutes: 90 },
      { staff_id: "fnb1", status: "submitted", claimed_minutes: 180 },
      { staff_id: "fnb1", status: "cancelled", claimed_minutes: 999 },
      { staff_id: "x", status: "rejected", claimed_minutes: 40 },
    ]);
    expect(byStaff.get("ops1")).toBe(150);
    expect(byStaff.get("fnb1")).toBe(180);
    expect(byStaff.has("x")).toBe(false);
    expect(filterVisibleOtClaims([{ status: "submitted" }, { status: "draft" }])).toHaveLength(1);
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

describe("remove all payroll confirmation", () => {
  it("accepts only the exact admin phrase", () => {
    expect(() => assertPayrollResetConfirmation("REMOVE ALL PAYROLL")).not.toThrow();
    expect(() => assertPayrollResetConfirmation("  REMOVE ALL PAYROLL  ")).not.toThrow();
    expect(() => assertPayrollResetConfirmation("remove all payroll")).toThrow(/REMOVE ALL PAYROLL/);
    expect(() => assertPayrollResetConfirmation("")).toThrow(/cannot be undone/i);
  });
});
