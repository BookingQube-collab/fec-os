import { describe, expect, it } from "vitest";

import {
  addCalendarMonths,
  airTicketPolicyFromSection,
  assertCanMarkAirTicketPaid,
  computeEntitlementDatesFromPolicy,
  eligibilityOnForCycle,
  isAirTicketOverdue,
  isAirTicketUpcoming,
  resolveCycleIndexForDate,
} from "./hr-air-ticket";
import { HR_POLICY_DEFAULTS, mergePolicySection } from "./hr-policy";

describe("air-ticket eligibility from hire_date + policy (AT#8)", () => {
  const basePolicy = airTicketPolicyFromSection(HR_POLICY_DEFAULTS.air_ticket);

  it("uses hire anniversary every cycle_months", () => {
    const r = computeEntitlementDatesFromPolicy({
      hireDate: "2024-03-15",
      asOfDate: "2025-03-15",
      policy: basePolicy,
      cycleIndex: 1,
    });
    expect(r).not.toBeNull();
    expect(r!.eligibilityOn).toBe("2025-03-15");
    expect(r!.cycleStart).toBe("2024-03-15");
    expect(r!.status).toBe("eligible");
  });

  it("stays open before eligibility date", () => {
    const r = computeEntitlementDatesFromPolicy({
      hireDate: "2024-03-15",
      asOfDate: "2025-01-01",
      policy: basePolicy,
      cycleIndex: 1,
    });
    expect(r!.eligibilityOn).toBe("2025-03-15");
    expect(r!.status).toBe("open");
  });

  it("changes eligibility when policy cycle_months changes (no code change)", () => {
    const yearly = computeEntitlementDatesFromPolicy({
      hireDate: "2024-06-01",
      asOfDate: "2025-06-01",
      policy: basePolicy,
      cycleIndex: 1,
    });
    expect(yearly!.eligibilityOn).toBe("2025-06-01");

    const merged = mergePolicySection("air_ticket", [{ key: "cycle_months", value: 24 }]);
    const biennial = computeEntitlementDatesFromPolicy({
      hireDate: "2024-06-01",
      asOfDate: "2025-06-01",
      policy: airTicketPolicyFromSection(merged),
      cycleIndex: 1,
    });
    expect(biennial!.eligibilityOn).toBe("2026-06-01");
    expect(biennial!.status).toBe("open");
  });

  it("applies carry-forward expiry from policy months", () => {
    const r = computeEntitlementDatesFromPolicy({
      hireDate: "2023-01-10",
      asOfDate: "2024-01-10",
      policy: { ...basePolicy, carryForwardEnabled: true, carryForwardMonths: 3 },
      cycleIndex: 1,
    });
    expect(r!.expiryOn).toBe("2024-04-10");
  });

  it("resolves current cycle index from asOf", () => {
    expect(resolveCycleIndexForDate("2023-01-01", 12, "2023-06-01")).toBe(1);
    expect(resolveCycleIndexForDate("2023-01-01", 12, "2024-01-01")).toBe(1);
    expect(resolveCycleIndexForDate("2023-01-01", 12, "2025-01-01")).toBe(2);
    expect(eligibilityOnForCycle("2023-01-01", 12, 2)).toBe("2025-01-01");
  });

  it("rejects missing hire_date", () => {
    expect(
      computeEntitlementDatesFromPolicy({
        hireDate: null,
        asOfDate: "2026-01-01",
        policy: basePolicy,
      }),
    ).toBeNull();
  });

  it("clamps month-end hire dates when adding months", () => {
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2024-01-31", 12)).toBe("2025-01-31");
  });
});

describe("air-ticket overdue detection (AT#8)", () => {
  it("flags eligible entitlement past eligibility_on", () => {
    expect(
      isAirTicketOverdue({
        eligibilityOn: "2026-01-01",
        asOfDate: "2026-03-01",
        status: "eligible",
      }),
    ).toBe(true);
  });

  it("does not flag future eligibility", () => {
    expect(
      isAirTicketOverdue({
        eligibilityOn: "2026-06-01",
        asOfDate: "2026-03-01",
        status: "open",
      }),
    ).toBe(false);
  });

  it("does not flag issued or expired rows", () => {
    expect(
      isAirTicketOverdue({
        eligibilityOn: "2025-01-01",
        asOfDate: "2026-03-01",
        status: "issued",
      }),
    ).toBe(false);
    expect(
      isAirTicketOverdue({
        eligibilityOn: "2025-01-01",
        asOfDate: "2026-03-01",
        status: "expired",
      }),
    ).toBe(false);
  });

  it("stops overdue after expiry_on", () => {
    expect(
      isAirTicketOverdue({
        eligibilityOn: "2025-01-01",
        asOfDate: "2025-06-01",
        status: "eligible",
        expiryOn: "2025-04-01",
      }),
    ).toBe(false);
  });

  it("detects upcoming within horizon", () => {
    expect(
      isAirTicketUpcoming({
        eligibilityOn: "2026-04-15",
        asOfDate: "2026-03-01",
        horizonDays: 60,
        status: "open",
      }),
    ).toBe(true);
    expect(
      isAirTicketUpcoming({
        eligibilityOn: "2026-08-01",
        asOfDate: "2026-03-01",
        horizonDays: 60,
        status: "open",
      }),
    ).toBe(false);
  });

  it("requires issued/approved before paid", () => {
    expect(() => assertCanMarkAirTicketPaid("draft")).toThrow(/must be issued/);
    expect(() => assertCanMarkAirTicketPaid("paid")).toThrow(/already paid/);
    expect(() => assertCanMarkAirTicketPaid("issued")).not.toThrow();
  });
});

describe("air-ticket policy defaults", () => {
  it("seeds cycle, family, and carry-forward keys", () => {
    expect(HR_POLICY_DEFAULTS.air_ticket.cycle_months).toBe(12);
    expect(HR_POLICY_DEFAULTS.air_ticket.from_hire_date).toBe(true);
    expect(HR_POLICY_DEFAULTS.air_ticket.family_eligible_default).toBe(false);
    expect(HR_POLICY_DEFAULTS.air_ticket.carry_forward_enabled).toBe(true);
    expect(HR_POLICY_DEFAULTS.air_ticket.carry_forward_months).toBe(3);
    expect(HR_POLICY_DEFAULTS.air_ticket.upcoming_horizon_days).toBe(60);
  });
});
