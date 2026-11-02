import { describe, expect, it } from "vitest";

import {
  canActOnOpsApprovalStep,
  opsApprovalLaneForStaff,
} from "./approval-ops-routing";
import {
  assertLeaveTransition,
  canTransitionLeave,
  countLeaveDays,
  defaultLeaveApprovalSteps,
  leaveApprovalStepsForRequester,
  leaveOpeningStepRole,
  leaveStepSeatLabel,
  leaveTeamSubmitOpening,
  shouldFinalizeLeaveOnApprove,
} from "./hr-leave";
import {
  isLeaveSiteStepActor,
  leaveApproverUserIdsForStep,
  leaveTeamSubmitSkips,
  resolveLeaveSupervisorRoute,
} from "./hr-leave-routing";
import type { ApprovalDirectory } from "./attendance-hr/missed-punch-approval";
import {
  annualAccrualFromHireDate,
  canUseCompOff,
  compassionateDaysFromPolicy,
  detectLeaveConflicts,
  hasHardLeaveOverlap,
} from "./hr-advanced";
import { HR_POLICY_DEFAULTS } from "./hr-policy";

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

  it("lets manager/site/ops reject but not final-approve via transition map", () => {
    expect(canTransitionLeave("pending", "rejected", "manager")).toBe(true);
    expect(canTransitionLeave("pending", "rejected", "site")).toBe(true);
    expect(canTransitionLeave("pending", "rejected", "ops")).toBe(true);
    expect(canTransitionLeave("pending", "approved", "manager")).toBe(false);
    expect(canTransitionLeave("pending", "approved", "site")).toBe(false);
  });

  it("throws on an illegal transition", () => {
    expect(() => assertLeaveTransition("rejected", "approved", "hr")).toThrow(/cannot move/);
  });

  it("counts inclusive calendar days", () => {
    expect(countLeaveDays("2026-08-28", "2026-08-28")).toBe(1);
    expect(countLeaveDays("2026-08-28", "2026-08-30")).toBe(3);
    expect(countLeaveDays("2026-08-30", "2026-08-28")).toBe(0);
  });

  it("seeds supervisor → Sr. Site → HoO approval ladder", () => {
    expect(defaultLeaveApprovalSteps().map((s) => s.stepRole)).toEqual(["manager", "site", "ops"]);
  });

  it("skips the supervisor seat when the named boss is already Sr. Site", () => {
    expect(leaveOpeningStepRole(true)).toBe("site");
    expect(leaveApprovalStepsForRequester({ skipManagerSeat: true })).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "skipped" },
      { stepOrder: 2, stepRole: "site", status: "pending" },
      { stepOrder: 3, stepRole: "ops", status: "pending" },
    ]);
  });

  it("skips manager and site for Sr. Site / HoO team leave submit", () => {
    expect(leaveTeamSubmitOpening({ isSrSite: false, isOpsFinalizer: false })).toBe("site");
    expect(leaveTeamSubmitOpening({ isSrSite: true, isOpsFinalizer: false })).toBe("ops");
    expect(leaveTeamSubmitOpening({ isSrSite: false, isOpsFinalizer: true })).toBe("final");
    expect(leaveTeamSubmitSkips("site")).toEqual({ skipManagerSeat: true, skipSiteSeat: false });
    expect(leaveTeamSubmitSkips("ops")).toEqual({ skipManagerSeat: true, skipSiteSeat: true });
    expect(leaveOpeningStepRole(true, true)).toBe("ops");
    expect(leaveApprovalStepsForRequester({ skipManagerSeat: true, skipSiteSeat: true })).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "skipped" },
      { stepOrder: 2, stepRole: "site", status: "skipped" },
      { stepOrder: 3, stepRole: "ops", status: "pending" },
    ]);
  });

  it("finalizes leave on HoO/HR approve and labels seats", () => {
    expect(shouldFinalizeLeaveOnApprove("ops", null)).toBe(true);
    expect(shouldFinalizeLeaveOnApprove("ops", "hr")).toBe(true);
    expect(shouldFinalizeLeaveOnApprove("site", "ops")).toBe(false);
    expect(shouldFinalizeLeaveOnApprove("manager", "site")).toBe(false);
    expect(leaveStepSeatLabel("site")).toBe("Sr. Site Supervisor");
    expect(leaveStepSeatLabel("ops")).toBe("Head of Operations");
    expect(leaveStepSeatLabel("ops", { opsLane: "fnb_manager" })).toBe("F&B Manager");
    expect(isLeaveSiteStepActor("Sr. Site Supervisor")).toBe(true);
    expect(isLeaveSiteStepActor("Site Supervisor")).toBe(false);
  });

  it("routes Operations leave ops step to Head of Operations and F&B to F&B Manager", () => {
    expect(opsApprovalLaneForStaff("Site Supervisor", "Operations")).toBe("head_of_operations");
    expect(opsApprovalLaneForStaff("Barista", "F&B Cafe")).toBe("fnb_manager");
    expect(
      canActOnOpsApprovalStep({
        manage: false,
        lane: "head_of_operations",
        actorJobTitle: "Head of Operations",
      }),
    ).toBe(true);
    expect(
      canActOnOpsApprovalStep({
        manage: false,
        lane: "fnb_manager",
        actorJobTitle: "F&B Manager",
        actorDepartment: "F&B",
      }),
    ).toBe(true);
    expect(
      canActOnOpsApprovalStep({
        manage: false,
        lane: "fnb_manager",
        actorJobTitle: "Head of Operations",
      }),
    ).toBe(false);
  });
});

describe("annual accrual from hire_date (AT#8 leave)", () => {
  it("is ineligible before hire year", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2027-03-01",
      year: 2026,
      annualDays: 21,
      fromHireDate: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.accruedDays).toBe(0);
  });

  it("pro-rates months from mid-year hire", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2026-07-01",
      year: 2026,
      annualDays: 21,
      fromHireDate: true,
      asOfDate: "2026-12-31",
    });
    expect(r.eligible).toBe(true);
    expect(r.monthsAccrued).toBe(6);
    expect(r.accruedDays).toBe(10.5);
  });

  it("gives full allotment when hired before the year", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2024-01-15",
      year: 2026,
      annualDays: 21,
      fromHireDate: true,
      asOfDate: "2026-12-31",
    });
    expect(r.eligible).toBe(true);
    expect(r.monthsAccrued).toBe(12);
    expect(r.accruedDays).toBe(21);
  });

  it("skips pro-rate when annual_from_hire_date is false", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2026-10-01",
      year: 2026,
      annualDays: 21,
      fromHireDate: false,
    });
    expect(r.accruedDays).toBe(21);
  });
});

describe("overlap prevention", () => {
  it("hard-blocks overlapping leave requests", () => {
    const conflicts = detectLeaveConflicts({
      dateFrom: "2026-08-28",
      dateTo: "2026-08-30",
      overlappingLeave: [{ dateFrom: "2026-08-30", dateTo: "2026-09-01", status: "pending" }],
    });
    expect(hasHardLeaveOverlap(conflicts)).toBe(true);
  });

  it("does not hard-block roster-only conflicts", () => {
    const conflicts = detectLeaveConflicts({
      dateFrom: "2026-08-28",
      dateTo: "2026-08-30",
      rosterDates: ["2026-08-29"],
    });
    expect(hasHardLeaveOverlap(conflicts)).toBe(false);
  });
});

describe("compassionate defaults from policy", () => {
  it("uses Qatar 5 / outside 11 from policy defaults", () => {
    expect(compassionateDaysFromPolicy(HR_POLICY_DEFAULTS.leave, "inside_qatar")).toBe(5);
    expect(compassionateDaysFromPolicy(HR_POLICY_DEFAULTS.leave, "outside_qatar")).toBe(11);
  });
});

describe("comp-off expiry", () => {
  it("blocks use after expiry unless HR exception", () => {
    expect(
      canUseCompOff({
        expiresOn: "2026-01-01",
        asOfDate: "2026-02-01",
        remainingDays: 1,
      }),
    ).toBe(false);
    expect(
      canUseCompOff({
        expiresOn: "2026-01-01",
        asOfDate: "2026-02-01",
        remainingDays: 1,
        hrException: true,
      }),
    ).toBe(true);
  });
});

describe("leave supervisor → Sr. Site → HoO routing", () => {
  const SITE = "site-1";
  const STAFF = "staff-1";
  const LINE = "line-manager";
  const SR_SITE = "sr-site-user";
  const HOO = "hoo-user";
  const EMPLOYEE = "employee-user";

  function directory(partial?: Partial<ApprovalDirectory>): ApprovalDirectory {
    return {
      reportingManagerUserIdByStaffId: new Map([[STAFF, LINE]]),
      siteSupervisorManagerUserIdByStaffId: new Map(),
      branchGmUserIdsByLocationId: new Map(),
      siteSupervisorUserIdsByLocationId: new Map([[SITE, [SR_SITE]]]),
      srSiteSupervisorUserIds: [SR_SITE],
      headOfOperationsUserIds: [HOO],
      fnbManagerUserIds: [],
      fnbStaffIds: new Set(),
      opsManagerUserIdsByLocationId: new Map(),
      hrUserIds: ["hr-user"],
      generalManagerUserIds: [],
      ...partial,
    };
  }

  it("keeps Venue supervisor on manager and Sr. Site on site, then HoO on ops", () => {
    const dir = directory();
    const args = {
      locationId: SITE,
      staffId: STAFF,
      requestedBy: EMPLOYEE,
      requesterStaffId: STAFF,
    };
    const route = resolveLeaveSupervisorRoute(dir, args);
    expect(route.skipManagerSeat).toBe(false);
    expect(route.openingStep).toBe("manager");
    expect(route.managerUserIds).toEqual([LINE]);
    expect(route.siteUserIds).toContain(SR_SITE);
    expect(leaveApproverUserIdsForStep(dir, "ops", args)).toEqual([HOO]);
  });

  it("opens on Sr. Site when the named boss already is Sr. Site", () => {
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([[STAFF, SR_SITE]]),
    });
    const route = resolveLeaveSupervisorRoute(dir, {
      locationId: SITE,
      staffId: STAFF,
      requestedBy: EMPLOYEE,
      requesterStaffId: STAFF,
    });
    expect(route.skipManagerSeat).toBe(true);
    expect(route.openingStep).toBe("site");
    expect(route.managerUserIds).toEqual([]);
    expect(route.siteUserIds).toContain(SR_SITE);
  });
});
