import { describe, expect, it } from "vitest";

import {
  approverUserIdsForStep,
  canUserActOnCorrection,
  applyAcceptedCorrectionTimes,
  correctionCardClocks,
  correctionIdsForReview,
  correctionPunchAccepted,
  correctionVisibleToUser,
  employeeHomeCorrectionRows,
  isHeadOfOperationsTitle,
  missedPunchCopiesExecutives,
  isSiteSupervisorTitle,
  punchAtFromCorrectionValue,
  punchTimeInputValue,
  canCorrectStaffPunch,
  canRequestAttendanceCorrection,
  canRequesterEditMissedPunch,
  correctionStepSeed,
  correctionWaitingStep,
  isEditableMissedPunchStatus,
  teamCorrectionRouteAfterOpsCheck,
  lineManagerUserIds,
  siteApproverLocationMap,
  managerTeamCorrectionNote,
  ownCorrectionRouteAfterLineManagerCheck,
  punchCorrectionRoute,
  missedPunchApprovalSteps,
  missedPunchRequestSide,
  nextMissedPunchStep,
  punchCorrectionRequestSide,
  requesterLineManagerUserIds,
  shouldHealOwnCorrectionToOpsFirst,
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

const RUBEN = "ruben-fnb-manager";
const BARISTA = "barista-staff";

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
    fnbManagerUserIds: [RUBEN],
    fnbStaffIds: new Set(),
    opsManagerUserIdsByLocationId: new Map(),
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

  it("routes the operations step only to Head of Operations for Operations staff", () => {
    const dir = directory({
      headOfOperationsUserIds: [RAJAN],
      opsManagerUserIdsByLocationId: new Map([[INF, ["louie-user"]]]),
    });
    expect(approverUserIdsForStep(dir, "ops", INF, STAFF)).toEqual([RAJAN]);
    expect(canUserActOnCorrection(dir, RAJAN, row({ currentStepRole: "ops" }))).toBe(true);
    expect(canUserActOnCorrection(dir, "louie-user", row({ currentStepRole: "ops" }))).toBe(false);
    expect(canUserActOnCorrection(dir, MARY, row({ currentStepRole: "ops" }))).toBe(false);
    expect(canUserActOnCorrection(dir, RUBEN, row({ currentStepRole: "ops" }))).toBe(false);
  });

  it("routes the operations step to F&B Manager for F&B staff, not Head of Operations", () => {
    const dir = directory({
      fnbStaffIds: new Set([BARISTA]),
      fnbManagerUserIds: [RUBEN],
      headOfOperationsUserIds: [RAJAN],
    });
    expect(approverUserIdsForStep(dir, "ops", INF, BARISTA)).toEqual([RUBEN]);
    expect(approverUserIdsForStep(dir, "ops", INF, STAFF)).toEqual([RAJAN]);
    expect(canUserActOnCorrection(dir, RUBEN, row({ staffId: BARISTA, currentStepRole: "ops" }))).toBe(true);
    expect(canUserActOnCorrection(dir, RAJAN, row({ staffId: BARISTA, currentStepRole: "ops" }))).toBe(false);
    expect(canUserActOnCorrection(dir, RUBEN, row({ staffId: STAFF, currentStepRole: "ops" }))).toBe(false);
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

  it("copies supervisor and operations steps to Admin, and leaves HR with HR", () => {
    expect(missedPunchCopiesExecutives("manager")).toBe(true);
    expect(missedPunchCopiesExecutives("ops")).toBe(true);
    expect(missedPunchCopiesExecutives("hr")).toBe(false);
    const dir = directory();
    const ceo = "ceo-user";
    expect(
      correctionVisibleToUser({
        queue: "waiting",
        userId: ceo,
        canFinalApprove: true,
        viewAll: true,
        canSeeLocation: () => true,
        directory: dir,
        row: row(),
        observeExecutiveSteps: true,
      }),
    ).toBe(true);
    expect(
      correctionVisibleToUser({
        queue: "waiting",
        userId: ceo,
        canFinalApprove: true,
        viewAll: true,
        canSeeLocation: () => true,
        directory: dir,
        row: row({ currentStepRole: "ops" }),
        observeExecutiveSteps: true,
      }),
    ).toBe(true);
    expect(
      correctionVisibleToUser({
        queue: "waiting",
        userId: ceo,
        canFinalApprove: true,
        viewAll: true,
        canSeeLocation: () => true,
        directory: dir,
        row: row({ currentStepRole: "hr" }),
        observeExecutiveSteps: true,
      }),
    ).toBe(false);
    expect(canUserActOnCorrection(dir, ceo, row())).toBe(false);
    expect(canUserActOnCorrection(dir, ceo, row({ currentStepRole: "ops" }))).toBe(false);
  });

  it("stops the chain on reject and blocks self-approval", () => {
    const dir = directory();
    expect(canUserActOnCorrection(dir, MARY, row({ status: "rejected" }))).toBe(false);
    expect(canUserActOnCorrection(dir, MARY, row({ requestedBy: MARY }))).toBe(false);
  });

  it("approves only the clicked correction when punch in and punch out share an employee day", () => {
    const lines = [
      { id: "punch-in", staffId: ASHFAQ, workDate: "2026-09-24", punchType: "in" as const },
      { id: "punch-out", staffId: ASHFAQ, workDate: "2026-09-24", punchType: "out" as const },
    ];
    expect(correctionIdsForReview(lines, "punch-out")).toEqual(["punch-out"]);
    expect(correctionIdsForReview(lines, "punch-in")).toEqual(["punch-in"]);
    expect(correctionIdsForReview(lines, "missing")).toEqual([]);
  });

  it("puts an accepted punch on that side of the day and leaves the pending sibling off", () => {
    const day = {
      staff_id: ASHFAQ,
      work_date: "2026-09-24",
      actual_in: "2026-09-24T22:59:31+03:00",
      actual_out: null as string | null,
    };
    const [next] = applyAcceptedCorrectionTimes(
      [day],
      [
        {
          id: "punch-out",
          staffId: ASHFAQ,
          workDate: "2026-09-24",
          status: "pending",
          currentStepRole: "ops",
          punchType: "out",
          punchAt: "2026-09-24T23:40:00+03:00",
          requestedAt: "2026-09-24T18:00:00Z",
        },
        {
          id: "punch-in",
          staffId: ASHFAQ,
          workDate: "2026-09-24",
          status: "pending",
          currentStepRole: "manager",
          punchType: "in",
          punchAt: "2026-09-24T14:05:00+03:00",
          requestedAt: "2026-09-24T18:01:00Z",
        },
      ],
    );
    expect(next?.actual_in).toBe("2026-09-24T22:59:31+03:00");
    expect(next?.actual_out).toBe("2026-09-24T23:40:00+03:00");
    expect(correctionPunchAccepted({ status: "pending", currentStepRole: "manager" })).toBe(false);
    expect(correctionPunchAccepted({ status: "change_required", currentStepRole: null })).toBe(false);
    expect(correctionPunchAccepted({ status: "rejected", currentStepRole: null })).toBe(false);
  });

  it("shows only this request's clock on the correction card", () => {
    expect(correctionCardClocks("in", "2026-09-24T22:59:31+03:00")).toEqual({
      punchIn: "2026-09-24T22:59:31+03:00",
      punchOut: null,
    });
    expect(correctionCardClocks("out", "2026-09-24T23:40:00+03:00")).toEqual({
      punchIn: null,
      punchOut: "2026-09-24T23:40:00+03:00",
    });
    expect(punchAtFromCorrectionValue({ punch_at: "2026-09-24T22:59:31+03:00", punch_type: "in" })).toBe(
      "2026-09-24T22:59:31+03:00",
    );
    expect(punchAtFromCorrectionValue({})).toBeNull();
    expect(punchTimeInputValue("2026-09-24T22:59:00+03:00")).toBe("22:59");
  });

  it("lets only the requester edit while pending or change_required", () => {
    expect(isEditableMissedPunchStatus("pending")).toBe(true);
    expect(isEditableMissedPunchStatus("change_required")).toBe(true);
    expect(isEditableMissedPunchStatus("approved")).toBe(false);
    expect(isEditableMissedPunchStatus("rejected")).toBe(false);

    expect(
      canRequesterEditMissedPunch({ userId: "employee-1", requestedBy: "employee-1", status: "pending" }),
    ).toBe(true);
    expect(
      canRequesterEditMissedPunch({
        userId: "employee-1",
        requestedBy: "employee-1",
        status: "change_required",
      }),
    ).toBe(true);
    expect(
      canRequesterEditMissedPunch({ userId: "employee-1", requestedBy: "employee-1", status: "approved" }),
    ).toBe(false);
    expect(
      canRequesterEditMissedPunch({ userId: "employee-1", requestedBy: "employee-1", status: "rejected" }),
    ).toBe(false);
    expect(
      canRequesterEditMissedPunch({ userId: "other-user", requestedBy: "employee-1", status: "pending" }),
    ).toBe(false);
    expect(
      canRequesterEditMissedPunch({
        userId: "other-user",
        requestedBy: "employee-1",
        status: "change_required",
      }),
    ).toBe(false);
  });

  it("lets the site supervisor see a row after their step without letting them act again", () => {
    const dir = directory();
    const movedOn = row({ currentStepRole: "ops" });
    expect(canUserActOnCorrection(dir, MARY, movedOn)).toBe(false);
    expect(canUserActOnCorrection(dir, MARY, row({ status: "change_required", currentStepRole: null }))).toBe(false);
    expect(
      correctionVisibleToUser({
        queue: "waiting",
        userId: MARY,
        canFinalApprove: false,
        viewAll: false,
        canSeeLocation: () => false,
        directory: dir,
        row: movedOn,
      }),
    ).toBe(true);
    expect(
      correctionVisibleToUser({
        queue: "waiting",
        userId: MARY,
        canFinalApprove: false,
        viewAll: false,
        canSeeLocation: (id) => id === INF,
        directory: dir,
        row: row({ status: "rejected", currentStepRole: null }),
      }),
    ).toBe(true);
  });

  it("lets floor staff request their own correction, and lets managers request one for a team", () => {
    expect(canRequestAttendanceCorrection({ roles: ["cashier_host"], hasDirectReports: false })).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["technician"], hasDirectReports: false })).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["customer_service"], hasDirectReports: false })).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["cashier_host"], hasDirectReports: true })).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["duty_manager"], hasDirectReports: false })).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["tech_supervisor"], hasDirectReports: false })).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["branch_gm"], hasDirectReports: false })).toBe(true);
    expect(
      canCorrectStaffPunch({
        requesterStaffId: "supervisor-staff",
        targetStaffId: "supervisor-staff",
        directReportStaffIds: ["team-member"],
      }),
    ).toBe(true);
    expect(
      canCorrectStaffPunch({
        requesterStaffId: "supervisor-staff",
        targetStaffId: "team-member",
        directReportStaffIds: ["team-member"],
      }),
    ).toBe(true);
    expect(
      canCorrectStaffPunch({
        requesterStaffId: "supervisor-staff",
        targetStaffId: "someone-else",
        directReportStaffIds: ["team-member"],
      }),
    ).toBe(false);
  });

  it("allows a wrong punch-in and punch-out to be corrected when both clocks already exist", () => {
    expect(punchCorrectionRequestSide({ missedPunch: false, status: "present", hasIn: true, hasOut: true })).toBe(
      "either",
    );
    expect(missedPunchRequestSide({ missedPunch: false, status: "present", hasIn: true, hasOut: true })).toBeNull();
    expect(punchCorrectionRequestSide({ missedPunch: false, status: "weekly_off", hasIn: false, hasOut: false })).toBeNull();
  });

  it("sends a manager's correction to their line manager, not the CEO", () => {
    const supervisor = "supervisor-user";
    const supervisorStaff = "supervisor-staff";
    const lineManager = "line-manager-user";
    const teamMember = "team-member";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([
        [teamMember, supervisor],
        [supervisorStaff, lineManager],
      ]),
      headOfOperationsUserIds: [RAJAN],
    });
    const request = row({
      staffId: teamMember,
      requestedBy: supervisor,
      requesterStaffId: supervisorStaff,
    });
    expect(
      requesterLineManagerUserIds(dir, {
        locationId: INF,
        staffId: teamMember,
        requestedBy: supervisor,
        requesterStaffId: supervisorStaff,
      }),
    ).toEqual([lineManager]);
    expect(canUserActOnCorrection(dir, lineManager, request)).toBe(true);
    expect(canUserActOnCorrection(dir, supervisor, request)).toBe(false);
    expect(canUserActOnCorrection(dir, RAJAN, request)).toBe(false);
    expect(canUserActOnCorrection(dir, "ceo-user", request)).toBe(false);

    const ownPunch = row({
      staffId: supervisorStaff,
      requestedBy: supervisor,
      requesterStaffId: supervisorStaff,
    });
    expect(canUserActOnCorrection(dir, lineManager, ownPunch)).toBe(true);
    expect(canUserActOnCorrection(dir, supervisor, ownPunch)).toBe(false);
    expect(canUserActOnCorrection(dir, RAJAN, ownPunch)).toBe(false);
  });

  it("keeps the employee home to corrections this person must approve", () => {
    expect(
      employeeHomeCorrectionRows([
        { id: "ashfaq-approved", canAct: false },
        { id: "waiting-on-me", canAct: true },
      ]).map((row) => row.id),
    ).toEqual(["waiting-on-me"]);
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

  it("sends a manager's own correction to their line manager and does not auto-approve it", () => {
    const managerUser = "manager-user";
    const managerStaff = "manager-staff";
    const lineManager = "line-manager-user";
    const crew = "crew-staff";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([
        [managerStaff, lineManager],
        [crew, managerUser],
      ]),
    });
    const route = punchCorrectionRoute({
      requesterStaffId: managerStaff,
      targetStaffId: managerStaff,
      teamStaffIds: [crew],
    });
    expect(route).toBe("line_manager");
    expect(correctionWaitingStep("line_manager")).toBe("manager");
    expect(correctionStepSeed("line_manager").map((step) => step.status)).toEqual(["pending", "pending", "pending"]);
    const ownRequest = row({
      staffId: managerStaff,
      requestedBy: managerUser,
      requesterStaffId: managerStaff,
      currentStepRole: "manager",
    });
    expect(canUserActOnCorrection(dir, lineManager, ownRequest)).toBe(true);
    expect(canUserActOnCorrection(dir, managerUser, ownRequest)).toBe(false);
    expect(canUserActOnCorrection(dir, HR, ownRequest)).toBe(false);
    expect(canUserActOnCorrection(dir, RAJAN, ownRequest)).toBe(false);
  });

  it("sends a supervisor or other staff member's own correction to their manager", () => {
    const supervisorUser = "supervisor-user";
    const supervisorStaff = "supervisor-staff";
    const theirManager = "their-manager";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([[supervisorStaff, theirManager]]),
    });
    expect(
      punchCorrectionRoute({
        requesterStaffId: supervisorStaff,
        targetStaffId: supervisorStaff,
        teamStaffIds: ["crew-staff"],
      }),
    ).toBe("line_manager");
    expect(
      punchCorrectionRoute({
        requesterStaffId: "crew-staff",
        targetStaffId: "crew-staff",
        teamStaffIds: [],
      }),
    ).toBe("line_manager");
    expect(correctionStepSeed("line_manager").every((step) => step.status === "pending")).toBe(true);
    expect(
      ownCorrectionRouteAfterLineManagerCheck(dir, {
        locationId: INF,
        staffId: supervisorStaff,
        requestedBy: supervisorUser,
        requesterStaffId: supervisorStaff,
      }),
    ).toBe("line_manager");
    const request = row({
      staffId: supervisorStaff,
      requestedBy: supervisorUser,
      requesterStaffId: supervisorStaff,
      currentStepRole: correctionWaitingStep("line_manager"),
    });
    expect(canUserActOnCorrection(dir, theirManager, request)).toBe(true);
    expect(canUserActOnCorrection(dir, supervisorUser, request)).toBe(false);
    expect(canUserActOnCorrection(dir, HR, request)).toBe(false);
  });

  it("sends Mary’s own correction straight to Head of Operations when she reports to HoO", () => {
    const maryStaff = "mary-staff";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([[maryStaff, RAJAN]]),
      headOfOperationsUserIds: [RAJAN],
    });
    expect(
      punchCorrectionRoute({
        requesterStaffId: maryStaff,
        targetStaffId: maryStaff,
        teamStaffIds: [STAFF],
      }),
    ).toBe("line_manager");
    expect(
      ownCorrectionRouteAfterLineManagerCheck(dir, {
        locationId: INF,
        staffId: maryStaff,
        requestedBy: MARY,
        requesterStaffId: maryStaff,
      }),
    ).toBe("ops_first");
    expect(correctionWaitingStep("ops_first")).toBe("ops");
    expect(correctionStepSeed("ops_first")).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "skipped" },
      { stepOrder: 2, stepRole: "ops", status: "pending" },
      { stepOrder: 3, stepRole: "hr", status: "pending" },
    ]);
    const request = row({
      staffId: maryStaff,
      requestedBy: MARY,
      requesterStaffId: maryStaff,
      currentStepRole: correctionWaitingStep("ops_first"),
    });
    expect(canUserActOnCorrection(dir, RAJAN, request)).toBe(true);
    expect(canUserActOnCorrection(dir, MARY, request)).toBe(false);
    expect(canUserActOnCorrection(dir, HR, request)).toBe(false);
    expect(
      shouldHealOwnCorrectionToOpsFirst(
        dir,
        row({
          staffId: maryStaff,
          requestedBy: MARY,
          requesterStaffId: maryStaff,
          currentStepRole: "manager",
        }),
      ),
    ).toBe(true);
    expect(
      shouldHealOwnCorrectionToOpsFirst(
        dir,
        row({
          staffId: STAFF,
          requestedBy: "employee-1",
          requesterStaffId: STAFF,
          currentStepRole: "manager",
        }),
      ),
    ).toBe(false);
  });

  it("keeps crew under a site supervisor on the manager → HoO → HR ladder", () => {
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([[STAFF, MARY]]),
      headOfOperationsUserIds: [RAJAN],
    });
    expect(
      ownCorrectionRouteAfterLineManagerCheck(dir, {
        locationId: INF,
        staffId: STAFF,
        requestedBy: "employee-1",
        requesterStaffId: STAFF,
      }),
    ).toBe("line_manager");
    const request = row({
      staffId: STAFF,
      requestedBy: "employee-1",
      requesterStaffId: STAFF,
      currentStepRole: "manager",
    });
    expect(canUserActOnCorrection(dir, MARY, request)).toBe(true);
    expect(canUserActOnCorrection(dir, RAJAN, request)).toBe(false);
  });

  it("sends an F&B peer who reports to the F&B Manager straight to the F&B ops seat", () => {
    const peerStaff = "fnb-supervisor-staff";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([[peerStaff, RUBEN]]),
      fnbStaffIds: new Set([peerStaff]),
      fnbManagerUserIds: [RUBEN],
      headOfOperationsUserIds: [RAJAN],
    });
    expect(
      ownCorrectionRouteAfterLineManagerCheck(dir, {
        locationId: INF,
        staffId: peerStaff,
        requestedBy: "fnb-peer-user",
        requesterStaffId: peerStaff,
      }),
    ).toBe("ops_first");
    const request = row({
      staffId: peerStaff,
      requestedBy: "fnb-peer-user",
      requesterStaffId: peerStaff,
      currentStepRole: "ops",
    });
    expect(canUserActOnCorrection(dir, RUBEN, request)).toBe(true);
    expect(canUserActOnCorrection(dir, RAJAN, request)).toBe(false);
  });

  it("advances an F&B Manager team correction past ops to HR", () => {
    const dir = directory({
      fnbStaffIds: new Set([BARISTA]),
      fnbManagerUserIds: [RUBEN],
      headOfOperationsUserIds: [RAJAN],
    });
    expect(teamCorrectionRouteAfterOpsCheck(dir, BARISTA, RUBEN)).toBe("hr");
    expect(teamCorrectionRouteAfterOpsCheck(dir, BARISTA, RAJAN)).toBe("ops");
    expect(teamCorrectionRouteAfterOpsCheck(dir, STAFF, RAJAN)).toBe("hr");
    expect(correctionStepSeed("hr")).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "approved" },
      { stepOrder: 2, stepRole: "ops", status: "approved" },
      { stepOrder: 3, stepRole: "hr", status: "pending" },
    ]);
    expect(correctionWaitingStep("hr")).toBe("hr");
  });

  it("auto-approves a manager correction for their team and sends it to Head of Operations, then HR", () => {
    const managerUser = "manager-user";
    const managerStaff = "manager-staff";
    const lineManager = "line-manager-user";
    const crew = "crew-staff";
    const through = "under-crew";
    const outsider = "other-company";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([
        [managerStaff, lineManager],
        [crew, managerUser],
        [through, crew],
      ]),
    });
    const team = [crew, through];
    expect(
      punchCorrectionRoute({
        requesterStaffId: managerStaff,
        targetStaffId: crew,
        teamStaffIds: team,
      }),
    ).toBe("ops");
    expect(
      punchCorrectionRoute({
        requesterStaffId: managerStaff,
        targetStaffId: through,
        teamStaffIds: team,
      }),
    ).toBe("ops");
    expect(
      punchCorrectionRoute({
        requesterStaffId: managerStaff,
        targetStaffId: outsider,
        teamStaffIds: team,
      }),
    ).toBeNull();
    expect(correctionWaitingStep("ops")).toBe("ops");
    expect(correctionStepSeed("ops")).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "approved" },
      { stepOrder: 2, stepRole: "ops", status: "pending" },
      { stepOrder: 3, stepRole: "hr", status: "pending" },
    ]);
    const note = managerTeamCorrectionNote({
      managerName: "Ruben Yaralyan",
      requestedPunchIn: "09:05",
      requestedPunchOut: "18:10",
      previousPunchIn: "2026-10-08T08:00:00+03:00",
      previousPunchOut: "2026-10-08T17:30:00+03:00",
    });
    expect(note).toBe(
      "Ruben Yaralyan requested and approved this correction. Requested punch-in 09:05, punch-out 18:10. Previous punch-in 08:00, previous punch-out 17:30.",
    );
    expect(
      managerTeamCorrectionNote({
        managerName: "Ruben Yaralyan",
        requestedPunchIn: "09:05",
        requestedPunchOut: null,
        previousPunchIn: null,
        previousPunchOut: null,
      }),
    ).toContain("Requested punch-in 09:05, punch-out not on this request. Previous punch-in none, previous punch-out none.");
    const waitingOnOps = row({
      staffId: crew,
      requestedBy: managerUser,
      requesterStaffId: managerStaff,
      currentStepRole: "ops",
    });
    expect(canUserActOnCorrection(dir, RAJAN, waitingOnOps)).toBe(true);
    expect(canUserActOnCorrection(dir, HR, waitingOnOps)).toBe(false);
    expect(canUserActOnCorrection(dir, lineManager, waitingOnOps)).toBe(false);
    expect(canUserActOnCorrection(dir, managerUser, waitingOnOps)).toBe(false);
    const waitingOnHr = row({
      staffId: crew,
      requestedBy: managerUser,
      requesterStaffId: managerStaff,
      currentStepRole: "hr",
    });
    expect(canUserActOnCorrection(dir, HR, waitingOnHr)).toBe(true);
    expect(canUserActOnCorrection(dir, RAJAN, waitingOnHr)).toBe(false);
  });
});

describe("site attendance approvers", () => {
  it("lets a duty manager and tech supervisor approve the manager step at their sites", () => {
    const duty = "duty-user";
    const supervisor = "tech-user";
    const map = siteApproverLocationMap([
      { userId: duty, role: "duty_manager", locationIds: [INF] },
      { userId: supervisor, role: "tech_supervisor", locationIds: [INF, ""] },
      { userId: "cashier-user", role: "cashier_host", locationIds: [INF] },
      { userId: "hr-user", role: "hr", locationIds: [INF] },
    ]);
    expect(map.get(INF)).toEqual([duty, supervisor]);
    expect(map.has("")).toBe(false);
    const dir = directory({ branchGmUserIdsByLocationId: map, siteSupervisorUserIdsByLocationId: new Map() });
    expect(canUserActOnCorrection(dir, duty, row())).toBe(true);
    expect(canUserActOnCorrection(dir, supervisor, row())).toBe(true);
    expect(canUserActOnCorrection(dir, duty, row({ locationId: KDS }))).toBe(false);
    expect(canUserActOnCorrection(dir, duty, row({ requestedBy: duty }))).toBe(false);
  });
});
