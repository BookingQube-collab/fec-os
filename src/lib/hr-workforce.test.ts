import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  dueQualifications,
  extraRosterPlaces,
  filterLocations,
  filterStaffByQuery,
  isQualificationRecord,
  locationPlace,
  placeCounts,
  qatarDayBounds,
  rosterDays,
  shiftCoverage,
  shiftFormError,
  showCoverageSummary,
  splitMyShifts,
  windowEnd,
  workforceTab,
} from "./hr-workforce";

describe("workforce display rules", () => {
  it("keeps known tabs and aliases, and falls back to the team workspace", () => {
    expect(workforceTab(null)).toBe("workspace");
    expect(workforceTab("locations")).toBe("locations");
    expect(workforceTab("staffing")).toBe("staffing");
    expect(workforceTab("renewals")).toBe("renewals");
    expect(workforceTab("team")).toBe("workspace");
    expect(workforceTab("roster")).toBe("bulk");
    expect(workforceTab("gallery")).toBe("workspace");
  });

  it("builds a 14-day window in Qatar local bounds", () => {
    expect(windowEnd("2026-10-07")).toBe("2026-10-20");
    expect(addCalendarDays("2026-10-07", -14)).toBe("2026-09-23");
    expect(qatarDayBounds("2026-10-07", "2026-10-20")).toEqual({
      from: "2026-10-06T21:00:00.000Z",
      to: "2026-10-20T20:59:59.999Z",
    });
  });

  it("counts assigned and open shifts and hides an all-zero summary", () => {
    expect(
      shiftCoverage([
        { staffId: "a", status: "scheduled" },
        { staffId: null, status: "scheduled" },
        { staffId: null, status: "cancelled" },
      ]),
    ).toEqual({ accepted: 1, open: 1 });
    expect(showCoverageSummary({ accepted: 0, open: 0 })).toBe(false);
    expect(showCoverageSummary({ accepted: 2, open: 0 })).toBe(true);
  });

  it("counts places in the window and keeps pending offers out of accepted", () => {
    const now = Date.parse("2026-10-07T12:00:00+03:00");
    expect(
      placeCounts(
        [
          {
            staffId: "a",
            status: "scheduled",
            startsAt: "2026-10-08T05:00:00.000Z",
            endsAt: "2026-10-08T13:00:00.000Z",
            swapRequestedAt: null,
          },
          {
            staffId: null,
            status: "scheduled",
            startsAt: "2026-10-09T05:00:00.000Z",
            endsAt: "2026-10-09T13:00:00.000Z",
            swapRequestedAt: null,
          },
          {
            staffId: "b",
            status: "scheduled",
            startsAt: "2026-10-10T05:00:00.000Z",
            endsAt: "2026-10-10T13:00:00.000Z",
            swapRequestedAt: "2026-10-07T00:00:00.000Z",
          },
          {
            staffId: "c",
            status: "cancelled",
            startsAt: "2026-10-11T05:00:00.000Z",
            endsAt: "2026-10-11T13:00:00.000Z",
            swapRequestedAt: null,
          },
          {
            staffId: "d",
            status: "scheduled",
            startsAt: "2026-10-01T05:00:00.000Z",
            endsAt: "2026-10-01T13:00:00.000Z",
            swapRequestedAt: null,
          },
        ],
        now,
      ),
    ).toEqual({ upcomingLive: 3, accepted: 2, total: 4, unfilled: 1, awaiting: 1 });
    expect(
      extraRosterPlaces(
        [
          { staffId: "a", workDate: "2026-10-08", isWeekOff: false, leaveType: null },
          { staffId: "e", workDate: "2026-10-08", isWeekOff: false, leaveType: null },
          { staffId: "f", workDate: "2026-10-08", isWeekOff: true, leaveType: null },
        ],
        [{ staffId: "a", status: "scheduled", day: "2026-10-08", swapRequestedAt: null }],
      ),
    ).toBe(1);
  });

  it("describes a location without inventing an address", () => {
    expect(locationPlace("Doha", "Vendome")).toBe("Doha · Vendome");
    expect(locationPlace("  ", null)).toBeNull();
    expect(
      filterLocations(
        [
          { name: "Head Office", code: "HO", city: "Doha", region: "Office" },
          { name: "Inflata Park", code: "IP", city: "Doha", region: "FEC" },
        ],
        "inflata",
        "all",
      ),
    ).toEqual([{ name: "Inflata Park", code: "IP", city: "Doha", region: "FEC" }]);
    expect(
      filterLocations(
        [
          { name: "Head Office", code: "HO", city: "Doha", region: null },
          { name: "Inflata Park", code: "IP", city: "Doha", region: "FEC" },
        ],
        "",
        "uncategorized",
      ).map((site) => site.code),
    ).toEqual(["HO"]);
  });

  it("groups roster rows onto the days that have them", () => {
    expect(
      rosterDays([
        { workDate: "2026-10-08", id: "b" },
        { workDate: "2026-10-07", id: "a" },
      ]).map((day) => day.date),
    ).toEqual(["2026-10-07", "2026-10-08"]);
  });

  it("treats stored certificates as qualifications and lists only those due", () => {
    expect(isQualificationRecord({ docType: "qid", qualification: null })).toBe(false);
    expect(isQualificationRecord({ docType: "educational_certificate", qualification: null })).toBe(true);
    expect(isQualificationRecord({ docType: "other", qualification: "First aid" })).toBe(true);
    expect(
      dueQualifications(
        [
          { docType: "educational_certificate", qualification: null, expiryDate: "2026-10-01" },
          { docType: "medical_certificate", qualification: null, expiryDate: "2026-12-01" },
          { docType: "qid", qualification: null, expiryDate: "2026-10-01" },
          { docType: "educational_certificate", qualification: null, expiryDate: null },
        ],
        "2026-10-07",
      ).map((doc) => doc.expiryDate),
    ).toEqual(["2026-10-01"]);
  });

  it("waits for two characters before matching an employee", () => {
    const people = [{ fullName: "Adil Khan", employeeCode: "E3-1" }];
    expect(filterStaffByQuery(people, "a")).toEqual([]);
    expect(filterStaffByQuery(people, "adi")).toEqual(people);
  });

  it("splits my shifts from offers without counting cancelled rows", () => {
    const rows = splitMyShifts(
      [
        { userId: "me", status: "scheduled", swapRequestedAt: null, swapRequestedFor: null },
        { userId: "me", status: "scheduled", swapRequestedAt: "2026-10-01T00:00:00Z", swapRequestedFor: "other" },
        { userId: "other", status: "scheduled", swapRequestedAt: "2026-10-01T00:00:00Z", swapRequestedFor: "me" },
        { userId: "me", status: "cancelled", swapRequestedAt: null, swapRequestedFor: null },
      ],
      "me",
    );
    expect(rows.mine).toHaveLength(1);
    expect(rows.offers).toHaveLength(2);
  });

  it("rejects a shift whose end is not after the start", () => {
    expect(shiftFormError("", "2026-10-07T18:00")).toBe("required");
    expect(shiftFormError("2026-10-07T18:00", "2026-10-07T09:00")).toBe("order");
    expect(shiftFormError("2026-10-07T09:00", "2026-10-07T18:00")).toBeNull();
  });
});
