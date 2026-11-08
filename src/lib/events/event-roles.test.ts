import { describe, expect, it } from "vitest";

import {
  computeLabourPayFromDayCharge,
  DEFAULT_EVENT_ROLE_CATALOG,
  eventRoleAllowsPeopleFallback,
  eventRoleScheduleMode,
  matchEventRole,
  normalizeEventRoleDrafts,
  resolveLabourDayRateQar,
  resolveLabourHoursPerDay,
  slugifyEventRoleCode,
} from "./event-roles";

describe("event roles catalog", () => {
  it("seeds crew/cleaner/maintenance/management/labour with kinds", () => {
    const byCode = Object.fromEntries(DEFAULT_EVENT_ROLE_CATALOG.map((r) => [r.code, r]));
    expect(byCode.crew?.kind).toBe("shift");
    expect(byCode.management?.kind).toBe("shift");
    expect(byCode.cleaner?.kind).toBe("labour");
    expect(byCode.maintenance?.kind).toBe("labour");
    expect(byCode.labour?.kind).toBe("labour");
  });

  it("maps kind to schedule mode", () => {
    expect(eventRoleScheduleMode("shift")).toBe("event_day");
    expect(eventRoleScheduleMode("labour")).toBe("labour_days");
  });

  it("allows HO people fallback only for management-style shift roles", () => {
    expect(eventRoleAllowsPeopleFallback({ code: "management", kind: "shift" })).toBe(true);
    expect(eventRoleAllowsPeopleFallback({ code: "crew", kind: "shift" })).toBe(false);
    expect(eventRoleAllowsPeopleFallback({ code: "labour", kind: "labour" })).toBe(false);
  });
});

describe("labour charge math", () => {
  it("uses (hours_worked / hours_in_day) × per_day_charge", () => {
    expect(computeLabourPayFromDayCharge({ hoursWorked: 10, hoursInDay: 10, perDayChargeQar: 100 })).toBe(
      100,
    );
    expect(computeLabourPayFromDayCharge({ hoursWorked: 20, hoursInDay: 10, perDayChargeQar: 100 })).toBe(
      200,
    );
    expect(computeLabourPayFromDayCharge({ hoursWorked: 8, hoursInDay: 8, perDayChargeQar: 80 })).toBe(80);
    expect(computeLabourPayFromDayCharge({ hoursWorked: 4, hoursInDay: 8, perDayChargeQar: 80 })).toBe(40);
  });

  it("resolves hours and day rate with assignment → role → staff fallback", () => {
    expect(resolveLabourHoursPerDay({ hours_per_day: 8, role_default_hours_per_day: 10 })).toBe(8);
    expect(resolveLabourHoursPerDay({ role_default_hours_per_day: 12 })).toBe(12);
    expect(resolveLabourHoursPerDay({})).toBe(10);
    expect(
      resolveLabourDayRateQar({
        day_rate_qar: 90,
        role_default_day_rate_qar: 100,
        staff_daily_rate_qar: 70,
      }),
    ).toBe(90);
    expect(
      resolveLabourDayRateQar({
        role_default_day_rate_qar: 100,
        staff_daily_rate_qar: 70,
      }),
    ).toBe(100);
    expect(resolveLabourDayRateQar({ staff_daily_rate_qar: 70 })).toBe(70);
  });
});

describe("matchEventRole", () => {
  const roles = [
    { id: "r1", code: "crew", name: "Crew", is_active: true },
    { id: "r2", code: "labour", name: "Labour", is_active: true },
    { id: "r3", code: "cleaner", name: "Cleaner", is_active: true },
  ];

  it("matches by event_role_id first", () => {
    expect(matchEventRole(roles, { event_role_id: "r3", role_label: "Crew" })?.id).toBe("r3");
  });

  it("matches role_label to name/code", () => {
    expect(matchEventRole(roles, { role_label: "Labour" })?.code).toBe("labour");
    expect(matchEventRole(roles, { role_label: "Cleaner" })?.code).toBe("cleaner");
  });

  it("falls back to legacy category for catalog codes", () => {
    expect(
      matchEventRole(roles, {
        role_label: null,
        job_title: "General Manager",
        is_head_office: true,
      })?.code,
    ).toBeUndefined(); // management not in this fixture
    expect(matchEventRole(roles, { role_label: "Cashier" })?.code).toBe("crew");
  });
});

describe("normalizeEventRoleDrafts", () => {
  it("defaults to full catalog when empty", () => {
    expect(normalizeEventRoleDrafts(null)).toHaveLength(DEFAULT_EVENT_ROLE_CATALOG.length);
  });

  it("slugifies custom roles and keeps labour kind", () => {
    const rows = normalizeEventRoleDrafts([
      { name: "Stage Hands", kind: "shift" },
      { name: "Day Labour", kind: "labour", default_hours_per_day: 8, default_day_rate_qar: 120 },
    ]);
    expect(rows[0]?.code).toBe(slugifyEventRoleCode("Stage Hands"));
    expect(rows[1]?.kind).toBe("labour");
    expect(rows[1]?.default_hours_per_day).toBe(8);
    expect(rows[1]?.default_day_rate_qar).toBe(120);
  });
});
