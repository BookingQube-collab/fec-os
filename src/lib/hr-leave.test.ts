import { describe, expect, it } from "vitest";

import {
  canActOnOpsApprovalStep,
  opsApprovalLaneForStaff,
} from "./approval-ops-routing";
import {
  assertLeaveTransition,
  canTransitionLeave,
  countLeaveDays,
  dedupeLeaveApprovalRows,
  defaultLeaveApprovalSteps,
  leaveApprovalStepsForRequester,
  leaveOpeningStepRole,
  leaveDisplayStepRole,
  leaveStepSeatLabel,
  leavePrintSignatureActors,
  leavePrintSignatureDone,
  leavePrintUsesLegacySiteAsManager,
  leaveTeamSubmitOpening,
  shouldFinalizeLeaveOnApprove,
} from "./hr-leave";
import {
  isLeaveSiteStepActor,
  leaveApproverUserIdsForStep,
  leavePrintShowsSupervisorSeat,
  leaveSubjectSeatSkips,
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
    expect(leaveStepSeatLabel("manager")).toBe("Supervisor");
    expect(leaveStepSeatLabel("site")).toBe("Sr. Site Supervisor");
    expect(leaveStepSeatLabel("ops")).toBe("Head of Operations");
    expect(leaveStepSeatLabel("ops", { opsLane: "fnb_manager" })).toBe("F&B Manager");
    expect(leaveStepSeatLabel("hr")).toBe("HR");
    expect(isLeaveSiteStepActor("Sr. Site Supervisor")).toBe(true);
    expect(isLeaveSiteStepActor("Site Supervisor")).toBe(false);
    // Legacy manager→ops: first seat was Sr. Site — trail must not say Supervisor.
    const legacy = [
      { stepRole: "manager", status: "approved" },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leaveDisplayStepRole("manager", legacy)).toBe("site");
    expect(leaveStepSeatLabel(leaveDisplayStepRole("manager", legacy))).toBe("Sr. Site Supervisor");
    const modern = [
      { stepRole: "manager", status: "approved" },
      { stepRole: "site", status: "pending" },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leaveDisplayStepRole("manager", modern)).toBe("manager");
    expect(leaveDisplayStepRole("site", modern)).toBe("site");
  });

  it("skips supervisor + site seats when the leave subject is Sr. Site", () => {
    expect(leaveSubjectSeatSkips("Sr. Site Supervisor")).toEqual({
      skipManagerSeat: true,
      skipSiteSeat: true,
    });
    expect(leaveSubjectSeatSkips("Crew / Attendant")).toBeNull();
    expect(leaveOpeningStepRole(true, true)).toBe("ops");
    expect(leavePrintShowsSupervisorSeat("Crew / Attendant")).toBe(true);
    expect(leavePrintShowsSupervisorSeat("Supervisor")).toBe(true);
    expect(leavePrintShowsSupervisorSeat("Sr. Site Supervisor")).toBe(false);
  });

  it("hides Supervisor print column unless a real supervisor seat is on the leave", () => {
    const opensAtSite = [
      { stepRole: "manager", status: "skipped" },
      { stepRole: "site", status: "approved" },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leavePrintShowsSupervisorSeat("Crew / Attendant", opensAtSite)).toBe(false);

    const hasSupervisor = [
      { stepRole: "manager", status: "approved" },
      { stepRole: "site", status: "pending" },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leavePrintShowsSupervisorSeat("Crew / Attendant", hasSupervisor)).toBe(true);

    const legacyNoSite = [
      {
        stepRole: "manager",
        status: "approved",
        actedByName: "Mary Wangare Muiruri",
      },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leavePrintShowsSupervisorSeat("Crew / Attendant", legacyNoSite)).toBe(false);
    expect(leavePrintUsesLegacySiteAsManager(legacyNoSite)).toBe(true);
  });

  it("stamps print signatures only after each seat actually approves", () => {
    const pending = [
      { stepRole: "manager", status: "pending" },
      { stepRole: "site", status: "pending" },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leavePrintSignatureDone("pending", pending, "supervisor")).toBe(false);
    expect(leavePrintSignatureDone("pending", pending, "site")).toBe(false);
    expect(leavePrintSignatureDone("pending", pending, "hoo")).toBe(false);
    expect(leavePrintSignatureDone("pending", pending, "hr")).toBe(false);

    const afterSupervisor = [
      {
        stepRole: "manager",
        status: "approved",
        actedByName: "Venue Lead",
        actedAt: "2026-11-02T10:00:00Z",
      },
      { stepRole: "site", status: "pending" },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leavePrintSignatureDone("pending", afterSupervisor, "supervisor")).toBe(true);
    expect(leavePrintSignatureDone("pending", afterSupervisor, "site")).toBe(false);
    expect(leavePrintSignatureActors({ status: "pending", steps: afterSupervisor }).supervisor.name).toBe(
      "Venue Lead",
    );

    const skippedSupervisor = [
      { stepRole: "manager", status: "skipped" },
      {
        stepRole: "site",
        status: "approved",
        actedByName: "Mary Wangare Muiruri",
        actedAt: "2026-11-02T11:00:00Z",
        actedBySignatureUrl: "https://signed.example/mary.png",
      },
      {
        stepRole: "ops",
        status: "approved",
        actedByName: "Rajan Pathak",
        actedAt: "2026-11-02T12:00:00Z",
      },
    ];
    expect(leavePrintSignatureDone("approved", skippedSupervisor, "supervisor")).toBe(false);
    expect(leavePrintSignatureDone("approved", skippedSupervisor, "site")).toBe(true);
    expect(leavePrintSignatureDone("approved", skippedSupervisor, "hoo")).toBe(true);
    expect(leavePrintSignatureDone("approved", skippedSupervisor, "hr")).toBe(true);
    const actors = leavePrintSignatureActors({ status: "approved", steps: skippedSupervisor });
    expect(actors.site).toEqual({
      name: "Mary Wangare Muiruri",
      at: "2026-11-02T11:00:00Z",
      imageUrl: "https://signed.example/mary.png",
    });
    expect(actors.hoo.name).toBe("Rajan Pathak");
    expect(actors.supervisor.name).toBeNull();

    // Legacy manager→ops (no site seat): Mary's stamp belongs under Sr. Site, not Supervisor.
    const legacyMary = [
      {
        stepRole: "manager",
        status: "approved",
        actedByName: "Mary Wangare Muiruri",
        actedAt: "2026-10-30T10:00:00Z",
        actedBySignatureUrl: "https://signed.example/mary.png",
      },
      { stepRole: "ops", status: "pending" },
    ];
    expect(leavePrintSignatureDone("pending", legacyMary, "supervisor")).toBe(false);
    expect(leavePrintSignatureDone("pending", legacyMary, "site")).toBe(true);
    const legacyActors = leavePrintSignatureActors({ status: "pending", steps: legacyMary });
    expect(legacyActors.supervisor.name).toBeNull();
    expect(legacyActors.site).toEqual({
      name: "Mary Wangare Muiruri",
      at: "2026-10-30T10:00:00Z",
      imageUrl: "https://signed.example/mary.png",
    });
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

describe("approve queue dedupe", () => {
  it("keeps one id and collapses identical pending retry rows", () => {
    const rows = [
      {
        id: "a",
        staffId: "s1",
        leaveType: "sick",
        dateFrom: "2026-11-02",
        dateTo: "2026-11-02",
        createdAt: "2026-11-02T10:00:00Z",
        status: "pending",
      },
      {
        id: "a",
        staffId: "s1",
        leaveType: "sick",
        dateFrom: "2026-11-02",
        dateTo: "2026-11-02",
        createdAt: "2026-11-02T10:00:00Z",
        status: "pending",
      },
      {
        id: "b",
        staffId: "s1",
        leaveType: "sick",
        dateFrom: "2026-11-02",
        dateTo: "2026-11-02",
        createdAt: "2026-11-02T11:00:00Z",
        status: "pending",
      },
      {
        id: "c",
        staffId: "s2",
        leaveType: "sick",
        dateFrom: "2026-11-02",
        dateTo: "2026-11-02",
        createdAt: "2026-11-02T12:00:00Z",
        status: "pending",
      },
    ];
    const deduped = dedupeLeaveApprovalRows(rows, { collapsePendingExact: true });
    expect(deduped.map((r) => r.id).sort()).toEqual(["a", "c"]);
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

  it("does not treat roster assignment as a leave conflict", () => {
    const conflicts = detectLeaveConflicts({
      dateFrom: "2026-08-28",
      dateTo: "2026-08-30",
      rosterDates: ["2026-08-29"],
    });
    expect(conflicts).toEqual([]);
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
