import { describe, expect, it } from "vitest";

import {
  assertCanPublishVacancy,
  assertQuotaOverrideAllowed,
  buildQuotaEmployeeRows,
  computeQuotaMetrics,
  defaultJobApprovalSteps,
  evaluateJobRequestAgainstQuota,
  maskJobRequestSalary,
  quotaMatchesRequest,
  requiresFinanceForBudget,
} from "./hr-recruitment";

describe("AT#15 job request checked against dept/location quota", () => {
  const quotas = [
    {
      id: "q-loc",
      locationId: "loc-1",
      departmentId: null,
      designation: null,
      employmentCategory: null,
      approvedHeadcount: 10,
    },
    {
      id: "q-dept",
      locationId: "loc-1",
      departmentId: "dept-ops",
      designation: null,
      employmentCategory: null,
      approvedHeadcount: 5,
    },
  ];

  it("uses most specific matching quota (dept+location over location-only)", () => {
    const result = evaluateJobRequestAgainstQuota({
      request: {
        locationId: "loc-1",
        departmentId: "dept-ops",
        designation: "Host",
        employmentCategory: "operations",
        vacanciesCount: 2,
      },
      quotas,
      occupiedCount: 4,
      openVacanciesCount: 0,
    });
    expect(result.matchedQuotaId).toBe("q-dept");
    expect(result.approvedHeadcount).toBe(5);
    expect(result.exceeds).toBe(true);
    expect(result.warning).toMatch(/exceeds quota/i);
  });

  it("allows request within available seats", () => {
    const result = evaluateJobRequestAgainstQuota({
      request: {
        locationId: "loc-1",
        departmentId: "dept-ops",
        vacanciesCount: 1,
      },
      quotas,
      occupiedCount: 3,
    });
    expect(result.exceeds).toBe(false);
    expect(result.availableBeforeRequest).toBe(2);
  });

  it("quotaMatchesRequest ignores null quota dimensions", () => {
    expect(
      quotaMatchesRequest(
        { locationId: "loc-1", departmentId: null },
        { locationId: "loc-1", departmentId: "dept-x" },
      ),
    ).toBe(true);
    expect(
      quotaMatchesRequest(
        { locationId: "loc-1", departmentId: "dept-a" },
        { locationId: "loc-1", departmentId: "dept-b" },
      ),
    ).toBe(false);
  });

  it("computeQuotaMetrics reports shortage and available positions", () => {
    const m = computeQuotaMetrics({
      approvedHeadcount: 10,
      activeCount: 6,
      onLeaveCount: 1,
      servingNoticeCount: 1,
      openVacanciesCount: 1,
      selectedNotJoinedCount: 0,
    });
    expect(m.occupiedCount).toBe(8);
    expect(m.availablePositions).toBe(1);
    expect(m.excessShortage).toBe(-2);
    expect(m.selectedNotJoinedCount).toBe(0);
  });
});

describe("AT#16 override requires higher approval", () => {
  it("submit with exceed is allowed (warn path)", () => {
    expect(
      assertQuotaOverrideAllowed({
        exceedsQuota: true,
        overrideStatus: "none",
        actorHasOverrideCapability: false,
        action: "submit",
      }),
    ).toEqual({ requiresOverride: true, canProceed: true });
  });

  it("approve_step without override throws", () => {
    expect(() =>
      assertQuotaOverrideAllowed({
        exceedsQuota: true,
        overrideStatus: "pending",
        actorHasOverrideCapability: false,
        action: "approve_step",
      }),
    ).toThrow(/override required/i);
  });

  it("grant_override without capability throws", () => {
    expect(() =>
      assertQuotaOverrideAllowed({
        exceedsQuota: true,
        overrideStatus: "pending",
        actorHasOverrideCapability: false,
        action: "grant_override",
      }),
    ).toThrow(/quota\.override_approve/i);
  });

  it("approved override unblocks publish", () => {
    expect(() =>
      assertCanPublishVacancy({
        jobRequestStatus: "approved",
        exceedsQuota: true,
        overrideStatus: "approved",
      }),
    ).not.toThrow();
  });

  it("cannot publish before approvals complete", () => {
    expect(() =>
      assertCanPublishVacancy({
        jobRequestStatus: "pending",
        exceedsQuota: false,
        overrideStatus: "none",
      }),
    ).toThrow(/before job request approvals complete/i);
  });

  it("finance step included when salary budget set", () => {
    expect(requiresFinanceForBudget(12000)).toBe(true);
    const steps = defaultJobApprovalSteps({ requiresFinance: true }).map((s) => s.stepRole);
    expect(steps).toEqual(["dept_ops", "hr", "finance", "gm"]);
  });
});

describe("AT#17 quota views expose names, CV status, QID status", () => {
  it("builds employee rows with CV and QID availability/expiry", () => {
    const rows = buildQuotaEmployeeRows([
      {
        staffId: "s1",
        fullName: "Ada Lovelace",
        employmentCategory: "operations",
        staffQid: "12345678901",
        asOfDate: "2026-09-20",
        documents: [
          { docType: "cv", filePath: "docs/ada-cv.pdf", expiryDate: null },
          { docType: "qid", filePath: "docs/ada-qid.pdf", expiryDate: "2027-01-01" },
        ],
      },
      {
        staffId: "s2",
        fullName: "No Docs",
        employmentCategory: "permanent",
        staffQid: null,
        asOfDate: "2026-09-20",
        documents: [{ docType: "qid", filePath: null, expiryDate: "2025-01-01" }],
      },
    ]);
    expect(rows[0]).toMatchObject({
      fullName: "Ada Lovelace",
      employmentCategory: "operations",
      cvAvailable: true,
      qidAvailable: true,
      qidExpiry: "2027-01-01",
      qidExpired: false,
    });
    expect(rows[1]).toMatchObject({
      fullName: "No Docs",
      cvAvailable: false,
      qidAvailable: true,
      qidExpiry: "2025-01-01",
      qidExpired: true,
    });
  });

  it("masks salary budget for unauthorized viewers", () => {
    expect(maskJobRequestSalary({ salaryBudgetQar: 9000 }, false).salaryBudgetQar).toBeNull();
    expect(maskJobRequestSalary({ salaryBudgetQar: 9000 }, true).salaryBudgetQar).toBe(9000);
  });
});
