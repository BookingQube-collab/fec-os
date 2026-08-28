import { describe, expect, it } from "vitest";

import { assertLeaveTransition, canTransitionLeave, countLeaveDays } from "./hr-leave";

describe("leave status transitions", () => {
  it("lets an employee cancel a pending request only", () => {
    expect(canTransitionLeave("pending", "cancelled", "employee")).toBe(true);
    expect(canTransitionLeave("pending", "approved", "employee")).toBe(false);
    expect(canTransitionLeave("approved", "cancelled", "employee")).toBe(false);
  });

  it("lets HR approve or reject pending leave, not cancelled rows", () => {
    expect(canTransitionLeave("pending", "approved", "hr")).toBe(true);
    expect(canTransitionLeave("pending", "rejected", "hr")).toBe(true);
    expect(canTransitionLeave("cancelled", "approved", "hr")).toBe(false);
    expect(canTransitionLeave("approved", "rejected", "hr")).toBe(false);
  });

  it("throws on an illegal transition", () => {
    expect(() => assertLeaveTransition("rejected", "approved", "hr")).toThrow(/cannot move/);
  });

  it("counts inclusive calendar days", () => {
    expect(countLeaveDays("2026-08-28", "2026-08-28")).toBe(1);
    expect(countLeaveDays("2026-08-28", "2026-08-30")).toBe(3);
    expect(countLeaveDays("2026-08-30", "2026-08-28")).toBe(0);
  });
});
