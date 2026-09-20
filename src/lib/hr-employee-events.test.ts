import { describe, expect, it } from "vitest";

import { filterEmployeeTimeline } from "./hr-employee-events";

describe("employee timeline (AT#7 partial)", () => {
  it("surfaces status_change events in a chronological filterable feed", () => {
    const feed = [
      { id: "1", eventType: "joining", effectiveOn: "2024-01-01" },
      { id: "2", eventType: "status_change", effectiveOn: "2026-09-01" },
      { id: "3", eventType: "leave_approved", effectiveOn: "2026-08-15" },
      { id: "4", eventType: "salary_change", effectiveOn: "2026-06-01" },
    ];
    const statusOnly = filterEmployeeTimeline(feed, "status_change");
    expect(statusOnly).toHaveLength(1);
    expect(statusOnly[0]?.eventType).toBe("status_change");
    expect(statusOnly[0]?.effectiveOn).toBe("2026-09-01");
    expect(filterEmployeeTimeline(feed).map((e) => e.eventType)).toContain("status_change");
  });
});
