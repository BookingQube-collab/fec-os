import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEAVE_PLANNER_RULES,
  addDaysYmd,
  blackoutWindow,
  evaluateLeavePlannerRequest,
  maxAwayForDepartment,
  pairMatrixCell,
  yearViewDayMark,
  type LeavePlannerDepartment,
  type LeavePlannerEvent,
  type LeavePlannerStaffMember,
} from "./hr-leave-planner";

const rules = DEFAULT_LEAVE_PLANNER_RULES;

const depts: LeavePlannerDepartment[] = [
  { id: "hr", name: "HR", headcount: 2 },
  { id: "finance", name: "Finance", headcount: 2 },
  { id: "it", name: "IT", headcount: 3 },
  { id: "ops", name: "Operations", headcount: 1 },
];

const staff: LeavePlannerStaffMember[] = [
  { staffId: "mia", departmentIds: ["hr"] },
  { staffId: "sub", departmentIds: ["hr"] },
  { staffId: "abdullah", departmentIds: ["finance"] },
  { staffId: "indika", departmentIds: ["finance"] },
  { staffId: "izaan", departmentIds: ["it"] },
  { staffId: "rajan", departmentIds: ["it", "ops"] },
  { staffId: "russel", departmentIds: ["ops"] },
];

const major: LeavePlannerEvent = {
  id: "e1",
  name: "Lego Shows Qatar",
  eventType: "major",
  startDate: "2026-12-16",
  endDate: "2026-12-31",
};

describe("blackoutWindow", () => {
  it("applies major 40/10 lead trail", () => {
    expect(blackoutWindow(major, rules)).toEqual({
      blackoutStart: "2026-11-06",
      blackoutEnd: "2027-01-10",
    });
  });

  it("uses lighter activation lead when rule set switches", () => {
    const activation: LeavePlannerEvent = {
      id: "a1",
      name: "National Day",
      eventType: "activation",
      startDate: "2026-12-18",
      endDate: "2026-12-18",
    };
    expect(blackoutWindow(activation, rules).blackoutStart).toBe(addDaysYmd("2026-12-18", -20));
    expect(
      blackoutWindow(activation, { ...rules, activationRuleSet: "lighter" }).blackoutStart,
    ).toBe(addDaysYmd("2026-12-18", -15));
  });
});

describe("maxAwayForDepartment", () => {
  it("caps at headcount-1 and global max", () => {
    expect(maxAwayForDepartment(2, 2)).toBe(1);
    expect(maxAwayForDepartment(5, 2)).toBe(2);
    expect(maxAwayForDepartment(1, 2)).toBe(0);
  });
});

describe("evaluateLeavePlannerRequest", () => {
  it("declines invalid dates", () => {
    const res = evaluateLeavePlannerRequest({
      staffId: "mia",
      dateFrom: "2027-03-21",
      dateTo: "2027-03-01",
      rules,
      events: [],
      awayLeaves: [],
      staffMembers: staff,
      departments: depts,
    });
    expect(res.result).toBe("DECLINE");
    expect(res.codes).toContain("invalid_dates");
  });

  it("declines event blackout for annual leave", () => {
    const res = evaluateLeavePlannerRequest({
      staffId: "mia",
      dateFrom: "2026-12-01",
      dateTo: "2026-12-05",
      rules,
      events: [major],
      awayLeaves: [],
      staffMembers: staff,
      departments: depts,
    });
    expect(res.result).toBe("DECLINE");
    expect(res.codes).toContain("event_blackout");
    expect(res.blackoutEvents[0]?.name).toBe("Lego Shows Qatar");
  });

  it("approves emergency through blackout but marks wouldDecline", () => {
    const res = evaluateLeavePlannerRequest({
      staffId: "mia",
      dateFrom: "2026-12-01",
      dateTo: "2026-12-05",
      isEmergency: true,
      rules,
      events: [major],
      awayLeaves: [],
      staffMembers: staff,
      departments: depts,
    });
    expect(res.result).toBe("APPROVE");
    expect(res.wouldDecline).toBe(true);
    expect(res.codes).toContain("event_blackout");
  });

  it("declines when department of 2 already has one away", () => {
    const res = evaluateLeavePlannerRequest({
      staffId: "mia",
      dateFrom: "2027-03-01",
      dateTo: "2027-03-10",
      rules,
      events: [],
      awayLeaves: [{ staffId: "sub", dateFrom: "2027-03-05", dateTo: "2027-03-12" }],
      staffMembers: staff,
      departments: depts,
    });
    expect(res.result).toBe("DECLINE");
    expect(res.codes).toContain("department_quota");
    expect(res.departmentsOverQuota.some((d) => d.id === "hr")).toBe(true);
  });

  it("approves when free window and no quota conflict", () => {
    const res = evaluateLeavePlannerRequest({
      staffId: "mia",
      dateFrom: "2027-03-01",
      dateTo: "2027-03-21",
      rules,
      events: [major],
      awayLeaves: [],
      staffMembers: staff,
      departments: depts,
    });
    expect(res.result).toBe("APPROVE");
    expect(res.wouldDecline).toBe(false);
  });

  it("declines overall cap", () => {
    const res = evaluateLeavePlannerRequest({
      staffId: "mia",
      dateFrom: "2027-04-01",
      dateTo: "2027-04-05",
      rules: { ...rules, overallMaxAway: 1 },
      events: [],
      awayLeaves: [{ staffId: "izaan", dateFrom: "2027-04-01", dateTo: "2027-04-03" }],
      staffMembers: staff,
      departments: depts,
    });
    expect(res.result).toBe("DECLINE");
    expect(res.codes).toContain("overall_cap");
  });
});

describe("pairMatrixCell / yearViewDayMark", () => {
  it("marks X when shared dept allows only one away", () => {
    expect(pairMatrixCell(["hr"], ["hr"], depts, 2)).toBe("X");
    expect(pairMatrixCell(["it"], ["it"], depts, 2)).toBe("~");
    expect(pairMatrixCell(["hr"], ["finance"], depts, 2)).toBe("OK");
  });

  it("marks E on event days and X on blackout-only days", () => {
    expect(yearViewDayMark("2026-12-20", [major], rules)).toBe("E");
    expect(yearViewDayMark("2026-11-10", [major], rules)).toBe("X");
    expect(yearViewDayMark("2027-03-01", [major], rules)).toBe(".");
  });
});
