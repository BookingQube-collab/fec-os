import { describe, expect, it } from "vitest";

import {
  canViewMonthlyRosterHistory,
  classifyRosterHistoryChangeKinds,
  summarizeRosterAuditChange,
} from "@/lib/attendance-hr/roster-audit";

describe("canViewMonthlyRosterHistory", () => {
  it("allows HR role and Head of Operations title only", () => {
    expect(canViewMonthlyRosterHistory(["hr"])).toBe(true);
    expect(canViewMonthlyRosterHistory(["cashier_host"], "Head of Operations")).toBe(true);
    expect(canViewMonthlyRosterHistory(["duty_manager"], "Venue Supervisor")).toBe(false);
    expect(canViewMonthlyRosterHistory(["regional_ops"], "Operations Manager")).toBe(false);
    expect(canViewMonthlyRosterHistory(["ceo"])).toBe(false);
  });
});

describe("summarizeRosterAuditChange", () => {
  it("describes upload and row update", () => {
    expect(
      summarizeRosterAuditChange("roster.upload", null, { imported: 42, fileName: "march.xlsx" }),
    ).toContain("42");
    expect(
      summarizeRosterAuditChange(
        "roster.update",
        {
          workDate: "2026-03-10",
          isWeekOff: false,
          shiftStart: "09:00",
          shiftEnd: "18:00",
          dayStatus: "on_duty",
        },
        {
          workDate: "2026-03-10",
          isWeekOff: true,
          dayStatus: "weekly_off",
        },
      ),
    ).toContain("on duty → weekly off");
  });
});

describe("classifyRosterHistoryChangeKinds", () => {
  it("marks earliest upload per location-month as first plan", () => {
    const rows = [
      {
        id: "a",
        action: "roster.upload",
        locationId: "loc-1",
        payrollMonth: "2026-03",
        createdAt: "2026-02-28T10:00:00Z",
      },
      {
        id: "b",
        action: "roster.update",
        locationId: "loc-1",
        payrollMonth: "2026-03",
        createdAt: "2026-03-01T10:00:00Z",
      },
      {
        id: "c",
        action: "roster.upload",
        locationId: "loc-1",
        payrollMonth: "2026-03",
        createdAt: "2026-03-05T10:00:00Z",
      },
    ];
    const kinds = classifyRosterHistoryChangeKinds(rows);
    expect(kinds.get("a")).toBe("first_plan");
    expect(kinds.get("b")).toBe("amendment");
    expect(kinds.get("c")).toBe("reupload");
  });
});
