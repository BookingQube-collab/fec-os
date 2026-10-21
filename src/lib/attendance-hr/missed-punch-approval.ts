import {
  opsApprovalLaneForStaffId,
  opsStepApproverUserIds,
  type OpsApprovalLane,
} from "@/lib/approval-ops-routing";
import { defaultLeaveApprovalSteps, type HrLeaveApprovalRole } from "@/lib/hr-leave";

/** Same ladder as leave: line manager → ops (HoO or F&B Manager) → HR. */
export type MissedPunchStepRole = HrLeaveApprovalRole;
export type { OpsApprovalLane };

export type MissedPunchQueue = "waiting" | "mine";

export type CorrectionApprovalView = {
  status: string;
  currentStepRole: MissedPunchStepRole | null;
  locationId: string;
  staffId: string | null;
  requestedBy: string;
  /** Staff id of the person who submitted. Their line manager approves the first step. */
  requesterStaffId?: string | null;
};

export type ApprovalDirectory = {
  /** Set only when the reporting manager has a login. Empty means derive from the site. */
  reportingManagerUserIdByStaffId: ReadonlyMap<string, string>;
  /**
   * Nearest Venue / Site / Sr. Site supervisor up the reporting chain who has a login.
   * Manager-step first approval prefers this over a Team Lead / non-site direct manager
   * so Ashfaq (Venue Supervisor) sees Ma luz / Marissa / Wahaj crew requests first.
   */
  siteSupervisorManagerUserIdByStaffId: ReadonlyMap<string, string>;
  branchGmUserIdsByLocationId: ReadonlyMap<string, readonly string[]>;
  siteSupervisorUserIdsByLocationId: ReadonlyMap<string, readonly string[]>;
  headOfOperationsUserIds: readonly string[];
  /** Logins with an F&B Manager title. Ops step for F&B staff. */
  fnbManagerUserIds: readonly string[];
  /** Staff on the F&B lane; missing id means Operations (Head of Operations). */
  fnbStaffIds: ReadonlySet<string>;
  /**
   * Logins of the people site supervisors at a location report to.
   * Kept for hierarchy display; the ops step uses HoO or F&B Manager only.
   */
  opsManagerUserIdsByLocationId: ReadonlyMap<string, readonly string[]>;
  hrUserIds: readonly string[];
};

export function missedPunchApprovalSteps(): Array<{ stepOrder: number; stepRole: MissedPunchStepRole }> {
  return defaultLeaveApprovalSteps();
}

export function nextMissedPunchStep(current: MissedPunchStepRole): MissedPunchStepRole | null {
  const steps = missedPunchApprovalSteps();
  const index = steps.findIndex((step) => step.stepRole === current);
  if (index < 0) return null;
  return steps[index + 1]?.stepRole ?? null;
}

const SCHEDULED_OFF = new Set([
  "weekly_off",
  "public_holiday",
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
]);

/**
 * A correctable day offers both punch in and punch out.
 * An existing check-in does not hide punch-in — the employee may correct that time and add the missing punch-out.
 * Scheduled off days and days that already have both punches are not a request.
 */
export function missedPunchRequestSide(summary: {
  missedPunch: boolean;
  status: string;
  hasIn: boolean;
  hasOut: boolean;
}): "in" | "out" | "either" | null {
  if (summary.hasIn && summary.hasOut) return null;
  if (SCHEDULED_OFF.has(summary.status) && !summary.missedPunch) return null;
  const missing = !summary.hasIn || !summary.hasOut;
  const flagged =
    summary.missedPunch ||
    summary.status === "missed_punch" ||
    summary.status === "absent" ||
    summary.status === "incomplete";
  const oneSided = summary.hasIn !== summary.hasOut;
  if (!missing || (!flagged && !oneSided)) return null;
  return "either";
}

/**
 * A wrong punch-in or punch-out can be corrected even when both clocks already exist.
 * A day with no punches, and a scheduled day off, stay on the missed-punch rules.
 */
export function punchCorrectionRequestSide(summary: {
  missedPunch: boolean;
  status: string;
  hasIn: boolean;
  hasOut: boolean;
}): "in" | "out" | "either" | null {
  if (summary.hasIn && summary.hasOut) return "either";
  return missedPunchRequestSide(summary);
}

/** Branch, duty, and technical supervisors. A cashier is not a manager by role alone. */
const ATTENDANCE_CORRECTION_REQUEST_ROLES = ["branch_gm", "duty_manager", "tech_supervisor"] as const;

/**
 * First-step approvers at a site, same seat as the branch GM.
 * Location ids come from user_roles. An empty list does not approve every site.
 */
export const SITE_ATTENDANCE_APPROVER_ROLES = ["branch_gm", "duty_manager", "tech_supervisor"] as const;

export function siteApproverLocationMap(
  rows: readonly { userId: string; role: string; locationIds: readonly string[] }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!(SITE_ATTENDANCE_APPROVER_ROLES as readonly string[]).includes(row.role)) continue;
    for (const locationId of row.locationIds) {
      if (!locationId) continue;
      const list = map.get(locationId) ?? [];
      if (!list.includes(row.userId)) list.push(row.userId);
      map.set(locationId, list);
    }
  }
  return map;
}

/**
 * Floor staff may correct their own punches. A manager still approves that request.
 * Supervisors, leadership applying for themselves, and anyone with people reporting to them
 * may also correct their team. Company-wide correction admin stays on the existing HR tools.
 */
const OWN_PUNCH_CORRECTION_ROLES = [
  "cashier_host",
  "technician",
  "customer_service",
  "auditor",
  "ceo",
  "coo",
  "regional_ops",
] as const;

export function canRequestAttendanceCorrection(input: {
  roles: readonly string[];
  hasDirectReports: boolean;
  jobTitle?: string | null;
}): boolean {
  if (input.hasDirectReports) return true;
  if (isHeadOfOperationsTitle(input.jobTitle)) return true;
  return input.roles.some(
    (role) =>
      (ATTENDANCE_CORRECTION_REQUEST_ROLES as readonly string[]).includes(role) ||
      (OWN_PUNCH_CORRECTION_ROLES as readonly string[]).includes(role),
  );
}

/**
 * Self, or someone in directReportStaffIds.
 * Callers pass direct reports and everyone who reports through them.
 * People outside that list cannot be corrected.
 */
export function canCorrectStaffPunch(input: {
  requesterStaffId: string | null;
  targetStaffId: string;
  directReportStaffIds: readonly string[];
}): boolean {
  if (!input.requesterStaffId) return false;
  if (input.targetStaffId === input.requesterStaffId) return true;
  return input.directReportStaffIds.includes(input.targetStaffId);
}

/** Where a saved correction waits: line manager, ops after team approve, ops as first seat, or HR. */
export type PunchCorrectionRoutedTo = "line_manager" | "ops" | "ops_first" | "hr";

/**
 * Own requests wait for the requester's line manager, then ops (HoO or F&B Manager), then HR.
 * A correction for someone on the requester's team is already approved by that supervisor
 * and waits on the ops step, then HR. Null means the target is outside the team.
 * Callers upgrade own `line_manager` to `ops_first` when the line manager already holds ops.
 */
export function punchCorrectionRoute(input: {
  requesterStaffId: string | null;
  targetStaffId: string;
  teamStaffIds: readonly string[];
}): "line_manager" | "ops" | null {
  if (!input.requesterStaffId) return null;
  if (input.targetStaffId === input.requesterStaffId) return "line_manager";
  if (input.teamStaffIds.includes(input.targetStaffId)) return "ops";
  return null;
}

/**
 * Own punch corrections skip the manager step when the reporting manager already is the
 * ops seat (Head of Operations for Operations staff, F&B Manager for F&B). That avoids a
 * fake "site supervisor" wait and a double approve by the same person.
 */
export function ownCorrectionRouteAfterLineManagerCheck(
  directory: ApprovalDirectory,
  args: {
    locationId: string;
    staffId: string | null;
    requestedBy: string;
    requesterStaffId?: string | null;
  },
): "line_manager" | "ops_first" {
  const managers = requesterLineManagerUserIds(directory, args);
  if (!managers.length) return "line_manager";
  const opsIds = new Set(approverUserIdsForStep(directory, "ops", args.locationId, args.staffId));
  if (managers.every((id) => opsIds.has(id))) return "ops_first";
  return "line_manager";
}

/** True when a pending manager-step row should already be waiting on ops (legacy mis-route). */
export function shouldHealOwnCorrectionToOpsFirst(
  directory: ApprovalDirectory,
  row: CorrectionApprovalView,
): boolean {
  if (row.status !== "pending" || row.currentStepRole !== "manager") return false;
  if (!row.requesterStaffId || !row.staffId || row.requesterStaffId !== row.staffId) return false;
  return (
    ownCorrectionRouteAfterLineManagerCheck(directory, {
      locationId: row.locationId,
      staffId: row.staffId,
      requestedBy: row.requestedBy,
      requesterStaffId: row.requesterStaffId,
    }) === "ops_first"
  );
}

/** The step the request is waiting on after it is saved. */
export function correctionWaitingStep(route: PunchCorrectionRoutedTo): MissedPunchStepRole {
  if (route === "hr") return "hr";
  if (route === "ops" || route === "ops_first") return "ops";
  return "manager";
}

/**
 * Team corrections record the manager step as approved; ops and HR stay pending.
 * When the submitter is already the ops approver (e.g. F&B Manager), manager and ops
 * are approved and the request waits on HR.
 * Own requests leave every step pending (line manager → ops → HR), unless the line
 * manager is already the ops seat — then manager is skipped and ops is first.
 */
export function correctionStepSeed(route: PunchCorrectionRoutedTo): Array<{
  stepOrder: number;
  stepRole: MissedPunchStepRole;
  status: "pending" | "approved" | "skipped";
}> {
  return missedPunchApprovalSteps().map((step) => {
    if (route === "line_manager") {
      return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "pending" };
    }
    if (route === "ops_first") {
      if (step.stepRole === "manager") {
        return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "skipped" };
      }
      return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "pending" };
    }
    if (route === "hr") {
      if (step.stepRole === "hr") {
        return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "pending" };
      }
      return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "approved" };
    }
    if (step.stepRole === "manager") {
      return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "approved" };
    }
    return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "pending" };
  });
}

function correctionClockLabel(value: string | null | undefined, empty: string): string {
  if (!value || !value.trim()) return empty;
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return punchTimeInputValue(trimmed) || empty;
}

/** Saved on a team correction so HR can see who approved it and which punches changed. */
export function managerTeamCorrectionNote(input: {
  managerName: string;
  requestedPunchIn: string | null;
  requestedPunchOut: string | null;
  previousPunchIn: string | null;
  previousPunchOut: string | null;
}): string {
  const name = input.managerName.trim() || "The manager";
  const requestedIn = correctionClockLabel(input.requestedPunchIn, "not on this request");
  const requestedOut = correctionClockLabel(input.requestedPunchOut, "not on this request");
  const previousIn = correctionClockLabel(input.previousPunchIn, "none");
  const previousOut = correctionClockLabel(input.previousPunchOut, "none");
  return `${name} requested and approved this correction. Requested punch-in ${requestedIn}, punch-out ${requestedOut}. Previous punch-in ${previousIn}, previous punch-out ${previousOut}.`;
}

/** Site in-charge: venue supervisor role, or a site/venue supervisor title. Not every "supervisor" job. */
export function isSiteSupervisorTitle(jobTitle: string | null | undefined, staffRole: string | null | undefined): boolean {
  if (staffRole === "venue_supervisor") return true;
  const title = (jobTitle ?? "").trim();
  if (!title) return false;
  return (
    /(?:^|[\s/])(?:sr\.?\s+|senior\s+)?site supervisor\b/i.test(title) ||
    /\bvenue supervisor\b/i.test(title)
  );
}

export function isHeadOfOperationsTitle(jobTitle: string | null | undefined): boolean {
  return /head of operations/i.test(jobTitle ?? "");
}

export function lineManagerUserIds(
  directory: ApprovalDirectory,
  locationId: string,
  staffId: string | null,
): string[] {
  if (staffId) {
    const named = directory.reportingManagerUserIdByStaffId.get(staffId);
    if (named) return [named];
  }
  const branch = directory.branchGmUserIdsByLocationId.get(locationId) ?? [];
  const titled = directory.siteSupervisorUserIdsByLocationId.get(locationId) ?? [];
  return [...new Set([...branch, ...titled])];
}

/**
 * Walk `reportingManagerStaffIdByStaffId` from `staffId` and return the nearest
 * Venue / Site / Sr. Site supervisor login. Team leads and other non-site titles are skipped.
 */
export function nearestSiteSupervisorUserId(input: {
  staffId: string;
  reportingManagerStaffIdByStaffId: ReadonlyMap<string, string | null | undefined>;
  managerByStaffId: ReadonlyMap<
    string,
    { userId: string | null; jobTitle: string | null; staffRole: string | null }
  >;
}): string | null {
  let cursor: string | null = input.staffId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 25 && cursor; depth += 1) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    // Explicit type breaks TS7022 circular inference: cursor ↔ managerId.
    let managerId: string | null = input.reportingManagerStaffIdByStaffId.get(cursor) ?? null;
    if (!managerId) break;
    const manager = input.managerByStaffId.get(managerId);
    if (manager && isSiteSupervisorTitle(manager.jobTitle, manager.staffRole) && manager.userId) {
      return manager.userId;
    }
    cursor = managerId;
  }
  return null;
}

/**
 * First approver is the nearest site / venue supervisor up the requester's reporting
 * chain (Ashfaq for crew under Ma luz / Marissa / Wahaj). Falls back to the named
 * direct manager, then other site supervisors at the location.
 * The requester is never the approver, and this step does not fall through to the CEO.
 */
export function requesterLineManagerUserIds(
  directory: ApprovalDirectory,
  args: {
    locationId: string;
    staffId: string | null;
    requestedBy: string;
    requesterStaffId?: string | null;
  },
): string[] {
  const lookupId = args.requesterStaffId ?? args.staffId;
  if (lookupId) {
    const siteSupervisor = directory.siteSupervisorManagerUserIdByStaffId.get(lookupId);
    if (siteSupervisor && siteSupervisor !== args.requestedBy) return [siteSupervisor];
    const named = directory.reportingManagerUserIdByStaffId.get(lookupId);
    if (named && named !== args.requestedBy) return [named];
  }
  return lineManagerUserIds(directory, args.locationId, lookupId).filter((id) => id !== args.requestedBy);
}

/**
 * Venue / Site supervisors may first-approve manager-step corrections for anyone in
 * their supervisor OT team (org chart, or managed-venue fallback when the chart is empty)
 * even when the named direct manager is a Team Lead without a walk to them.
 */
export function canSiteSupervisorActOnTeamCorrection(input: {
  userId: string;
  teamStaffIds: readonly string[];
  row: CorrectionApprovalView;
}): boolean {
  if (input.row.status !== "pending" || input.row.currentStepRole !== "manager") return false;
  if (input.userId === input.row.requestedBy) return false;
  if (!input.teamStaffIds.length) return false;
  const team = new Set(input.teamStaffIds);
  if (input.row.staffId && team.has(input.row.staffId)) return true;
  if (input.row.requesterStaffId && team.has(input.row.requesterStaffId)) return true;
  return false;
}

export function approverUserIdsForStep(
  directory: ApprovalDirectory,
  step: MissedPunchStepRole,
  locationId: string,
  staffId: string | null,
  requester?: { requestedBy: string; requesterStaffId?: string | null },
): string[] {
  if (step === "manager") {
    if (requester) {
      return requesterLineManagerUserIds(directory, {
        locationId,
        staffId,
        requestedBy: requester.requestedBy,
        requesterStaffId: requester.requesterStaffId,
      });
    }
    return lineManagerUserIds(directory, locationId, staffId);
  }
  if (step === "ops") {
    // Operations staff → Head of Operations. F&B staff → F&B Manager. Never both.
    return opsStepApproverUserIds(directory, staffId);
  }
  return [...directory.hrUserIds];
}

/** Ops-step lane for this correction's staff (HoO vs F&B Manager). */
export function correctionOpsLane(
  directory: ApprovalDirectory,
  staffId: string | null,
): OpsApprovalLane {
  return opsApprovalLaneForStaffId(directory, staffId);
}

/** Team submitter who already holds the ops seat advances straight to HR. */
export function teamCorrectionRouteAfterOpsCheck(
  directory: ApprovalDirectory,
  staffId: string | null,
  requesterUserId: string,
): "ops" | "hr" {
  if (approverUserIdsForStep(directory, "ops", "", staffId).includes(requesterUserId)) {
    return "hr";
  }
  return "ops";
}

/**
 * Admin/CEO is copied on the site-supervisor and Head of Operations steps.
 * The HR step stays with HR only.
 */
export function missedPunchCopiesExecutives(step: MissedPunchStepRole): boolean {
  return step === "manager" || step === "ops";
}

/**
 * Employee home queue: only rows this login must approve.
 * Decided corrections for other people (visible because the caller can see the site) stay off this page.
 */
export function employeeHomeCorrectionRows<T extends { canAct: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.canAct);
}

export function canUserActOnCorrection(
  directory: ApprovalDirectory,
  userId: string,
  row: CorrectionApprovalView,
): boolean {
  if (row.status !== "pending" || !row.currentStepRole) return false;
  if (userId === row.requestedBy) return false;
  return approverUserIdsForStep(directory, row.currentStepRole, row.locationId, row.staffId, {
    requestedBy: row.requestedBy,
    requesterStaffId: row.requesterStaffId,
  }).includes(userId);
}

export function canUserActOnCorrectionWithTeam(
  directory: ApprovalDirectory,
  userId: string,
  row: CorrectionApprovalView,
  teamStaffIds?: readonly string[] | null,
): boolean {
  if (canUserActOnCorrection(directory, userId, row)) return true;
  if (!teamStaffIds?.length) return false;
  return canSiteSupervisorActOnTeamCorrection({ userId, teamStaffIds, row });
}

export function correctionVisibleToUser(args: {
  queue: MissedPunchQueue;
  userId: string;
  canFinalApprove: boolean;
  viewAll: boolean;
  canSeeLocation: (locationId: string) => boolean;
  directory: ApprovalDirectory;
  row: CorrectionApprovalView;
  /** CEO may open supervisor and operations steps without becoming the approver. */
  observeExecutiveSteps?: boolean;
  /** Org-chart / venue team for site supervisors (same loader as supervisor OT). */
  teamStaffIds?: readonly string[] | null;
}): boolean {
  if (args.queue === "mine") return args.row.requestedBy === args.userId;
  if (canUserActOnCorrectionWithTeam(args.directory, args.userId, args.row, args.teamStaffIds)) return true;
  if (
    args.observeExecutiveSteps &&
    args.row.status === "pending" &&
    args.row.currentStepRole &&
    missedPunchCopiesExecutives(args.row.currentStepRole) &&
    args.row.requestedBy !== args.userId
  ) {
    return true;
  }
  const legacy = args.row.status === "pending" && !args.row.currentStepRole;
  if (legacy) {
    if (!args.canSeeLocation(args.row.locationId)) return false;
    return args.canFinalApprove || args.viewAll;
  }
  if (!userFollowsCorrection(args.directory, args.userId, args.row, args.canSeeLocation)) return false;
  if (args.row.status === "rejected" || args.row.status === "approved" || args.row.status === "change_required") {
    return true;
  }
  // Earlier approvers keep a read-only view after their step, so the row can show Approved.
  if (args.row.status === "pending" && args.row.currentStepRole === "ops") {
    return managerStepApprovers(args.directory, args.row).includes(args.userId);
  }
  if (args.row.status === "pending" && args.row.currentStepRole === "hr") {
    return (
      managerStepApprovers(args.directory, args.row).includes(args.userId) ||
      approverUserIdsForStep(args.directory, "ops", args.row.locationId, args.row.staffId).includes(args.userId)
    );
  }
  return false;
}

function userFollowsCorrection(
  directory: ApprovalDirectory,
  userId: string,
  row: CorrectionApprovalView,
  canSeeLocation: (locationId: string) => boolean,
): boolean {
  if (canSeeLocation(row.locationId)) return true;
  return (
    managerStepApprovers(directory, row).includes(userId) ||
    approverUserIdsForStep(directory, "ops", row.locationId, row.staffId).includes(userId) ||
    approverUserIdsForStep(directory, "hr", row.locationId, row.staffId).includes(userId)
  );
}

function managerStepApprovers(directory: ApprovalDirectory, row: CorrectionApprovalView): string[] {
  return requesterLineManagerUserIds(directory, {
    locationId: row.locationId,
    staffId: row.staffId,
    requestedBy: row.requestedBy,
    requesterStaffId: row.requesterStaffId,
  });
}

export type CorrectionReviewLine = {
  id: string;
};

/**
 * One click reviews one correction id.
 * A second punch-in or punch-out for the same employee and day is a different id and stays untouched.
 */
export function correctionIdsForReview(rows: readonly CorrectionReviewLine[], correctionId: string): string[] {
  const target = correctionId.trim();
  if (!target) return [];
  return rows.filter((row) => row.id === target).map((row) => row.id);
}

export function punchTypeFromCorrectionValue(
  value: Record<string, unknown> | null | undefined,
): "in" | "out" | null {
  const raw = value && typeof value === "object" ? value.punch_type ?? value.punchType : null;
  if (raw === "in" || raw === "out") return raw;
  return null;
}

/** Clock time the employee submitted. Missing stored time stays empty — never invent one. */
export function punchAtFromCorrectionValue(value: Record<string, unknown> | null | undefined): string | null {
  if (!value || typeof value !== "object") return null;
  const raw = value.punch_at ?? value.punchAt ?? value.time ?? value.punch_time;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Times to print on one correction card.
 * The other side stays empty so a sibling request's clock is not copied onto this card.
 */
export function correctionCardClocks(
  punchType: "in" | "out" | null,
  punchAt: string | null,
): { punchIn: string | null; punchOut: string | null } {
  return {
    punchIn: punchType === "in" ? punchAt : null,
    punchOut: punchType === "out" ? punchAt : null,
  };
}

export type AcceptedCorrectionPunch = {
  id: string;
  staffId: string | null;
  workDate: string | null;
  status: string;
  currentStepRole: MissedPunchStepRole | null;
  punchType: "in" | "out" | null;
  punchAt: string | null;
  requestedAt?: string | null;
};

/**
 * The punch counts once the current step has accepted it.
 * Still waiting on the site supervisor does not. Rejected and change-required do not.
 */
export function correctionPunchAccepted(row: {
  status: string;
  currentStepRole: MissedPunchStepRole | null;
}): boolean {
  if (row.status === "approved") return true;
  if (row.status !== "pending") return false;
  return row.currentStepRole === "ops" || row.currentStepRole === "hr";
}

export function applyAcceptedCorrectionTimes<
  T extends {
    staff_id: string | null;
    work_date: string;
    actual_in: string | null;
    actual_out: string | null;
  },
>(rows: readonly T[], corrections: readonly AcceptedCorrectionPunch[]): T[] {
  const accepted = corrections
    .filter((row) => correctionPunchAccepted(row) && row.punchAt && row.staffId && row.workDate)
    .slice()
    .sort((a, b) => String(a.requestedAt ?? "").localeCompare(String(b.requestedAt ?? "")));
  return rows.map((row) => {
    const staffId = row.staff_id;
    const workDate = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !workDate) return row;
    let actualIn = row.actual_in;
    let actualOut = row.actual_out;
    for (const correction of accepted) {
      if (correction.staffId !== staffId) continue;
      if (String(correction.workDate).slice(0, 10) !== workDate) continue;
      const punchAt = correction.punchAt;
      if (!punchAt) continue;
      if (correction.punchType === "in") actualIn = punchAt;
      else if (correction.punchType === "out") actualOut = punchAt;
      else if (!actualIn) actualIn = punchAt;
      else if (!actualOut) actualOut = punchAt;
    }
    if (actualIn === row.actual_in && actualOut === row.actual_out) return row;
    return { ...row, actual_in: actualIn, actual_out: actualOut };
  });
}

/** Qatar HH:mm for the employee time input. */
export function punchTimeInputValue(punchAt: string | null | undefined): string {
  if (!punchAt) return "";
  const match = punchAt.match(/T(\d{2}):(\d{2})/);
  if (match && /[+-]\d{2}:\d{2}$/.test(punchAt)) return `${match[1]}:${match[2]}`;
  const parsed = new Date(punchAt);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  if (!hour || !minute) return "";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** Statuses where the requester may still fix punch time / reason on the same correction id. */
export const EDITABLE_MISSED_PUNCH_STATUSES = ["pending", "change_required"] as const;

export type EditableMissedPunchStatus = (typeof EDITABLE_MISSED_PUNCH_STATUSES)[number];

export function isEditableMissedPunchStatus(status: string): status is EditableMissedPunchStatus {
  return (EDITABLE_MISSED_PUNCH_STATUSES as readonly string[]).includes(status);
}

/**
 * Only the person who submitted may edit, and only while the request is still open
 * (waiting on an approver, or sent back for change). Approved / rejected are locked.
 */
export function canRequesterEditMissedPunch(args: {
  userId: string;
  requestedBy: string;
  status: string;
}): boolean {
  if (args.userId !== args.requestedBy) return false;
  return isEditableMissedPunchStatus(args.status);
}
