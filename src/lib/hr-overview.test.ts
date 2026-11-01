import { describe, expect, it } from "vitest";

import {
  addDaysYmd,
  aggregateHrHeadcountBreakdowns,
  countExpiringDocType,
  countJoiningSoon,
  countLeavingSoon,
  countMissingCvStaff,
  countPresentStaffInRoster,
  countUnattestedEducationalDocs,
  dailySummaryCountsAsPresent,
  emptyHrOverviewBreakdowns,
} from "./hr-overview";

describe("hr overview aggregators", () => {
  it("counts distinct present staff only when they sit in the Active roster", () => {
    const roster = new Set(["a", "b", "c"]);
    expect(countPresentStaffInRoster(["a", "a", "x", null, "b"], roster)).toBe(2);
    expect(countPresentStaffInRoster([null, "", "orphan"], roster)).toBe(0);
    expect(countPresentStaffInRoster(["a"], new Set())).toBe(0);
  });

  it("returns empty breakdowns without throwing on empty input", () => {
    expect(aggregateHrHeadcountBreakdowns([])).toEqual(emptyHrOverviewBreakdowns());
    expect(aggregateHrHeadcountBreakdowns(undefined as unknown as [])).toEqual(
      emptyHrOverviewBreakdowns(),
    );
    expect(countMissingCvStaff([], [])).toBe(0);
    expect(countUnattestedEducationalDocs([])).toBe(0);
    expect(countJoiningSoon([], "2026-09-20")).toBe(0);
    expect(countLeavingSoon([], "2026-09-20")).toBe(0);
  });

  it("aggregates by category, department, and location", () => {
    const b = aggregateHrHeadcountBreakdowns([
      {
        employmentCategory: "permanent",
        departmentId: "d1",
        departmentName: "Maintenance",
        locationId: "l1",
        locationCode: "INF",
        locationName: "City Center",
      },
      {
        employmentCategory: "permanent",
        departmentId: "d1",
        departmentName: "Maintenance",
        locationId: "l2",
        locationCode: "UA",
        locationName: "Doha Mall",
      },
      {
        employmentCategory: "joker",
        departmentId: null,
        locationId: "l1",
        locationCode: "INF",
        locationName: "City Center",
      },
    ]);
    expect(b.byCategory.find((r) => r.key === "permanent")?.count).toBe(2);
    expect(b.byDepartment.find((r) => r.key === "maintenance")?.count).toBe(2);
    expect(b.byLocation.find((r) => r.key === "l1")?.count).toBe(2);
  });

  it("merges FEC Operations aliases into one Operations department bucket", () => {
    const b = aggregateHrHeadcountBreakdowns([
      { departmentId: "fec-ops", departmentName: "fec operation" },
      { departmentId: "ops", departmentName: "Operations" },
      { departmentId: "fec-ops-2", departmentName: "FEC Operations" },
      { departmentId: "maint", departmentName: "Maintenance" },
    ]);
    expect(b.byDepartment.find((r) => r.key === "operations")).toMatchObject({
      label: "Operations",
      count: 3,
    });
    expect(b.byDepartment.find((r) => r.key === "maintenance")?.count).toBe(1);
    expect(b.byDepartment.filter((r) => /fec/i.test(r.label))).toHaveLength(0);
  });

  it("treats punch/actual_in days as present like Team Today", () => {
    expect(dailySummaryCountsAsPresent({ punchCount: 2, status: "missed_punch" })).toBe(true);
    expect(dailySummaryCountsAsPresent({ punchCount: 0, actualIn: "2026-11-01T05:00:00Z" })).toBe(true);
    expect(dailySummaryCountsAsPresent({ punchCount: 0, status: "present" })).toBe(true);
    expect(dailySummaryCountsAsPresent({ punchCount: 0, status: "absent" })).toBe(false);
  });

  it("counts missing CVs and unattested educational docs", () => {
    expect(
      countMissingCvStaff(
        ["a", "b", "c"],
        [
          { staffId: "a", docType: "cv" },
          { staffId: "b", docType: "qid" },
        ],
      ),
    ).toBe(2);
    expect(
      countUnattestedEducationalDocs([
        { docType: "educational_certificate", mofaStatus: "no" },
        { docType: "educational_certificate", mofaStatus: "yes" },
        { docType: "educational_certificate", mofaStatus: "not_required" },
        { docType: "cv", mofaStatus: "no" },
      ]),
    ).toBe(1);
  });

  it("counts expiring QIDs/passports and joining/leaving soon", () => {
    expect(
      countExpiringDocType(
        [
          { docType: "qid", expiryDate: "2026-10-01" },
          { docType: "passport", expiryDate: "2026-10-01" },
          { docType: "qid", expiryDate: "2027-01-01" },
        ],
        "qid",
        "2026-09-20",
        "2026-10-20",
      ),
    ).toBe(1);
    expect(addDaysYmd("2026-09-20", 30)).toBe("2026-10-20");
    expect(
      countJoiningSoon(
        [
          { hireDate: "2026-09-25", status: "active" },
          { hireDate: "2026-08-01", status: "active" },
          { hireDate: "2026-09-22", status: "terminated" },
        ],
        "2026-09-20",
        30,
      ),
    ).toBe(1);
    expect(
      countLeavingSoon([{ lastWorkingDate: "2026-09-28" }, { lastWorkingDate: "2026-11-01" }], "2026-09-20", 30),
    ).toBe(1);
  });
});
