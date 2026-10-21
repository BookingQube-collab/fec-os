import { describe, expect, it } from "vitest";

import { computeAttendanceOvertimeMinutes } from "@/lib/attendance-hr/overtime";

import {
  aggregateOtSummaries,
  assertCanMarkPayrollPosted,
  assertMinClaimableMinutes,
  assertOtTransition,
  canEditOtBeforeHoo,
  canMarkPayrollPosted,
  canRequestOtChanges,
  canTransitionOt,
  computeOtAmountQar,
  filterOtRequestGroups,
  groupOtClaimsIntoRequests,
  hourlyRateFromPay,
  isOtEligible,
  isSupervisorOtContract,
  mergeSupervisorOtTeamStaffIds,
  otApprovalQueueStatuses,
  otMissingBasicPayNote,
  otPayDaysPerMonth,
  isSupervisorOtStaffEntryReady,
  normalizeSupervisorOtDays,
  partitionSupervisorOtPicks,
  resolveEligibleOtMinutes,
  resolveStaffOtPayFromCompensation,
  resolveStaffOtPayFromSalaryHistory,
  shouldRefreshOtAmountForMissingBasic,
  sumSupervisorOtDayHours,
  supervisorOtClaimSlots,
  supervisorOtContractMessage,
  supervisorOtStaffFieldErrors,
  resolveOtRateMultiplier,
  roundOtMinutes,
} from "./hr-ot";
import { HR_POLICY_DEFAULTS } from "./hr-policy";

describe("OT claim transitions", () => {
  it("lets employee submit draft and cancel submitted", () => {
    expect(canTransitionOt("draft", "submitted", "employee")).toBe(true);
    expect(canTransitionOt("submitted", "cancelled", "employee")).toBe(true);
    expect(canTransitionOt("submitted", "hr_approved", "employee")).toBe(false);
  });

  it("walks site supervisor → HOO → HR → payroll_posted", () => {
    expect(canTransitionOt("submitted", "manager_verified", "manager")).toBe(true);
    expect(canTransitionOt("manager_verified", "ops_approved", "ops")).toBe(true);
    expect(canTransitionOt("ops_approved", "hr_approved", "hr")).toBe(true);
    expect(canTransitionOt("hr_approved", "payroll_posted", "hr")).toBe(true);
    expect(canTransitionOt("hr_approved", "payroll_posted", "payroll")).toBe(true);
    expect(canTransitionOt("manager_verified", "hr_approved", "hr")).toBe(false);
  });

  it("blocks illegal transitions", () => {
    expect(() => assertOtTransition("payroll_posted", "hr_approved", "hr")).toThrow(/cannot move/);
    expect(() => assertOtTransition("rejected", "submitted", "employee")).toThrow(/cannot move/);
  });

  it("queues by site / HOO / HR capability", () => {
    expect(
      otApprovalQueueStatuses({ canSiteVerify: true, canOpsApprove: false, canHrApprove: false }),
    ).toEqual(["submitted"]);
    expect(
      otApprovalQueueStatuses({ canSiteVerify: false, canOpsApprove: true, canHrApprove: false }),
    ).toEqual(["manager_verified"]);
    expect(
      otApprovalQueueStatuses({ canSiteVerify: false, canOpsApprove: false, canHrApprove: true }),
    ).toEqual(["ops_approved"]);
    expect(
      otApprovalQueueStatuses({ canSiteVerify: true, canOpsApprove: true, canHrApprove: true }),
    ).toEqual(["submitted", "manager_verified", "ops_approved"]);
  });

  it("locks edits after Head of Operations approves", () => {
    expect(canEditOtBeforeHoo("submitted")).toBe(true);
    expect(canEditOtBeforeHoo("manager_verified")).toBe(true);
    expect(canEditOtBeforeHoo("changes_requested")).toBe(true);
    expect(canEditOtBeforeHoo("ops_approved")).toBe(false);
    expect(canEditOtBeforeHoo("hr_approved")).toBe(false);
  });

  it("lets approvers request changes, then submitter resubmit", () => {
    expect(canRequestOtChanges("submitted")).toBe(true);
    expect(canRequestOtChanges("manager_verified")).toBe(true);
    expect(canRequestOtChanges("ops_approved")).toBe(true);
    expect(canRequestOtChanges("hr_approved")).toBe(false);
    expect(canTransitionOt("submitted", "changes_requested", "manager")).toBe(true);
    expect(canTransitionOt("manager_verified", "changes_requested", "ops")).toBe(true);
    expect(canTransitionOt("ops_approved", "changes_requested", "hr")).toBe(true);
    expect(canTransitionOt("changes_requested", "submitted", "employee")).toBe(true);
    expect(canTransitionOt("changes_requested", "cancelled", "employee")).toBe(true);
    expect(canTransitionOt("hr_approved", "changes_requested", "hr")).toBe(false);
  });
});

describe("OT request grouping", () => {
  it("groups multi-date claims under one batch id", () => {
    const groups = groupOtClaimsIntoRequests([
      {
        id: "c1",
        requestBatchId: "b1",
        requestNumber: "OT-20261017-0001",
        staffId: "s1",
        staffName: "Pabitra Acharya",
        workDate: "2026-10-17",
        eligibleMinutes: 1080,
        claimedMinutes: 1080,
        approvedMinutes: 1080,
        rateType: "weekday",
        rateMultiplier: 1.25,
        amountQar: 0,
        basicQarSnapshot: null,
        status: "manager_verified",
        purpose: "Kids Driving School",
        claimSource: "supervisor",
      },
      {
        id: "c2",
        requestBatchId: "b1",
        requestNumber: "OT-20261017-0001",
        staffId: "s1",
        staffName: "Pabitra Acharya",
        workDate: "2026-10-05",
        eligibleMinutes: 1080,
        claimedMinutes: 1080,
        approvedMinutes: 1080,
        rateType: "weekday",
        rateMultiplier: 1.25,
        amountQar: 0,
        basicQarSnapshot: null,
        status: "manager_verified",
        purpose: "Kids Driving School",
        claimSource: "supervisor",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.workDates).toEqual(["2026-10-05", "2026-10-17"]);
    expect(groups[0]!.totalClaimedMinutes).toBe(2160);
    expect(groups[0]!.missingBasicPay).toBe(true);
    expect(groups[0]!.requestNumber).toBe("OT-20261017-0001");
  });

  it("merges same-person supervisor day-rows without a batch id", () => {
    const groups = groupOtClaimsIntoRequests([
      {
        id: "c1",
        staffId: "s1",
        staffName: "Muhammad Sakib Hossain",
        workDate: "2023-12-10",
        eligibleMinutes: 120,
        claimedMinutes: 120,
        approvedMinutes: 120,
        rateType: "weekday",
        rateMultiplier: 1.25,
        amountQar: 10,
        status: "manager_verified",
        purpose: "Cover",
        claimSource: "supervisor",
        submittedBy: "u1",
        submittedAt: "2023-12-11T08:00:01.123Z",
      },
      {
        id: "c2",
        staffId: "s1",
        staffName: "Muhammad Sakib Hossain",
        workDate: "2023-12-09",
        eligibleMinutes: 120,
        claimedMinutes: 120,
        approvedMinutes: 120,
        rateType: "weekday",
        rateMultiplier: 1.25,
        amountQar: 10,
        status: "manager_verified",
        purpose: "Cover",
        claimSource: "supervisor",
        submittedBy: "u1",
        submittedAt: "2023-12-11T08:00:01.999Z",
      },
      {
        id: "c3",
        staffId: "s2",
        staffName: "Other Person",
        workDate: "2023-12-09",
        eligibleMinutes: 60,
        claimedMinutes: 60,
        approvedMinutes: 60,
        rateType: "weekday",
        rateMultiplier: 1.25,
        amountQar: 5,
        status: "manager_verified",
        purpose: "Cover",
        claimSource: "supervisor",
        submittedBy: "u1",
        submittedAt: "2023-12-11T08:00:01.500Z",
      },
    ]);
    expect(groups).toHaveLength(2);
    const sakib = groups.find((g) => g.staffNames.includes("Muhammad Sakib Hossain"));
    expect(sakib?.workDates).toEqual(["2023-12-09", "2023-12-10"]);
  });

  it("filters request groups by search, department, and location", () => {
    const groups = groupOtClaimsIntoRequests([
      {
        id: "c1",
        requestBatchId: "b1",
        requestNumber: "OT-20261017-0001",
        staffId: "s1",
        staffName: "Pabitra Acharya",
        employeeCode: "E001",
        department: "Operations",
        locationId: "loc1",
        locationName: "Doha Festival City",
        workDate: "2026-10-17",
        eligibleMinutes: 60,
        claimedMinutes: 60,
        approvedMinutes: 60,
        rateType: "weekday",
        rateMultiplier: 1.25,
        amountQar: 20,
        status: "manager_verified",
        purpose: "Kids Driving School",
        claimSource: "supervisor",
      },
      {
        id: "c2",
        requestBatchId: "b2",
        requestNumber: "OT-20261017-0002",
        staffId: "s2",
        staffName: "Al Amin",
        employeeCode: "E002",
        department: "F&B",
        locationId: "loc2",
        locationName: "Warehouse",
        workDate: "2026-10-05",
        eligibleMinutes: 120,
        claimedMinutes: 120,
        approvedMinutes: 120,
        rateType: "weekday",
        rateMultiplier: 1.25,
        amountQar: 40,
        status: "ops_approved",
        purpose: "Event cover",
        claimSource: "supervisor",
      },
    ]);
    expect(filterOtRequestGroups(groups, { q: "OT-20261017-0001" })).toHaveLength(1);
    expect(filterOtRequestGroups(groups, { q: "pabitra" })).toHaveLength(1);
    expect(filterOtRequestGroups(groups, { department: "F&B" })).toHaveLength(1);
    expect(filterOtRequestGroups(groups, { locationId: "loc1" })).toHaveLength(1);
    expect(filterOtRequestGroups(groups, { dateFrom: "2026-10-10" })).toHaveLength(1);
  });

  it("flags missing basic only when amount is zero without a basic snapshot", () => {
    expect(otMissingBasicPayNote({ amountQar: 0, basicQarSnapshot: null })).toBe(true);
    expect(otMissingBasicPayNote({ amountQar: 50, basicQarSnapshot: null })).toBe(false);
    expect(otMissingBasicPayNote({ amountQar: 0, basicQarSnapshot: 2000 })).toBe(false);
  });

  it("refreshes pending zero-amount claims once basic may be available", () => {
    expect(
      shouldRefreshOtAmountForMissingBasic({
        amountQar: 0,
        basicQarSnapshot: null,
        status: "submitted",
      }),
    ).toBe(true);
    expect(
      shouldRefreshOtAmountForMissingBasic({
        amountQar: 0,
        basicQarSnapshot: null,
        status: "manager_verified",
      }),
    ).toBe(true);
    expect(
      shouldRefreshOtAmountForMissingBasic({
        amountQar: 0,
        basicQarSnapshot: null,
        status: "payroll_posted",
      }),
    ).toBe(false);
    expect(
      shouldRefreshOtAmountForMissingBasic({
        amountQar: 0,
        basicQarSnapshot: null,
        status: "rejected",
      }),
    ).toBe(false);
    expect(
      shouldRefreshOtAmountForMissingBasic({
        amountQar: 12.5,
        basicQarSnapshot: null,
        status: "submitted",
      }),
    ).toBe(false);
    expect(
      shouldRefreshOtAmountForMissingBasic({
        amountQar: 0,
        basicQarSnapshot: 1000,
        status: "submitted",
      }),
    ).toBe(false);
  });
});

describe("OT pay from compensation / history", () => {
  it("prefers basic_qar over package total when housing/transport exist", () => {
    expect(
      resolveStaffOtPayFromCompensation({
        basic_qar: 1000,
        housing_qar: 500,
        transport_qar: 400,
        monthly_salary_qar: 2600,
        daily_rate_qar: null,
      }),
    ).toEqual({
      monthlyBasicQar: 1000,
      housingQar: 500,
      transportQar: 400,
      dailyRateQar: null,
    });
  });

  it("uses package total as basic only for legacy unsplit rows", () => {
    expect(
      resolveStaffOtPayFromCompensation({
        basic_qar: null,
        housing_qar: null,
        transport_qar: null,
        monthly_salary_qar: 2600,
        daily_rate_qar: null,
      })?.monthlyBasicQar,
    ).toBe(2600);
    expect(
      resolveStaffOtPayFromCompensation({
        basic_qar: null,
        housing_qar: 500,
        transport_qar: 400,
        monthly_salary_qar: 2600,
        daily_rate_qar: null,
      })?.monthlyBasicQar,
    ).toBeNull();
  });

  it("reads basic from salary history when compensation is absent", () => {
    expect(
      resolveStaffOtPayFromSalaryHistory({
        basic_qar: 1000,
        monthly_total_qar: 2600,
        daily_rate_qar: null,
        allowances: { housing: 500, transportation: 400 },
      }),
    ).toEqual({
      monthlyBasicQar: 1000,
      housingQar: 500,
      transportQar: 400,
      dailyRateQar: null,
    });
  });

  it("computes weekday OT from Qatar basic for 26-day supervisor contracts", () => {
    // basic 1000 / 26 / 8 = 4.8077…; 36h × 1.25 ≈ 216.35
    const hourly = hourlyRateFromPay({
      monthlyBasicQar: 1000,
      hoursPerDay: 8,
      daysPerMonth: 26,
    });
    expect(hourly).toBeCloseTo(1000 / 26 / 8, 5);
    expect(
      computeOtAmountQar({
        approvedMinutes: 36 * 60,
        rateMultiplier: 1.25,
        hourlyRateQar: hourly,
      }),
    ).toBe(Math.round(36 * hourly * 1.25 * 100) / 100);
  });
});

describe("AT#3 OT below 1 hour rejected", () => {
  it("rejects minutes below policy minimum after rounding down", () => {
    expect(() => assertMinClaimableMinutes(59, 60, "down")).toThrow(/below minimum/);
    expect(() => assertMinClaimableMinutes(59.9, 60, "down")).toThrow(/below minimum/);
  });

  it("accepts exactly 60 and above", () => {
    expect(assertMinClaimableMinutes(60, 60, "down")).toBe(60);
    expect(assertMinClaimableMinutes(90.7, 60, "down")).toBe(90);
  });

  it("uses policy default min_claimable_minutes of 60", () => {
    expect(HR_POLICY_DEFAULTS.ot.min_claimable_minutes).toBe(60);
  });
});

describe("AT#4 payroll_posted only once", () => {
  it("allows payroll_posted only from hr_approved", () => {
    expect(canMarkPayrollPosted("hr_approved")).toBe(true);
    expect(canMarkPayrollPosted("payroll_posted")).toBe(false);
    expect(canMarkPayrollPosted("manager_verified")).toBe(false);
  });

  it("throws when posting twice or from wrong status", () => {
    expect(() => assertCanMarkPayrollPosted("payroll_posted")).toThrow(/already payroll_posted/);
    expect(() => assertCanMarkPayrollPosted("submitted")).toThrow(/must be hr_approved/);
  });
});

describe("OT rounding and rates", () => {
  it("rounds down/up/minutes", () => {
    expect(roundOtMinutes(90.7, "down")).toBe(90);
    expect(roundOtMinutes(90.1, "up")).toBe(91);
    expect(roundOtMinutes(90.4, "minutes")).toBe(90);
  });

  it("resolves rate multipliers from policy", () => {
    const p = {
      rate_weekday: 1.25,
      rate_weekly_off: 1.5,
      rate_public_holiday: 1.5,
      rate_eid: 2.5,
    };
    expect(resolveOtRateMultiplier("weekday", p)).toBe(1.25);
    expect(resolveOtRateMultiplier("eid", p)).toBe(2.5);
  });

  it("eligibility defaults to secondment category", () => {
    const policy = { eligible_categories: ["secondment"], eligible_staff_ids: [] };
    expect(isOtEligible({ employmentCategory: "secondment", policy })).toBe(true);
    expect(isOtEligible({ employmentCategory: "permanent", policy })).toBe(false);
    expect(
      isOtEligible({
        employmentCategory: "permanent",
        staffId: "s1",
        policy: { ...policy, eligible_staff_ids: ["s1"] },
      }),
    ).toBe(true);
  });
});

describe("OT amount", () => {
  it("computes QAR from hourly × hours × multiplier", () => {
    const hourly = hourlyRateFromPay({ monthlyBasicQar: 4800, hoursPerDay: 8, daysPerMonth: 30 });
    expect(hourly).toBe(20); // 4800/30/8
    expect(
      computeOtAmountQar({ approvedMinutes: 120, rateMultiplier: 1.25, hourlyRateQar: hourly }),
    ).toBe(50);
  });

  it("uses Qatar basic/30/hoursPerDay × rate × OT hours (weekday 1.25)", () => {
    // basic 3000 / 30 / 8 = 12.5 hourly; 4 OT hours × 1.25 = 62.5
    const hourly = hourlyRateFromPay({ monthlyBasicQar: 3000, hoursPerDay: 8, daysPerMonth: 30 });
    expect(hourly).toBe(12.5);
    expect(
      computeOtAmountQar({ approvedMinutes: 240, rateMultiplier: 1.25, hourlyRateQar: hourly }),
    ).toBe(62.5);
  });

  it("swaps weekday 1.25 for off/holiday/Eid multipliers", () => {
    const hourly = hourlyRateFromPay({ monthlyBasicQar: 4800, hoursPerDay: 8, daysPerMonth: 30 });
    expect(
      computeOtAmountQar({ approvedMinutes: 60, rateMultiplier: 1.5, hourlyRateQar: hourly }),
    ).toBe(30);
    expect(
      computeOtAmountQar({ approvedMinutes: 60, rateMultiplier: 2.5, hourlyRateQar: hourly }),
    ).toBe(50);
  });

  it("does not inflate OT when package total is larger than basic", () => {
    const fromBasic = hourlyRateFromPay({ monthlyBasicQar: 2000, hoursPerDay: 8, daysPerMonth: 30 });
    const fromPackage = hourlyRateFromPay({ monthlyBasicQar: 2800, hoursPerDay: 8, daysPerMonth: 30 });
    expect(fromBasic).toBeCloseTo(8.333, 3);
    expect(fromPackage).toBeCloseTo(11.667, 3);
    expect(fromBasic).toBeLessThan(fromPackage);
  });
});

describe("26 and 28 day supervisor contracts", () => {
  it("treats only 26 and 28 as the supervisor claim path", () => {
    expect(isSupervisorOtContract(26)).toBe(true);
    expect(isSupervisorOtContract(28)).toBe(true);
    expect(isSupervisorOtContract(30)).toBe(false);
    expect(isSupervisorOtContract(null)).toBe(false);
    expect(supervisorOtContractMessage(26)).toMatch(/supervisor/i);
  });

  it("uses the contract as the monthly pay divisor", () => {
    expect(otPayDaysPerMonth({ contractWorkingDays: 26, policyDaysPerMonth: 30 })).toBe(26);
    expect(otPayDaysPerMonth({ contractWorkingDays: 28, policyDaysPerMonth: 30 })).toBe(28);
    expect(otPayDaysPerMonth({ contractWorkingDays: null, policyDaysPerMonth: 30 })).toBe(30);
    const hourly = hourlyRateFromPay({ monthlyBasicQar: 5200, hoursPerDay: 8, daysPerMonth: 26 });
    expect(hourly).toBe(25);
  });
});

describe("eligible minutes reuse attendance-hr", () => {
  it("prefers stored overtime_minutes over recomputed", () => {
    expect(
      resolveEligibleOtMinutes({
        storedOvertimeMinutes: 75,
        computedOvertimeMinutes: 40,
      }),
    ).toBe(75);
  });

  it("falls back to computeAttendanceOvertimeMinutes output", () => {
    const computed = computeAttendanceOvertimeMinutes({
      workedMinutes: 600,
      scheduledIn: "2026-09-01T09:00:00.000Z",
      scheduledOut: "2026-09-01T18:00:00.000Z",
      actualOut: "2026-09-01T20:00:00.000Z",
    });
    expect(computed).toBe(120);
    expect(resolveEligibleOtMinutes({ computedOvertimeMinutes: computed })).toBe(120);
  });
});

describe("monthly OT summaries", () => {
  it("aggregates by employee and location", () => {
    const rows = [
      {
        staffId: "a",
        staffName: "Ada",
        department: "Ops",
        employmentType: "secondment",
        locationId: "l1",
        locationName: "INF",
        eligibleMinutes: 120,
        approvedMinutes: 120,
        amountQar: 50,
        status: "hr_approved",
      },
      {
        staffId: "a",
        staffName: "Ada",
        department: "Ops",
        employmentType: "secondment",
        locationId: "l1",
        locationName: "INF",
        eligibleMinutes: 60,
        approvedMinutes: 60,
        amountQar: 25,
        status: "payroll_posted",
      },
      {
        staffId: "b",
        staffName: "Bob",
        department: "Ops",
        employmentType: "permanent",
        locationId: "l2",
        locationName: "UA",
        eligibleMinutes: 90,
        approvedMinutes: 0,
        amountQar: 0,
        status: "rejected",
      },
    ];
    const byEmp = aggregateOtSummaries(rows, "employee");
    expect(byEmp).toHaveLength(1);
    expect(byEmp[0].claims).toBe(2);
    expect(byEmp[0].amountQar).toBe(75);

    const byLoc = aggregateOtSummaries(rows, "location");
    expect(byLoc).toHaveLength(1);
    expect(byLoc[0].locationName).toBe("INF");
  });
});

describe("Supervisor OT multi-staff helpers", () => {
  it("partitions eligible 26/28 picks from the rest", () => {
    const { eligible, ineligible } = partitionSupervisorOtPicks([
      { id: "a", supervisorContract: true },
      { id: "b", supervisorContract: false },
      { id: "c", supervisorContract: true },
    ]);
    expect(eligible.map((row) => row.id)).toEqual(["a", "c"]);
    expect(ineligible.map((row) => row.id)).toEqual(["b"]);
  });

  it("builds one claim slot per staff × their dates", () => {
    expect(
      supervisorOtClaimSlots([
        { staffId: "b", workDates: ["2026-10-19", "2026-09-30", "2026-10-19"] },
        { staffId: "a", workDates: ["2026-10-20"] },
        { staffId: "a", workDates: ["2026-10-21"] },
      ]),
    ).toEqual([
      { staffId: "b", workDate: "2026-09-30" },
      { staffId: "b", workDate: "2026-10-19" },
      { staffId: "a", workDate: "2026-10-20" },
    ]);
  });

  it("skips staff with no dates", () => {
    expect(
      supervisorOtClaimSlots([
        { staffId: "a", workDates: [] },
        { staffId: "b", workDates: ["2026-10-18"] },
      ]),
    ).toEqual([{ staffId: "b", workDate: "2026-10-18" }]);
  });

  it("requires contract, dates, hours, and purpose per staff", () => {
    expect(
      supervisorOtStaffFieldErrors({
        supervisorContract: false,
        workDates: [],
        hours: 0,
        purpose: "ab",
      }),
    ).toEqual(["contract", "dates", "purpose"]);
    expect(
      isSupervisorOtStaffEntryReady({
        supervisorContract: true,
        workDates: ["2026-10-18"],
        hours: 2,
        purpose: "Event coverage",
      }),
    ).toBe(true);
  });

  it("validates per-day hours separately (not one combined total)", () => {
    expect(
      normalizeSupervisorOtDays([
        { workDate: "2026-10-19", hours: 2 },
        { workDate: "2026-10-18", hours: 3.5 },
        { workDate: "2026-10-19", hours: 4 },
        { workDate: "bad", hours: 1 },
        { workDate: "2026-10-20", hours: 0 },
      ]),
    ).toEqual([
      { workDate: "2026-10-18", hours: 3.5 },
      { workDate: "2026-10-19", hours: 4 },
    ]);
    expect(
      sumSupervisorOtDayHours([
        { hours: 2 },
        { hours: 3.5 },
      ]),
    ).toBe(5.5);
    expect(
      supervisorOtStaffFieldErrors({
        supervisorContract: true,
        days: [
          { workDate: "2026-10-18", hours: 2 },
          { workDate: "2026-10-19", hours: 0 },
        ],
        purpose: "Event coverage",
      }),
    ).toEqual(["hours"]);
    expect(
      isSupervisorOtStaffEntryReady({
        supervisorContract: true,
        days: [
          { workDate: "2026-10-18", hours: 2 },
          { workDate: "2026-10-19", hours: 3 },
        ],
        purpose: "Event coverage",
      }),
    ).toBe(true);
  });
});

describe("Supervisor OT team staff ids", () => {
  it("keeps reporting-only scope for non-venue titles", () => {
    expect(
      mergeSupervisorOtTeamStaffIds({
        reportingTeamIds: ["ashfaq", "crew-a", "crew-b"],
        viewerStaffId: "ashfaq",
        managedVenueStaffIds: ["phil", "other-site"],
        usesVenueLocationRoster: false,
      }),
    ).toEqual(["ashfaq", "crew-a", "crew-b"]);
  });

  it("prefers org-chart subtree over managed-venue dump for Venue / Site supervisors", () => {
    expect(
      mergeSupervisorOtTeamStaffIds({
        reportingTeamIds: ["ashfaq", "lead", "supervisor", "crew"],
        viewerStaffId: "ashfaq",
        managedVenueStaffIds: ["phil", "lead", "host", "other-venue"],
        usesVenueLocationRoster: true,
      }),
    ).toEqual(["ashfaq", "crew", "lead", "supervisor"]);
  });

  it("uses venue staff only when the org chart subtree is empty", () => {
    expect(
      mergeSupervisorOtTeamStaffIds({
        reportingTeamIds: [],
        viewerStaffId: "ashfaq",
        managedVenueStaffIds: ["phil"],
        usesVenueLocationRoster: true,
      }),
    ).toEqual(["phil"]);
  });

  it("treats viewer-only rollup as empty chart and falls back to venue", () => {
    expect(
      mergeSupervisorOtTeamStaffIds({
        reportingTeamIds: ["ashfaq"],
        viewerStaffId: "ashfaq",
        managedVenueStaffIds: ["phil", "host"],
        usesVenueLocationRoster: true,
      }),
    ).toEqual(["host", "phil"]);
  });
});
