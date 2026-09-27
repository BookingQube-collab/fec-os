import { describe, expect, it } from "vitest";

import {
  approverUserIdsForStep,
  canUserActOnCorrection,
  correctionVisibleToUser,
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
  lineManagerUserIds,
  missedPunchApprovalSteps,
  missedPunchRequestSide,
  nextMissedPunchStep,
  type ApprovalDirectory,
  type CorrectionApprovalView,
} from "./missed-punch-approval";

const INF = "70276151-5f3a-4d5d-9b3b-83a60d6e2b9e";
const KDS = "03fc5371-5578-4e1d-8687-e858520dcae5";
const MARY = "fe8f7df9-9331-4d5f-80a3-41930dc84f65";
const MARY_TEST = "4f8f40fd-fab0-486d-952e-df4ffd50ec9c";
const ASHFAQ = "855907b6-b16a-45ef-bd33-eedaac62c9b4";
const OMAR = "7a0e83af-013e-4929-a7fb-84868686c50f";
const RAJAN = "rajan-user";
const HR = "c65fd020-47d5-4bc8-a5a3-27b0926dc7bd";
const STAFF = "staff-1";

function directory(partial?: Partial<ApprovalDirectory>): ApprovalDirectory {
  return {
    reportingManagerUserIdByStaffId: new Map(),
    branchGmUserIdsByLocationId: new Map([
      [INF, [MARY, MARY_TEST]],
      [KDS, ["ashfaq-test-login"]],
    ]),
    siteSupervisorUserIdsByLocationId: new Map([
      [INF, [MARY]],
      [KDS, [ASHFAQ]],
    ]),
    headOfOperationsUserIds: [RAJAN],
    hrUserIds: [HR],
    ...partial,
  };
}

function row(partial?: Partial<CorrectionApprovalView>): CorrectionApprovalView {
  return {
    status: "pending",
    currentStepRole: "manager",
    locationId: INF,
    staffId: STAFF,
    requestedBy: "employee-1",
    ...partial,
  };
}

describe("missed punch approval chain", () => {
  it("uses the leave ladder manager → ops → hr", () => {
    expect(missedPunchApprovalSteps().map((step) => step.stepRole)).toEqual(["manager", "ops", "hr"]);
    expect(nextMissedPunchStep("manager")).toBe("ops");
    expect(nextMissedPunchStep("ops")).toBe("hr");
    expect(nextMissedPunchStep("hr")).toBeNull();
  });

  it("offers both punch in and punch out on a correctable day, including when one punch exists", () => {
    expect(missedPunchRequestSide({ missedPunch: true, status: "missed_punch", hasIn: false, hasOut: false })).toBe(
      "either",
    );
    expect(missedPunchRequestSide({ missedPunch: true, status: "missed_punch", hasIn: true, hasOut: false })).toBe(
      "either",
    );
    expect(missedPunchRequestSide({ missedPunch: false, status: "present", hasIn: false, hasOut: true })).toBe("either");
    expect(missedPunchRequestSide({ missedPunch: false, status: "absent", hasIn: false, hasOut: false })).toBe("either");
    expect(missedPunchRequestSide({ missedPunch: false, status: "weekly_off", hasIn: false, hasOut: false })).toBeNull();
    expect(missedPunchRequestSide({ missedPunch: false, status: "annual_leave", hasIn: false, hasOut: false })).toBeNull();
    expect(missedPunchRequestSide({ missedPunch: false, status: "present", hasIn: true, hasOut: true })).toBeNull();
  });

  it("treats Mary’s title as the site in-charge and ignores other supervisor titles", () => {
    expect(isSiteSupervisorTitle("Sr. Site Supervisor", "venue_supervisor")).toBe(true);
    expect(isSiteSupervisorTitle("Venue Supervisor", "venue_supervisor")).toBe(true);
    expect(isSiteSupervisorTitle(null, "venue_supervisor")).toBe(true);
    expect(isSiteSupervisorTitle("Production Supervisor", "other")).toBe(false);
    expect(isSiteSupervisorTitle("Technician & Maintenance Supervisor", "technician")).toBe(false);
    expect(isSiteSupervisorTitle("AV Specialist / FEC Supervisor", "other")).toBe(false);
    expect(isSiteSupervisorTitle("Head of Operations / FEC-IT", "other")).toBe(false);
    expect(isHeadOfOperationsTitle("Head of Operations / FEC-IT")).toBe(true);
  });

  it("derives the line manager from the site when nobody is named as reporting manager", () => {
    const dir = directory();
    expect(lineManagerUserIds(dir, INF, STAFF).sort()).toEqual([MARY, MARY_TEST].sort());
    expect(lineManagerUserIds(dir, KDS, STAFF).sort()).toEqual(["ashfaq-test-login", ASHFAQ].sort());
    expect(lineManagerUserIds(dir, INF, STAFF)).not.toContain(OMAR);
  });

  it("uses a linked reporting manager instead of every site supervisor", () => {
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([[STAFF, MARY]]),
    });
    expect(lineManagerUserIds(dir, INF, STAFF)).toEqual([MARY]);
  });

  it("shows a new request only to the site supervisor, then HoO, then HR", () => {
    const dir = directory();
    const fresh = row();
    expect(canUserActOnCorrection(dir, MARY, fresh)).toBe(true);
    expect(canUserActOnCorrection(dir, MARY_TEST, fresh)).toBe(true);
    expect(canUserActOnCorrection(dir, RAJAN, fresh)).toBe(false);
    expect(canUserActOnCorrection(dir, HR, fresh)).toBe(false);
    expect(canUserActOnCorrection(dir, OMAR, fresh)).toBe(false);

    const afterSupervisor = row({ currentStepRole: "ops" });
    expect(canUserActOnCorrection(dir, MARY, afterSupervisor)).toBe(false);
    expect(canUserActOnCorrection(dir, RAJAN, afterSupervisor)).toBe(true);
    expect(canUserActOnCorrection(dir, HR, afterSupervisor)).toBe(false);

    const afterOps = row({ currentStepRole: "hr" });
    expect(canUserActOnCorrection(dir, RAJAN, afterOps)).toBe(false);
    expect(canUserActOnCorrection(dir, HR, afterOps)).toBe(true);
    expect(approverUserIdsForStep(dir, "hr", INF, STAFF)).toEqual([HR]);
  });

  it("stops the chain on reject and blocks self-approval", () => {
    const dir = directory();
    expect(canUserActOnCorrection(dir, MARY, row({ status: "rejected" }))).toBe(false);
    expect(canUserActOnCorrection(dir, MARY, row({ requestedBy: MARY }))).toBe(false);
  });

  it("lets an employee see their own request and hides other sites’ manager queue", () => {
    const dir = directory();
    const fresh = row();
    expect(
      correctionVisibleToUser({
        queue: "mine",
        userId: "employee-1",
        canFinalApprove: false,
        viewAll: false,
        canSeeLocation: () => false,
        directory: dir,
        row: fresh,
      }),
    ).toBe(true);
    expect(
      correctionVisibleToUser({
        queue: "waiting",
        userId: ASHFAQ,
        canFinalApprove: false,
        viewAll: false,
        canSeeLocation: (id) => id === KDS,
        directory: dir,
        row: fresh,
      }),
    ).toBe(false);
  });
});
