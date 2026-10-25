import { describe, expect, it } from "vitest";

import {
  canReviewStaffSuggestions,
  filterSuggestionInbox,
  suggestionCategoryBreakdown,
  suggestionVolumeSeries,
  summarizeSuggestionStatuses,
  type SuggestionInboxItem,
} from "@/lib/hr-suggestions";

function row(partial: Partial<SuggestionInboxItem> & Pick<SuggestionInboxItem, "id" | "title">): SuggestionInboxItem {
  return {
    staffId: "s1",
    userId: "u1",
    body: "body",
    category: "operations",
    status: "new",
    adminNote: null,
    seenAt: null,
    closedAt: null,
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
    staffName: "Mary Wangare",
    employeeCode: "INF-CC-VS",
    jobTitle: "Sr. Site Supervisor",
    locationId: "loc-1",
    locationCode: "INF-CC",
    locationName: "Inflatapark",
    ...partial,
  };
}

describe("canReviewStaffSuggestions", () => {
  it("allows Admin seats with admin.view", () => {
    expect(canReviewStaffSuggestions(["ceo"])).toBe(true);
    expect(canReviewStaffSuggestions(["coo"])).toBe(true);
    expect(canReviewStaffSuggestions(["regional_ops"])).toBe(true);
  });

  it("allows Head of Operations by job title", () => {
    expect(canReviewStaffSuggestions(["technician"], { jobTitle: "Head of Operations" })).toBe(true);
    expect(canReviewStaffSuggestions(["cashier_host"], { jobTitle: "Head of Operations / FEC-IT" })).toBe(true);
  });

  it("denies managers, HR, and floor staff without Admin or HoO", () => {
    expect(canReviewStaffSuggestions(["hr"])).toBe(false);
    expect(canReviewStaffSuggestions(["branch_gm"])).toBe(false);
    expect(canReviewStaffSuggestions(["duty_manager"])).toBe(false);
    expect(canReviewStaffSuggestions(["tech_supervisor"])).toBe(false);
    expect(canReviewStaffSuggestions(["cashier_host"])).toBe(false);
    expect(canReviewStaffSuggestions(["cfo"])).toBe(false);
  });
});

describe("filterSuggestionInbox", () => {
  const rows = [
    row({
      id: "1",
      title: "Customer Development training",
      status: "new",
      category: "operations",
      createdAt: "2026-10-25T08:00:00.000Z",
      locationId: "loc-1",
    }),
    row({
      id: "2",
      title: "Safety cones",
      body: "Need more cones",
      status: "seen",
      category: "safety",
      staffName: "Ali Hassan",
      createdAt: "2026-10-10T08:00:00.000Z",
      locationId: "loc-2",
    }),
    row({
      id: "3",
      title: "Payroll timing",
      status: "closed",
      category: "hr",
      staffName: "Sara Khan",
      createdAt: "2026-09-01T08:00:00.000Z",
      locationId: "loc-1",
    }),
  ];

  it("filters by status, category, site, date, and text", () => {
    expect(filterSuggestionInbox(rows, { status: "new" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterSuggestionInbox(rows, { category: "safety" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterSuggestionInbox(rows, { locationId: "loc-1" }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterSuggestionInbox(rows, { dateFrom: "2026-10-01", dateTo: "2026-10-31" }).map((r) => r.id)).toEqual([
      "1",
      "2",
    ]);
    expect(filterSuggestionInbox(rows, { search: "mary" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterSuggestionInbox(rows, { search: "cones" }).map((r) => r.id)).toEqual(["2"]);
  });
});

describe("summarizeSuggestionStatuses + charts helpers", () => {
  const rows = [
    row({ id: "1", title: "A", status: "new", createdAt: "2026-10-24T12:00:00.000Z" }),
    row({ id: "2", title: "B", status: "seen", category: "hr", createdAt: "2026-10-25T12:00:00.000Z" }),
    row({ id: "3", title: "C", status: "closed", category: null, createdAt: "2026-10-25T15:00:00.000Z" }),
  ];

  it("counts statuses", () => {
    expect(summarizeSuggestionStatuses(rows)).toEqual({ total: 3, new: 1, seen: 1, closed: 1 });
  });

  it("builds category breakdown including uncategorized", () => {
    const breakdown = suggestionCategoryBreakdown(rows, (key) => key);
    expect(breakdown.find((b) => b.key === "operations")?.count).toBe(1);
    expect(breakdown.find((b) => b.key === "hr")?.count).toBe(1);
    expect(breakdown.find((b) => b.key === "uncategorized")?.count).toBe(1);
  });

  it("builds a 30-day volume series ending on endYmd", () => {
    const series = suggestionVolumeSeries(rows, "2026-10-25", 3);
    expect(series).toEqual([
      { date: "2026-10-23", count: 0 },
      { date: "2026-10-24", count: 1 },
      { date: "2026-10-25", count: 2 },
    ]);
  });
});
