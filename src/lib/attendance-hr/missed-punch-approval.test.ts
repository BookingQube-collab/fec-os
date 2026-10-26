import { describe, expect, it } from "vitest";

import {
  approverUserIdsForStep,
  canUserActOnCorrection,
  applyAcceptedCorrectionTimes,
  buildMissedPunchNewValue,
  correctionCardClocks,
  correctionIdsForReview,
  correctionPunchAccepted,
  groupOpenLegacyPunchPairs,
  previousPunchesFromOriginalValue,
  punchesFromCorrectionValue,
  shouldApplyCorrectionPunchOnApprove,
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
  teamCorrectionRoute,
  teamCorrectionRouteAfterOpsCheck,
  lineManagerUserIds,
  siteApproverLocationMap,
  managerTeamCorrectionNote,
  supervisorTeamSubmittedNote,
  ownCorrectionRouteAfterLineManagerCheck,
  punchCorrectionRoute,
  missedPunchApprovalSteps,
  missedPunchRequestSide,
  nearestSiteSupervisorUserId,
  nextMissedPunchStep,
  punchCorrectionRequestSide,
  pickBestPunchCorrectionSummary,
  requesterLineManagerUserIds,
  canSiteSupervisorActOnTeamCorrection,
  isMissedPunchTeamSubmittedNote,
  isMissedPunchTeamAutoApprovedNote,
  isMissedPunchSupervisorSubmitOnlyNote,
  missedPunchTeamSubmitterName,
  missedPunchPrintSignatureDone,
  ME_CORRECTION_HREF,
  ME_PUNCH_APPROVALS_HREF,
  NOTIFICATIONS_INBOX_HREF,
  PEOPLE_CORRECTIONS_HREF,
  punchApprovalInboxActionUrl,
  shouldHealOwnCorrectionToOpsFirst,
  shouldHealTeamCorrectionToManagerSeat,
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
    siteSupervisorManagerUserIdByStaffId: new Map(),
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
    generalManagerUserIds: ["gm-login"],
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

describe("punchApprovalInboxActionUrl", () => {
  it("sends every role to My Day Approve", () => {
    expect(punchApprovalInboxActionUrl({ roles: ["regional_ops"] })).toBe(ME_PUNCH_APPROVALS_HREF);
    expect(punchApprovalInboxActionUrl({ roles: ["ceo"] })).toBe(ME_PUNCH_APPROVALS_HREF);
  });

  it("rewrites All-notifications / Correction-tab / People-desk notifies to My Day Approve", () => {
    expect(
      punchApprovalInboxActionUrl({
        roles: ["regional_ops"],
        storedUrl: NOTIFICATIONS_INBOX_HREF,
        sourceType: "attendance_corrections",
      }),
    ).toBe(ME_PUNCH_APPROVALS_HREF);
    expect(
      punchApprovalInboxActionUrl({
        roles: ["regional_ops"],
        storedUrl: ME_CORRECTION_HREF,
        sourceType: "attendance_corrections",
      }),
    ).toBe(ME_PUNCH_APPROVALS_HREF);
    expect(
      punchApprovalInboxActionUrl({
        roles: ["regional_ops"],
        storedUrl: PEOPLE_CORRECTIONS_HREF,
        sourceType: "attendance_corrections",
      }),
    ).toBe(ME_PUNCH_APPROVALS_HREF);
    expect(
      punchApprovalInboxActionUrl({
        roles: ["ceo"],
        storedUrl: PEOPLE_CORRECTIONS_HREF,
        sourceType: "attendance_corrections",
      }),
    ).toBe(ME_PUNCH_APPROVALS_HREF);
  });

  it("rewrites legacy People-desk outcome hrefs and keeps other My Day targets", () => {
    expect(
      punchApprovalInboxActionUrl({
        roles: ["cashier_host"],
        storedUrl: PEOPLE_CORRECTIONS_HREF,
        sourceType: "attendance_hr",
      }),
    ).toBe(ME_PUNCH_APPROVALS_HREF);
    expect(
      punchApprovalInboxActionUrl({
        roles: ["cashier_host"],
        storedUrl: "/hr/me",
        sourceType: "attendance_corrections",
      }),
    ).toBe("/hr/me");
  });
});

describe("missed punch approval chain", () => {
  it("uses supervisor → ops → hr → gm (OT-aligned ladder)", () => {
    expect(missedPunchApprovalSteps().map((step) => step.stepRole)).toEqual([
      "manager",
      "ops",
      "hr",
      "gm",
    ]);
    expect(nextMissedPunchStep("manager")).toBe("ops");
    expect(nextMissedPunchStep("ops")).toBe("hr");
    expect(nextMissedPunchStep("hr")).toBe("gm");
    expect(nextMissedPunchStep("gm")).toBeNull();
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

  it("picks the missed-punch site when a seconded staff has several summary rows that day", () => {
    const presentOtherSite = {
      id: "present-row",
      work_date: "2026-10-20",
      status: "present",
      missed_punch: false,
      actual_in: "2026-10-20T09:00:00+03:00",
      actual_out: "2026-10-20T18:00:00+03:00",
    };
    const missedHome = {
      id: "missed-row",
      work_date: "2026-10-20",
      status: "missed_punch",
      missed_punch: true,
      actual_in: null,
      actual_out: null,
    };
    expect(pickBestPunchCorrectionSummary([presentOtherSite, missedHome])?.id).toBe("missed-row");
    expect(pickBestPunchCorrectionSummary([missedHome, presentOtherSite])?.id).toBe("missed-row");
    expect(pickBestPunchCorrectionSummary([])).toBeNull();
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

  it("decides open legacy same-day in/out pairs together", () => {
    const lines = [
      {
        id: "punch-in",
        staffId: ASHFAQ,
        workDate: "2026-09-24",
        status: "pending",
        currentStepRole: "ops" as const,
        punchType: "in" as const,
      },
      {
        id: "punch-out",
        staffId: ASHFAQ,
        workDate: "2026-09-24",
        status: "pending",
        currentStepRole: "ops" as const,
        punchType: "out" as const,
      },
    ];
    expect(correctionIdsForReview(lines, "punch-out")).toEqual(["punch-out", "punch-in"]);
    expect(correctionIdsForReview(lines, "punch-in")).toEqual(["punch-in", "punch-out"]);
    expect(correctionIdsForReview(lines, "missing")).toEqual([]);
  });

  it("groups Noah-like open dual MPs into one approve card", () => {
    const cards = groupOpenLegacyPunchPairs([
      {
        id: "mp-0006",
        staffId: ASHFAQ,
        workDate: "2026-09-29",
        status: "pending",
        currentStepRole: "ops" as const,
        punchType: "in" as const,
        punchAt: "2026-09-29T12:12:00+03:00",
        requestNumber: "MP-20261022-0006",
        requestedAt: "2026-10-22T10:00:00Z",
      },
      {
        id: "mp-0007",
        staffId: ASHFAQ,
        workDate: "2026-09-29",
        status: "pending",
        currentStepRole: "ops" as const,
        punchType: "out" as const,
        punchAt: "2026-09-29T22:00:00+03:00",
        requestNumber: "MP-20261022-0007",
        requestedAt: "2026-10-22T10:00:01Z",
      },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.punchType).toBe("both");
    expect(cards[0]?.punchInAt).toBe("2026-09-29T12:12:00+03:00");
    expect(cards[0]?.punchOutAt).toBe("2026-09-29T22:00:00+03:00");
    expect(cards[0]?.reviewIds).toEqual(["mp-0006", "mp-0007"]);
    expect(cards[0]?.requestNumbers).toEqual(["MP-20261022-0006", "MP-20261022-0007"]);
  });

  it("applies punches only when ops accepts or the chain ends", () => {
    expect(shouldApplyCorrectionPunchOnApprove({ currentStep: "manager", nextStep: "ops" })).toBe(false);
    expect(shouldApplyCorrectionPunchOnApprove({ currentStep: "ops", nextStep: "hr" })).toBe(true);
    expect(shouldApplyCorrectionPunchOnApprove({ currentStep: "hr", nextStep: null })).toBe(true);
  });

  it("applies both clocks from one combined request once ops has accepted it (waiting on HR)", () => {
    const day = {
      staff_id: ASHFAQ,
      work_date: "2026-09-24",
      actual_in: null as string | null,
      actual_out: null as string | null,
    };
    const [next] = applyAcceptedCorrectionTimes(
      [day],
      [
        {
          id: "combined",
          staffId: ASHFAQ,
          workDate: "2026-09-24",
          status: "pending",
          currentStepRole: "hr",
          punchType: "both",
          punchAt: "2026-09-24T12:00:00+03:00",
          punchInAt: "2026-09-24T12:00:00+03:00",
          punchOutAt: "2026-09-24T09:00:00+03:00",
          requestedAt: "2026-09-24T18:00:00Z",
        },
      ],
    );
    expect(next?.actual_in).toBe("2026-09-24T12:00:00+03:00");
    expect(next?.actual_out).toBe("2026-09-24T09:00:00+03:00");
  });

  it("does not overlay punches while still waiting for Head of Operations", () => {
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
    expect(next?.actual_out).toBeNull();
    expect(correctionPunchAccepted({ status: "pending", currentStepRole: "manager" })).toBe(false);
    expect(correctionPunchAccepted({ status: "pending", currentStepRole: "ops" })).toBe(false);
    expect(correctionPunchAccepted({ status: "pending", currentStepRole: "hr" })).toBe(true);
    expect(correctionPunchAccepted({ status: "pending", currentStepRole: "gm" })).toBe(true);
    expect(correctionPunchAccepted({ status: "change_required", currentStepRole: null })).toBe(false);
    expect(correctionPunchAccepted({ status: "rejected", currentStepRole: null })).toBe(false);
  });

  it("stores punch-in and punch-out on one create payload", () => {
    const value = buildMissedPunchNewValue({
      workDate: "2026-09-29",
      punchInTime: "12:12",
      punchOutTime: "22:00",
    });
    expect(value.punch_type).toBe("both");
    expect(value.punch_in_at).toBe("2026-09-29T12:12:00+03:00");
    expect(value.punch_out_at).toBe("2026-09-29T22:00:00+03:00");
    expect(punchesFromCorrectionValue(value).punchType).toBe("both");
  });

  it("shows both clocks on a combined correction card and one side on legacy cards", () => {
    expect(correctionCardClocks("in", "2026-09-24T22:59:31+03:00")).toEqual({
      punchIn: "2026-09-24T22:59:31+03:00",
      punchOut: null,
    });
    expect(correctionCardClocks("out", "2026-09-24T23:40:00+03:00")).toEqual({
      punchIn: null,
      punchOut: "2026-09-24T23:40:00+03:00",
    });
    expect(
      correctionCardClocks("both", "2026-09-24T12:00:00+03:00", {
        punchInAt: "2026-09-24T12:00:00+03:00",
        punchOutAt: "2026-09-24T09:00:00+03:00",
      }),
    ).toEqual({
      punchIn: "2026-09-24T12:00:00+03:00",
      punchOut: "2026-09-24T09:00:00+03:00",
    });
    expect(
      correctionCardClocks("out", "2026-10-07T20:00:00+03:00", {
        punchOutAt: "2026-10-07T20:00:00+03:00",
        previousPunchIn: "2026-10-07T09:05:00+03:00",
      }),
    ).toEqual({
      punchIn: "2026-10-07T09:05:00+03:00",
      punchOut: "2026-10-07T20:00:00+03:00",
    });
    expect(
      correctionCardClocks("in", "2026-10-07T09:15:00+03:00", {
        punchInAt: "2026-10-07T09:15:00+03:00",
        previousPunchOut: "2026-10-07T18:00:00+03:00",
      }),
    ).toEqual({
      punchIn: "2026-10-07T09:15:00+03:00",
      punchOut: "2026-10-07T18:00:00+03:00",
    });
    expect(
      previousPunchesFromOriginalValue({
        actual_in: "2026-10-07T09:05:00+03:00",
        actual_out: null,
      }),
    ).toEqual({
      previousPunchIn: "2026-10-07T09:05:00+03:00",
      previousPunchOut: null,
    });
    expect(punchAtFromCorrectionValue({ punch_at: "2026-09-24T22:59:31+03:00", punch_type: "in" })).toBe(
      "2026-09-24T22:59:31+03:00",
    );
    expect(
      punchesFromCorrectionValue({
        punch_in_at: "2026-09-28T12:00:00+03:00",
        punch_out_at: "2026-09-28T09:00:00+03:00",
        punch_type: "both",
      }),
    ).toEqual({
      punchInAt: "2026-09-28T12:00:00+03:00",
      punchOutAt: "2026-09-28T09:00:00+03:00",
      punchType: "both",
      punchAt: "2026-09-28T12:00:00+03:00",
    });
    expect(
      buildMissedPunchNewValue({
        workDate: "2026-09-28",
        punchInTime: "12:00",
        punchOutTime: "09:00",
      }),
    ).toMatchObject({
      punch_type: "both",
      punch_in_at: "2026-09-28T12:00:00+03:00",
      punch_out_at: "2026-09-28T09:00:00+03:00",
      requested_punch_in: "12:00",
      requested_punch_out: "09:00",
      missed_punch_request: true,
    });
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
    expect(correctionStepSeed("line_manager").map((step) => step.status)).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
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
      { stepOrder: 4, stepRole: "gm", status: "pending" },
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
      siteSupervisorManagerUserIdByStaffId: new Map([[STAFF, MARY]]),
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

  it("routes crew under a Team Lead to Ashfaq (Venue Supervisor) before HoO", () => {
    const crew = "crew-under-maluz";
    const maluzUser = "maluz-user";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([[crew, maluzUser]]),
      siteSupervisorManagerUserIdByStaffId: new Map([[crew, ASHFAQ]]),
      headOfOperationsUserIds: [RAJAN],
    });
    expect(
      requesterLineManagerUserIds(dir, {
        locationId: KDS,
        staffId: crew,
        requestedBy: "crew-user",
        requesterStaffId: crew,
      }),
    ).toEqual([ASHFAQ]);
    const request = row({
      staffId: crew,
      requestedBy: "crew-user",
      requesterStaffId: crew,
      locationId: KDS,
      currentStepRole: "manager",
    });
    expect(canUserActOnCorrection(dir, ASHFAQ, request)).toBe(true);
    expect(canUserActOnCorrection(dir, maluzUser, request)).toBe(false);
    expect(canUserActOnCorrection(dir, RAJAN, request)).toBe(false);
  });

  it("walks past Team Lead titles to the nearest Venue / Site supervisor", () => {
    expect(
      nearestSiteSupervisorUserId({
        staffId: "crew",
        reportingManagerStaffIdByStaffId: new Map([
          ["crew", "maluz"],
          ["maluz", "ashfaq"],
          ["ashfaq", "rajan"],
        ]),
        managerByStaffId: new Map([
          [
            "maluz",
            { userId: "maluz-user", jobTitle: "Team Leader", staffRole: "shift_lead" },
          ],
          [
            "ashfaq",
            { userId: ASHFAQ, jobTitle: "Venue Supervisor", staffRole: "venue_supervisor" },
          ],
          [
            "rajan",
            { userId: RAJAN, jobTitle: "Head of Operations", staffRole: "other" },
          ],
        ]),
      }),
    ).toBe(ASHFAQ);
  });

  it("lets a Venue Supervisor act on manager-step corrections for their OT team when chart walk is empty", () => {
    const crew = "venue-crew";
    const request = row({
      staffId: crew,
      requestedBy: "crew-user",
      requesterStaffId: crew,
      locationId: KDS,
      currentStepRole: "manager",
    });
    expect(
      canSiteSupervisorActOnTeamCorrection({
        userId: ASHFAQ,
        teamStaffIds: [crew, "other"],
        row: request,
      }),
    ).toBe(true);
    expect(
      canSiteSupervisorActOnTeamCorrection({
        userId: ASHFAQ,
        teamStaffIds: ["someone-else"],
        row: request,
      }),
    ).toBe(false);
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
    expect(teamCorrectionRoute(dir, BARISTA, RUBEN)).toBe("hr");
    expect(teamCorrectionRouteAfterOpsCheck(dir, BARISTA, RUBEN)).toBe("hr");
    // HoO is not on the F&B ops seat — without a site-supervisor title they wait on manager.
    expect(teamCorrectionRoute(dir, BARISTA, RAJAN)).toBe("line_manager");
    expect(teamCorrectionRoute(dir, STAFF, RAJAN)).toBe("hr");
    expect(correctionStepSeed("hr")).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "approved" },
      { stepOrder: 2, stepRole: "ops", status: "approved" },
      { stepOrder: 3, stepRole: "hr", status: "pending" },
      { stepOrder: 4, stepRole: "gm", status: "pending" },
    ]);
    expect(correctionWaitingStep("hr")).toBe("hr");
  });

  it("keeps a regular supervisor team submit on Sr. Site Supervisor (does not skip Mary)", () => {
    const waqarUser = "waqar-user";
    const waqarStaff = "waqar-staff";
    const sarah = "sarah-staff";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([
        [waqarStaff, MARY],
        [sarah, waqarUser],
      ]),
      siteSupervisorManagerUserIdByStaffId: new Map([
        [waqarStaff, MARY],
        [sarah, MARY],
      ]),
      headOfOperationsUserIds: [RAJAN],
    });
    expect(
      punchCorrectionRoute({
        requesterStaffId: waqarStaff,
        targetStaffId: sarah,
        teamStaffIds: [sarah],
      }),
    ).toBe("ops");
    expect(
      teamCorrectionRoute(dir, sarah, waqarUser, {
        jobTitle: "Supervisor",
        staffRole: "other",
      }),
    ).toBe("line_manager");
    expect(correctionWaitingStep("line_manager")).toBe("manager");
    expect(correctionStepSeed("line_manager").map((step) => step.status)).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    const submitted = supervisorTeamSubmittedNote({
      supervisorName: "Waqar Asghar",
      requestedPunchIn: "12:00",
      requestedPunchOut: "21:00",
      previousPunchIn: "2026-09-28T09:00:00+03:00",
      previousPunchOut: null,
    });
    expect(submitted).toContain("Waqar Asghar submitted this correction.");
    expect(isMissedPunchSupervisorSubmitOnlyNote(submitted)).toBe(true);
    expect(isMissedPunchTeamAutoApprovedNote(submitted)).toBe(false);
    expect(missedPunchTeamSubmitterName(submitted)).toBe("Waqar Asghar");
    const waitingOnMary = row({
      staffId: sarah,
      requestedBy: waqarUser,
      requesterStaffId: waqarStaff,
      currentStepRole: "manager",
    });
    expect(canUserActOnCorrection(dir, MARY, waitingOnMary)).toBe(true);
    expect(canUserActOnCorrection(dir, RAJAN, waitingOnMary)).toBe(false);
    expect(canUserActOnCorrection(dir, waqarUser, waitingOnMary)).toBe(false);
    expect(
      shouldHealTeamCorrectionToManagerSeat({
        row: row({
          staffId: sarah,
          requestedBy: waqarUser,
          requesterStaffId: waqarStaff,
          currentStepRole: "ops",
        }),
        managerStep: { status: "approved", actedBy: waqarUser },
        requesterJobTitle: "Supervisor",
        requesterStaffRole: "other",
        directory: dir,
      }),
    ).toBe(true);
  });

  it("lets Sr. Site Supervisor team submit auto-approve the manager seat and wait on HoO", () => {
    const maryStaff = "mary-staff";
    const crew = "crew-staff";
    const dir = directory({
      reportingManagerUserIdByStaffId: new Map([
        [maryStaff, RAJAN],
        [crew, MARY],
      ]),
      siteSupervisorManagerUserIdByStaffId: new Map([[crew, MARY]]),
      headOfOperationsUserIds: [RAJAN],
    });
    expect(
      teamCorrectionRoute(dir, crew, MARY, {
        jobTitle: "Sr. Site Supervisor",
        staffRole: "venue_supervisor",
      }),
    ).toBe("ops");
    expect(correctionWaitingStep("ops")).toBe("ops");
    expect(correctionStepSeed("ops")).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "approved" },
      { stepOrder: 2, stepRole: "ops", status: "pending" },
      { stepOrder: 3, stepRole: "hr", status: "pending" },
      { stepOrder: 4, stepRole: "gm", status: "pending" },
    ]);
    const note = managerTeamCorrectionNote({
      managerName: "Mary Wangare Muiruri",
      requestedPunchIn: "09:05",
      requestedPunchOut: "18:10",
      previousPunchIn: "2026-10-08T08:00:00+03:00",
      previousPunchOut: "2026-10-08T17:30:00+03:00",
    });
    expect(note).toBe(
      "Mary Wangare Muiruri requested and approved this correction. Requested punch-in 09:05, punch-out 18:10. Previous punch-in 08:00, previous punch-out 17:30.",
    );
    expect(isMissedPunchTeamAutoApprovedNote(note)).toBe(true);
    expect(isMissedPunchSupervisorSubmitOnlyNote(note)).toBe(false);
    const waitingOnOps = row({
      staffId: crew,
      requestedBy: MARY,
      requesterStaffId: maryStaff,
      currentStepRole: "ops",
    });
    expect(canUserActOnCorrection(dir, RAJAN, waitingOnOps)).toBe(true);
    expect(canUserActOnCorrection(dir, MARY, waitingOnOps)).toBe(false);
    expect(
      shouldHealTeamCorrectionToManagerSeat({
        row: waitingOnOps,
        managerStep: { status: "approved", actedBy: MARY },
        requesterJobTitle: "Sr. Site Supervisor",
        requesterStaffRole: "venue_supervisor",
        directory: dir,
      }),
    ).toBe(false);
  });

  it("auto-approves a site-supervisor team correction and sends it to Head of Operations, then HR", () => {
    const managerUser = MARY;
    const managerStaff = "manager-staff";
    const lineManager = RAJAN;
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
    expect(
      teamCorrectionRoute(dir, crew, managerUser, {
        jobTitle: "Sr. Site Supervisor",
        staffRole: "venue_supervisor",
      }),
    ).toBe("ops");
    expect(correctionWaitingStep("ops")).toBe("ops");
    expect(correctionStepSeed("ops")).toEqual([
      { stepOrder: 1, stepRole: "manager", status: "approved" },
      { stepOrder: 2, stepRole: "ops", status: "pending" },
      { stepOrder: 3, stepRole: "hr", status: "pending" },
      { stepOrder: 4, stepRole: "gm", status: "pending" },
    ]);
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
    expect(canUserActOnCorrection(dir, lineManager, waitingOnOps)).toBe(true);
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

describe("missed punch print signatures", () => {
  it("fills print columns progressively; supervisor stamp is submit-only, site is manager seat", () => {
    const steps = [
      { stepRole: "manager", status: "approved" },
      { stepRole: "ops", status: "approved" },
      { stepRole: "hr", status: "pending" },
      { stepRole: "gm", status: "pending" },
    ];
    expect(
      missedPunchPrintSignatureDone("pending", steps, "supervisor", { supervisorSubmitOnly: true }),
    ).toBe(true);
    expect(
      missedPunchPrintSignatureDone("pending", steps, "supervisor", { supervisorSubmitOnly: false }),
    ).toBe(false);
    // Legacy: teamSubmitted without supervisorSubmitOnly still requires manager seat done.
    expect(missedPunchPrintSignatureDone("pending", steps, "supervisor", { teamSubmitted: true })).toBe(true);
    expect(missedPunchPrintSignatureDone("pending", steps, "supervisor", { teamSubmitted: false })).toBe(false);
    expect(missedPunchPrintSignatureDone("pending", steps, "site")).toBe(true);
    expect(missedPunchPrintSignatureDone("pending", steps, "hoo")).toBe(true);
    expect(missedPunchPrintSignatureDone("pending", steps, "hr")).toBe(false);
    expect(missedPunchPrintSignatureDone("pending", steps, "gm")).toBe(false);
    expect(isMissedPunchTeamSubmittedNote("Mary requested and approved this correction.")).toBe(true);
    expect(isMissedPunchTeamSubmittedNote("Waqar submitted this correction.")).toBe(true);
    const pendingManager = [
      { stepRole: "manager", status: "pending" },
      { stepRole: "ops", status: "pending" },
      { stepRole: "hr", status: "pending" },
      { stepRole: "gm", status: "pending" },
    ];
    expect(
      missedPunchPrintSignatureDone("pending", pendingManager, "supervisor", {
        supervisorSubmitOnly: true,
      }),
    ).toBe(true);
    expect(missedPunchPrintSignatureDone("pending", pendingManager, "site")).toBe(false);
  });

  it("treats legacy approved rows without a gm step as fully signed", () => {
    expect(
      missedPunchPrintSignatureDone(
        "approved",
        [
          { stepRole: "manager", status: "approved" },
          { stepRole: "ops", status: "approved" },
          { stepRole: "hr", status: "approved" },
        ],
        "gm",
      ),
    ).toBe(true);
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
