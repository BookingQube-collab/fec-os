import { describe, expect, it } from "vitest";

import {
  canRequestAttendanceCorrection,
  type ApprovalDirectory,
  type CorrectionApprovalView,
} from "@/lib/attendance-hr/missed-punch-approval";
import {
  canApproveCorrectionOnMyDay,
  canApproveLeaveOnMyDay,
  mayReviewStaffCorrectionsOnMyDay,
  mayReviewStaffLeaveOnMyDay,
} from "@/lib/hr/my-day-approvals";

const SITE = "site-1";
const STAFF = "staff-1";
const LINE = "line-manager";
const GM = "gm-user";
const HOO = "head-of-operations";
const CEO = "ceo-user";
const CASHIER = "cashier-user";
const HR = "hr-user";

function directory(partial?: Partial<ApprovalDirectory>): ApprovalDirectory {
  return {
    reportingManagerUserIdByStaffId: new Map([[STAFF, LINE]]),
    siteSupervisorManagerUserIdByStaffId: new Map(),
    branchGmUserIdsByLocationId: new Map([[SITE, [GM]]]),
    siteSupervisorUserIdsByLocationId: new Map(),
    headOfOperationsUserIds: [HOO],
    fnbManagerUserIds: [],
    fnbStaffIds: new Set(),
    opsManagerUserIdsByLocationId: new Map(),
    hrUserIds: [HR],
    ...partial,
  };
}

function correction(partial?: Partial<CorrectionApprovalView>): CorrectionApprovalView {
  return {
    status: "pending",
    currentStepRole: "manager",
    locationId: SITE,
    staffId: STAFF,
    requestedBy: "employee-1",
    ...partial,
  };
}

describe("who may approve from My Day", () => {
  it("lets a manager approve staff leave and punches at the line-manager step, and still request their own", () => {
    expect(
      canApproveLeaveOnMyDay({
        roles: ["duty_manager"],
        stepRole: "manager",
        isOwnRequest: false,
        isLineManager: true,
      }),
    ).toBe(true);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["duty_manager"],
        stepRole: "hr",
        isOwnRequest: false,
        isLineManager: true,
      }),
    ).toBe(false);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "manager",
        isOwnRequest: false,
        isLineManager: true,
      }),
    ).toBe(true);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["duty_manager"],
        stepRole: "manager",
        isOwnRequest: true,
        isLineManager: true,
      }),
    ).toBe(false);
    expect(canApproveCorrectionOnMyDay(directory(), LINE, correction())).toBe(true);
    expect(canApproveCorrectionOnMyDay(directory(), LINE, correction({ requestedBy: LINE }))).toBe(false);
    expect(canRequestAttendanceCorrection({ roles: ["duty_manager"], hasDirectReports: false })).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["cashier_host"], hasDirectReports: false })).toBe(true);
  });

  it("lets a GM approve leave through the steps their role already holds, and site punches only at the line-manager step", () => {
    for (const step of ["manager", "ops", "hr"] as const) {
      expect(
        canApproveLeaveOnMyDay({
          roles: ["branch_gm"],
          stepRole: step,
          isOwnRequest: false,
          isLineManager: false,
        }),
      ).toBe(true);
    }
    expect(canApproveCorrectionOnMyDay(directory(), GM, correction())).toBe(false);
    expect(
      canApproveCorrectionOnMyDay(
        directory({ reportingManagerUserIdByStaffId: new Map() }),
        GM,
        correction(),
      ),
    ).toBe(true);
    expect(
      canApproveCorrectionOnMyDay(
        directory({ reportingManagerUserIdByStaffId: new Map() }),
        GM,
        correction({ currentStepRole: "ops" }),
      ),
    ).toBe(false);
    expect(canRequestAttendanceCorrection({ roles: ["branch_gm"], hasDirectReports: false })).toBe(true);
  });

  it("lets the CEO approve leave waiting on them and a punch only when they are the approver for that step", () => {
    for (const step of ["manager", "ops", "hr"] as const) {
      expect(
        canApproveLeaveOnMyDay({
          roles: ["ceo"],
          stepRole: step,
          isOwnRequest: false,
          isLineManager: false,
        }),
      ).toBe(true);
    }
    expect(
      canApproveLeaveOnMyDay({
        roles: ["ceo"],
        stepRole: "ops",
        isOwnRequest: true,
        isLineManager: false,
      }),
    ).toBe(false);
    expect(canApproveCorrectionOnMyDay(directory(), CEO, correction())).toBe(false);
    expect(canApproveCorrectionOnMyDay(directory(), CEO, correction({ currentStepRole: "ops" }))).toBe(false);
    expect(
      canApproveCorrectionOnMyDay(
        directory({ reportingManagerUserIdByStaffId: new Map([[STAFF, CEO]]) }),
        CEO,
        correction(),
      ),
    ).toBe(true);
    expect(canRequestAttendanceCorrection({ roles: ["ceo"], hasDirectReports: false })).toBe(true);
    expect(mayReviewStaffLeaveOnMyDay({ roles: ["ceo"], hasDirectReports: false })).toBe(true);
    expect(mayReviewStaffCorrectionsOnMyDay({ roles: ["ceo"], hasDirectReports: false })).toBe(true);
  });

  it("lets Head of Operations approve the ops step for leave and punches", () => {
    expect(
      canApproveLeaveOnMyDay({
        roles: ["regional_ops"],
        stepRole: "ops",
        isOwnRequest: false,
        isLineManager: false,
      }),
    ).toBe(true);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "ops",
        isOwnRequest: false,
        isLineManager: false,
        jobTitle: "Head of Operations - HO — Head Office",
        opsLane: "head_of_operations",
      }),
    ).toBe(true);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "hr",
        isOwnRequest: false,
        isLineManager: false,
        jobTitle: "Head of Operations - HO — Head Office",
      }),
    ).toBe(false);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "manager",
        isOwnRequest: false,
        isLineManager: false,
        jobTitle: "Head of Operations - HO — Head Office",
      }),
    ).toBe(false);
    expect(canApproveCorrectionOnMyDay(directory(), HOO, correction({ currentStepRole: "ops" }))).toBe(true);
    expect(canApproveCorrectionOnMyDay(directory(), HOO, correction())).toBe(false);
    expect(canApproveCorrectionOnMyDay(directory(), HOO, correction({ currentStepRole: "hr" }))).toBe(false);
    expect(
      canRequestAttendanceCorrection({
        roles: [],
        hasDirectReports: false,
        jobTitle: "Head of Operations",
      }),
    ).toBe(true);
    expect(
      mayReviewStaffLeaveOnMyDay({
        roles: [],
        hasDirectReports: false,
        jobTitle: "Head of Operations",
      }),
    ).toBe(true);
    expect(
      mayReviewStaffCorrectionsOnMyDay({
        roles: [],
        hasDirectReports: false,
        jobTitle: "Head of Operations",
      }),
    ).toBe(true);
  });

  it("lets F&B Manager approve the ops step for F&B leave only, not Operations", () => {
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "ops",
        isOwnRequest: false,
        isLineManager: false,
        jobTitle: "F&B Manager",
        department: "F&B",
        opsLane: "fnb_manager",
      }),
    ).toBe(true);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "ops",
        isOwnRequest: false,
        isLineManager: false,
        jobTitle: "F&B Manager",
        department: "F&B",
        opsLane: "head_of_operations",
      }),
    ).toBe(false);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "ops",
        isOwnRequest: false,
        isLineManager: false,
        jobTitle: "Head of Operations",
        opsLane: "fnb_manager",
      }),
    ).toBe(false);
    expect(
      mayReviewStaffLeaveOnMyDay({
        roles: ["cashier_host"],
        hasDirectReports: false,
        jobTitle: "F&B Manager",
        department: "F&B",
      }),
    ).toBe(true);
    expect(
      mayReviewStaffCorrectionsOnMyDay({
        roles: ["cashier_host"],
        hasDirectReports: false,
        jobTitle: "F&B Manager",
      }),
    ).toBe(true);
  });

  it("does not let a duty manager approve the ops step by manager capability alone", () => {
    expect(
      canApproveLeaveOnMyDay({
        roles: ["duty_manager"],
        stepRole: "ops",
        isOwnRequest: false,
        isLineManager: true,
      }),
    ).toBe(false);
  });

  it("does not let a cashier or unrelated employee approve other people", () => {
    expect(mayReviewStaffLeaveOnMyDay({ roles: ["cashier_host"], hasDirectReports: false })).toBe(false);
    expect(mayReviewStaffCorrectionsOnMyDay({ roles: ["cashier_host"], hasDirectReports: false })).toBe(false);
    expect(mayReviewStaffLeaveOnMyDay({ roles: ["customer_service"], hasDirectReports: false })).toBe(false);
    expect(mayReviewStaffCorrectionsOnMyDay({ roles: ["technician"], hasDirectReports: false })).toBe(false);
    expect(
      canApproveLeaveOnMyDay({
        roles: ["cashier_host"],
        stepRole: "manager",
        isOwnRequest: false,
        isLineManager: false,
      }),
    ).toBe(false);
    expect(canApproveCorrectionOnMyDay(directory(), CASHIER, correction())).toBe(false);
    expect(canApproveCorrectionOnMyDay(directory(), CASHIER, correction({ currentStepRole: "ops" }))).toBe(false);
    expect(mayReviewStaffLeaveOnMyDay({ roles: ["duty_manager"], hasDirectReports: false })).toBe(true);
    expect(mayReviewStaffCorrectionsOnMyDay({ roles: ["branch_gm"], hasDirectReports: false })).toBe(true);
  });
});
