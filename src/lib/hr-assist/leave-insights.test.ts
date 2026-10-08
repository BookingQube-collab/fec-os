import { describe, expect, it } from "vitest";

import { buildLeaveInsights, describeLeaveItem, type LeaveInsightRequest } from "./leave-insights";

function request(partial: Partial<LeaveInsightRequest> & Pick<LeaveInsightRequest, "id" | "staffId" | "dateFrom" | "dateTo">): LeaveInsightRequest {
  return {
    staffName: partial.staffId ?? "",
    locationId: "loc-a",
    locationName: "City Center",
    leaveType: "annual",
    status: "approved",
    ...partial,
  };
}

describe("leave insights", () => {
  it("notes overlapping leave and a short roster without a percentage", () => {
    const result = buildLeaveInsights({
      requests: [
        request({ id: "a", staffId: "s1", staffName: "Noor Ali", dateFrom: "2026-10-03", dateTo: "2026-10-03" }),
        request({ id: "b", staffId: "s2", staffName: "Huda Nasser", dateFrom: "2026-10-03", dateTo: "2026-10-04", status: "pending" }),
      ],
      rosterDays: [{ locationId: "loc-a", locationName: "City Center", workDate: "2026-10-03", onDuty: 3 }],
    });
    const staffing = result.items.find((row) => row.id.startsWith("staffing:"));
    expect(staffing?.values).toMatchObject({ leaveCount: 2, onDuty: 3 });
    const why = describeLeaveItem(staffing!).why;
    expect(why).toContain("2 people");
    expect(why).toContain("3 on duty");
    expect(why).not.toMatch(/%/);
    expect(why.toLowerCase()).not.toContain("fraud");
  });

  it("keeps a date overlap when the requests have no site", () => {
    const result = buildLeaveInsights({
      requests: [
        request({ id: "a", staffId: "s1", staffName: "Noor Ali", locationId: null, locationName: null, dateFrom: "2026-10-03", dateTo: "2026-10-03" }),
        request({ id: "b", staffId: "s2", staffName: "Huda Nasser", locationId: null, locationName: null, dateFrom: "2026-10-03", dateTo: "2026-10-03" }),
      ],
      rosterDays: [],
    });
    const why = describeLeaveItem(result.items[0]).why;
    expect(why).toContain("date overlap only");
    expect(why).toContain("Noor Ali");
  });

  it("labels a repeated leave type for HR review and never as fraud", () => {
    const result = buildLeaveInsights({
      requests: [
        request({ id: "1", staffId: "s1", staffName: "Noor Ali", leaveType: "sick", status: "approved", dateFrom: "2026-09-02", dateTo: "2026-09-02" }),
        request({ id: "2", staffId: "s1", staffName: "Noor Ali", leaveType: "sick", status: "approved", dateFrom: "2026-09-18", dateTo: "2026-09-18" }),
        request({ id: "3", staffId: "s1", staffName: "Noor Ali", leaveType: "sick", status: "rejected", dateFrom: "2026-10-01", dateTo: "2026-10-01" }),
      ],
      rosterDays: [],
    });
    const item = result.items.find((row) => row.id.startsWith("pattern:"));
    const text = describeLeaveItem(item!);
    expect(text.title).toBe("Pattern requires HR review");
    expect(text.why.startsWith("Pattern requires HR review")).toBe(true);
    expect(text.why).toContain("3 Sick requests");
    expect(text.why.toLowerCase()).not.toContain("fraud");
    expect(text.action).toContain("does not change balances");
  });

  it("does not change the empty and missing-date results", () => {
    expect(buildLeaveInsights({ requests: [], rosterDays: [] }).status).toBe("empty");
    expect(
      buildLeaveInsights({
        requests: [request({ id: "x", staffId: "s1", dateFrom: "", dateTo: "" })],
        rosterDays: [],
      }).status,
    ).toBe("insufficient");
  });
});
