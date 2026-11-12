import { describe, expect, it } from "vitest";

import {
  completedYearsOfService,
  detectAnnualLeaveSandwich,
  isManagementStaff,
  isWeeklyOffDate,
  resolveAnnualLeaveTier,
  sickAnnualFollowOnApprovalSteps,
  splitSickToAnnual,
  standingWeeklyOffWeekdays,
} from "@/lib/hr-leave-policy";

describe("annual leave tier resolver", () => {
  it("gives 21 days under 5 years from DOJ", () => {
    const tier = resolveAnnualLeaveTier({
      hireDate: "2023-01-15",
      asOfDate: "2026-11-12",
      jobTitle: "Cashier",
    });
    expect(tier.code).toBe("under_5y");
    expect(tier.annualDays).toBe(21);
    expect(tier.monthlyAccrual).toBe(1.75);
    expect(tier.yearsOfService).toBe(3);
  });

  it("gives 28 days at 5+ years from DOJ", () => {
    const tier = resolveAnnualLeaveTier({
      hireDate: "2020-06-01",
      asOfDate: "2026-11-12",
      jobTitle: "Supervisor",
    });
    expect(tier.code).toBe("5y_plus");
    expect(tier.annualDays).toBe(28);
    expect(tier.monthlyAccrual).toBeCloseTo(2.33, 2);
    expect(tier.yearsOfService).toBe(6);
  });

  it("flips to 28 on the 5-year anniversary day", () => {
    const before = resolveAnnualLeaveTier({
      hireDate: "2021-11-12",
      asOfDate: "2026-11-11",
    });
    expect(before.code).toBe("under_5y");
    const onDay = resolveAnnualLeaveTier({
      hireDate: "2021-11-12",
      asOfDate: "2026-11-12",
    });
    expect(onDay.code).toBe("5y_plus");
    expect(onDay.annualDays).toBe(28);
  });

  it("gives 30 days for management staff regardless of tenure", () => {
    const tier = resolveAnnualLeaveTier({
      hireDate: "2024-01-01",
      asOfDate: "2026-11-12",
      jobTitle: "Operations Manager",
    });
    expect(tier.code).toBe("management");
    expect(tier.annualDays).toBe(30);
    expect(tier.monthlyAccrual).toBe(2.5);
  });

  it("treats higher_mgmt category and is_management flag as management", () => {
    expect(
      resolveAnnualLeaveTier({
        hireDate: "2024-01-01",
        asOfDate: "2026-06-01",
        employmentCategory: "higher_mgmt",
      }).code,
    ).toBe("management");
    expect(
      resolveAnnualLeaveTier({
        hireDate: "2024-01-01",
        asOfDate: "2026-06-01",
        isManagement: true,
        jobTitle: "Specialist",
      }).code,
    ).toBe("management");
  });

  it("completedYearsOfService handles missing hire", () => {
    expect(completedYearsOfService(null, "2026-01-01")).toBeNull();
    expect(completedYearsOfService("2026-06-01", "2026-01-01")).toBeNull();
  });
});

describe("isManagementStaff heuristics", () => {
  it("matches Manager / Director / GM / HoO / Head titles", () => {
    expect(isManagementStaff({ jobTitle: "Site Manager" })).toBe(true);
    expect(isManagementStaff({ jobTitle: "Finance Director" })).toBe(true);
    expect(isManagementStaff({ jobTitle: "General Manager" })).toBe(true);
    expect(isManagementStaff({ jobTitle: "GM" })).toBe(true);
    expect(isManagementStaff({ jobTitle: "Head of Operations" })).toBe(true);
    expect(isManagementStaff({ jobTitle: "HoO" })).toBe(true);
  });

  it("does not match cashier / supervisor / program accidentally", () => {
    expect(isManagementStaff({ jobTitle: "Cashier" })).toBe(false);
    expect(isManagementStaff({ jobTitle: "Venue Supervisor" })).toBe(false);
    expect(isManagementStaff({ jobTitle: "Program Coordinator" })).toBe(false);
  });

  it("matches management department", () => {
    expect(isManagementStaff({ department: "Management", jobTitle: "Analyst" })).toBe(true);
  });
});

describe("sandwich weekly OFF detection", () => {
  const friSatStanding = { weeklyOffWeekday: 5 as const };

  it("allows prefix OFF only (Fri–Sat before Sun–Tue AL)", () => {
    // Fri 6 + Sat 7 OFF, Sun–Tue AL, Wed return
    const result = detectAnnualLeaveSandwich({
      dateFrom: "2026-11-08", // Sun
      dateTo: "2026-11-10", // Tue
      lookup: friSatStanding,
    });
    expect(result.hasPrefix).toBe(true);
    expect(result.hasSuffix).toBe(false);
    expect(result.isSandwich).toBe(false);
    expect(result.prefixOffDates).toEqual(["2026-11-06", "2026-11-07"]);
  });

  it("allows suffix OFF only (AL then Fri–Sat)", () => {
    const result = detectAnnualLeaveSandwich({
      dateFrom: "2026-11-02", // Mon
      dateTo: "2026-11-05", // Thu
      lookup: friSatStanding,
    });
    expect(result.hasPrefix).toBe(false);
    expect(result.hasSuffix).toBe(true);
    expect(result.isSandwich).toBe(false);
    expect(result.suffixOffDates).toEqual(["2026-11-06", "2026-11-07"]);
  });

  it("blocks sandwich OFF+AL+OFF", () => {
    // Fri–Sat prefix, Sun–Thu AL, Fri–Sat suffix
    const result = detectAnnualLeaveSandwich({
      dateFrom: "2026-11-08", // Sun
      dateTo: "2026-11-12", // Thu
      lookup: friSatStanding,
    });
    expect(result.hasPrefix).toBe(true);
    expect(result.hasSuffix).toBe(true);
    expect(result.isSandwich).toBe(true);
    expect(result.chargeableOffDates).toEqual([
      "2026-11-06",
      "2026-11-07",
      "2026-11-13",
      "2026-11-14",
    ]);
  });

  it("uses roster OFF over standing weekday when published", () => {
    const lookup = {
      weeklyOffWeekday: 5,
      rosterPublishedDates: new Set(["2026-11-06", "2026-11-07"]),
      rosterOffDates: new Set<string>(), // published but on duty
    };
    expect(isWeeklyOffDate("2026-11-06", lookup)).toBe(false);
    expect(isWeeklyOffDate("2026-11-13", { weeklyOffWeekday: 5 })).toBe(true);
  });

  it("Fri standing implies Sat OFF", () => {
    expect(standingWeeklyOffWeekdays(5)).toEqual([5, 6]);
    expect(standingWeeklyOffWeekdays(0)).toEqual([0]);
  });
});

describe("sick → annual split", () => {
  it("keeps all days as sick when within remaining quota", () => {
    const split = splitSickToAnnual({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-05",
      remainingSickDays: 10,
    });
    expect(split.sickDays).toBe(5);
    expect(split.annualDays).toBe(0);
    expect(split.requiresAnnualFollowOn).toBe(false);
    expect(split.useHrThenGmPath).toBe(false);
    expect(split.requiresMedicalDocs).toBe(true);
  });

  it("splits when request exceeds remaining sick", () => {
    const split = splitSickToAnnual({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-10",
      remainingSickDays: 3,
    });
    expect(split.sickDays).toBe(3);
    expect(split.annualDays).toBe(7);
    expect(split.sickDateFrom).toBe("2026-11-01");
    expect(split.sickDateTo).toBe("2026-11-03");
    expect(split.annualDateFrom).toBe("2026-11-04");
    expect(split.annualDateTo).toBe("2026-11-10");
    expect(split.requiresAnnualFollowOn).toBe(true);
    expect(split.useHrThenGmPath).toBe(true);
    expect(split.requiresMedicalDocs).toBe(true);
  });

  it("routes fully to annual when sick quota is exhausted", () => {
    const split = splitSickToAnnual({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-03",
      remainingSickDays: 0,
    });
    expect(split.sickDays).toBe(0);
    expect(split.annualDays).toBe(3);
    expect(split.annualDateFrom).toBe("2026-11-01");
    expect(split.useHrThenGmPath).toBe(true);
  });

  it("defines HR → GM approval seats for follow-on", () => {
    expect(sickAnnualFollowOnApprovalSteps()).toEqual([
      { stepOrder: 1, stepRole: "hr", status: "pending" },
      { stepOrder: 2, stepRole: "gm", status: "pending" },
    ]);
  });
});
