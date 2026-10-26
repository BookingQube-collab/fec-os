import { describe, expect, it } from "vitest";

import { decideSelfCheck, selfCheckButtons, staffUsesPunchDrivenAttendance } from "./self-check-in";

describe("punch-driven attendance (portal check-in / no roster)", () => {
  it("follows the admin can_self_check_in flag, not names or department", () => {
    expect(staffUsesPunchDrivenAttendance({ canSelfCheckIn: true })).toBe(true);
    expect(staffUsesPunchDrivenAttendance({ canSelfCheckIn: false })).toBe(false);
    expect(staffUsesPunchDrivenAttendance({ canSelfCheckIn: null })).toBe(false);
    expect(staffUsesPunchDrivenAttendance({})).toBe(false);
  });
});

describe("self check-in allow/deny", () => {
  it("hides the action when the login is not linked to staff", () => {
    expect(decideSelfCheck({ linked: false, enabled: true, kind: "in", punchesToday: 0 })).toEqual({
      allow: false,
      reason: "not_linked",
    });
  });

  it("refuses check-in and check-out when the profile flag is off", () => {
    expect(decideSelfCheck({ linked: true, enabled: false, kind: "in", punchesToday: 0 })).toEqual({
      allow: false,
      reason: "not_enabled",
    });
    expect(decideSelfCheck({ linked: true, enabled: false, kind: "out", punchesToday: 1 })).toEqual({
      allow: false,
      reason: "not_enabled",
    });
  });

  it("allows one check-in, then one check-out, for a person whose flag is on", () => {
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "in", punchesToday: 0 })).toEqual({ allow: true });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "out", punchesToday: 0 })).toEqual({
      allow: false,
      reason: "need_in",
    });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "in", punchesToday: 1 })).toEqual({
      allow: false,
      reason: "already_in",
    });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "out", punchesToday: 1 })).toEqual({ allow: true });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "out", punchesToday: 2 })).toEqual({
      allow: false,
      reason: "already_out",
    });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "in", punchesToday: 2 })).toEqual({
      allow: false,
      reason: "already_out",
    });
  });

  it("enables Check in only before the first punch and Check out only after it", () => {
    expect(selfCheckButtons(0)).toEqual({ checkIn: true, checkOut: false });
    expect(selfCheckButtons(1)).toEqual({ checkIn: false, checkOut: true });
    expect(selfCheckButtons(2)).toEqual({ checkIn: false, checkOut: false });
  });
});
