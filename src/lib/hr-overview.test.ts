import { describe, expect, it } from "vitest";

import {
  addDaysYmd,
  aggregateHrHeadcountBreakdowns,
  countExpiringDocType,
  countJoiningSoon,
  countLeavingSoon,
  countMissingCvStaff,
  countUnattestedEducationalDocs,
  emptyHrOverviewBreakdowns,
} from "./hr-overview";

describe("hr overview aggregators", () => {
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
        departmentName: "Ops",
        locationId: "l1",
        locationCode: "INF",
        locationName: "City Center",
      },
      {
        employmentCategory: "permanent",
        departmentId: "d1",
        departmentName: "Ops",
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
    expect(b.byDepartment.find((r) => r.key === "d1")?.count).toBe(2);
    expect(b.byLocation.find((r) => r.key === "l1")?.count).toBe(2);
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
