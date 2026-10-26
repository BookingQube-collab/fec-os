import {
  opsApprovalLaneForStaffId,
  opsStepApproverUserIds,
  type OpsApprovalLane,
} from "@/lib/approval-ops-routing";

/**
 * Punch-correction ladder (aligned with OT narrative):
 * supervisor submit → Sr. Site Supervisor → Head of Operations (or F&B Manager) → HR → General Manager.
 * Only a Venue / Site / Sr. Site supervisor title may auto-complete the manager seat on team submit.
 * A regular supervisor team-submit waits on that seat (e.g. Mary) and does not skip to HoO.
 */
export const MISSED_PUNCH_STEP_ROLES = ["manager", "ops", "hr", "gm"] as const;
export type MissedPunchStepRole = (typeof MISSED_PUNCH_STEP_ROLES)[number];
export type { OpsApprovalLane };

/** Full notifications inbox (bell “View all”). Stale approver target — rewritten on read. */
export const NOTIFICATIONS_INBOX_HREF = "/notifications";
/** My Day Correction → Approve (toast / inbox click for approvers). */
export const ME_PUNCH_APPROVALS_HREF = "/hr/me#me-punch-approvals";
/** My Day Correction tab (also opens Approve when that job is available). */
export const ME_CORRECTION_HREF = "/hr/me#me-correction";
/**
 * Retired Time & Attendance Corrections desk.
 * Kept so stale notification URLs rewrite to My Day; the route redirects there too.
 */
export const PEOPLE_CORRECTIONS_HREF = "/people/attendance/corrections";

const STALE_APPROVER_PUNCH_INBOX_HREFS = new Set([
  NOTIFICATIONS_INBOX_HREF,
  ME_CORRECTION_HREF,
  PEOPLE_CORRECTIONS_HREF,
  "#me-correction",
  "#me-punch-approvals",
]);

/**
 * Everyone opens My Day Approve for punch-correction inbox actions.
 * Rewrites older persisted notifies that still point at All notifications, the Correction
 * tab hash, or the retired People corrections desk.
 */
export function punchApprovalInboxActionUrl(input: {
  roles: readonly string[];
  storedUrl?: string | null;
  sourceType?: string | null;
}): string {
  void input.roles;
  void input.sourceType;
  const stored = input.storedUrl?.trim() || null;
  if (!stored || STALE_APPROVER_PUNCH_INBOX_HREFS.has(stored)) {
    return ME_PUNCH_APPROVALS_HREF;
  }
  return stored;
}

export type MissedPunchQueue = "waiting" | "mine" | "approved";

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
  /** General Manager / branch_gm logins (final step after HR). */
  generalManagerUserIds: readonly string[];
};

export function missedPunchApprovalSteps(): Array<{ stepOrder: number; stepRole: MissedPunchStepRole }> {
  return [
    { stepOrder: 1, stepRole: "manager" },
    { stepOrder: 2, stepRole: "ops" },
    { stepOrder: 3, stepRole: "hr" },
    { stepOrder: 4, stepRole: "gm" },
  ];
}

/** Print-slip signature columns (supervisor submit + the four approval seats). */
export type MissedPunchPrintSigKey = "supervisor" | "site" | "hoo" | "hr" | "gm";

/**
 * Progressive print stamps: fill a column once that seat has approved (or was skipped).
 * Supervisor column: regular team supervisor filed (submitted, not auto-approved manager seat).
 * Site column: Sr. Site / Venue supervisor seat done (approve or title-matched auto-approve).
 */
export function missedPunchPrintSignatureDone(
  status: string | null | undefined,
  steps: ReadonlyArray<{ stepRole: string; status: string }> | null | undefined,
  key: MissedPunchPrintSigKey,
  opts?: { teamSubmitted?: boolean; supervisorSubmitOnly?: boolean },
): boolean {
  const byRole = new Map((steps ?? []).map((step) => [step.stepRole, step.status]));
  const seatDone = (role: MissedPunchStepRole) => {
    const seat = byRole.get(role);
    if (seat === "approved" || seat === "skipped") return true;
    // Legacy rows approved before the GM step existed.
    if (status === "approved" && role === "gm" && !byRole.has("gm")) return true;
    if (status === "approved" && !seat && (role === "manager" || role === "ops" || role === "hr")) {
      return true;
    }
    return false;
  };
  if (key === "supervisor") {
    // Prefer explicit submit-only flag; legacy team-submit that also completed manager still stamps.
    if (opts?.supervisorSubmitOnly != null) return Boolean(opts.supervisorSubmitOnly);
    return Boolean(opts?.teamSubmitted) && seatDone("manager");
  }
  if (key === "site") return seatDone("manager");
  if (key === "hoo") return seatDone("ops");
  if (key === "hr") return seatDone("hr");
  return seatDone("gm");
}

/** Team file note: regular supervisor submitted, or site supervisor requested-and-approved. */
export function isMissedPunchTeamSubmittedNote(note: string | null | undefined): boolean {
  return /(?:requested and approved|submitted) this correction/i.test(note ?? "");
}

/** Site / Sr. Site supervisor auto-completed the manager seat on team submit. */
export function isMissedPunchTeamAutoApprovedNote(note: string | null | undefined): boolean {
  return /requested and approved this correction/i.test(note ?? "");
}

/** Regular supervisor filed for their team; manager seat still needs Sr. Site Supervisor. */
export function isMissedPunchSupervisorSubmitOnlyNote(note: string | null | undefined): boolean {
  return isMissedPunchTeamSubmittedNote(note) && !isMissedPunchTeamAutoApprovedNote(note);
}

/** Name from a team-submit / auto-approve review note. */
export function missedPunchTeamSubmitterName(note: string | null | undefined): string | null {
  const match = (note ?? "").match(/^(.+?) (?:requested and approved|submitted) this correction/i);
  const name = match?.[1]?.trim();
  return name || null;
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

export type PunchCorrectionSummaryCandidate = {
  id: string;
  work_date: string;
  status: string | null;
  missed_punch: boolean | null;
  actual_in: string | null;
  actual_out: string | null;
};

/**
 * Secondment / multi-site staff can have several daily-summary rows for one civil day.
 * Prefer a correctable / missed-punch site over an arbitrary first row.
 */
export function pickBestPunchCorrectionSummary(
  rows: readonly PunchCorrectionSummaryCandidate[],
): PunchCorrectionSummaryCandidate | null {
  if (!rows.length) return null;
  const scored = rows.map((row) => {
    const hasIn = Boolean(row.actual_in);
    const hasOut = Boolean(row.actual_out);
    const missed = Boolean(row.missed_punch);
    const status = String(row.status ?? "");
    const correctable =
      punchCorrectionRequestSide({
        missedPunch: missed,
        status,
        hasIn,
        hasOut,
      }) !== null;
    let score = 0;
    if (correctable) score += 100;
    if (missed || status === "missed_punch" || status === "incomplete") score += 40;
    if (hasIn !== hasOut) score += 20;
    if (hasIn || hasOut) score += 10;
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.row ?? null;
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
 * A team correction returns `"ops"` as a base signal — callers refine with
 * {@link teamCorrectionRoute} so only Venue / Site / Sr. Site titles auto-approve the
 * manager seat; regular supervisors wait on that seat instead.
 * Null means the target is outside the team.
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

/**
 * True when a team correction wrongly treated a regular supervisor submit as the
 * Sr. Site Supervisor (manager) seat and is already waiting on ops.
 */
export function shouldHealTeamCorrectionToManagerSeat(input: {
  row: CorrectionApprovalView;
  managerStep: { status: string; actedBy: string | null } | null | undefined;
  requesterJobTitle?: string | null;
  requesterStaffRole?: string | null;
  directory: ApprovalDirectory;
}): boolean {
  const { row, managerStep, directory } = input;
  if (row.status !== "pending" || row.currentStepRole !== "ops") return false;
  if (!row.requesterStaffId || !row.staffId || row.requesterStaffId === row.staffId) return false;
  if (!managerStep || managerStep.status !== "approved") return false;
  if (!managerStep.actedBy || managerStep.actedBy !== row.requestedBy) return false;
  if (isSiteSupervisorTitle(input.requesterJobTitle, input.requesterStaffRole)) return false;
  if (approverUserIdsForStep(directory, "ops", row.locationId, row.staffId).includes(row.requestedBy)) {
    return false;
  }
  return true;
}

/** The step the request is waiting on after it is saved. */
export function correctionWaitingStep(route: PunchCorrectionRoutedTo): MissedPunchStepRole {
  if (route === "hr") return "hr";
  if (route === "ops" || route === "ops_first") return "ops";
  return "manager";
}

/**
 * Team corrections by a Venue / Site / Sr. Site supervisor record the manager step as
 * approved and wait on ops (or HR when the submitter already holds ops).
 * Regular supervisor team-submit uses `line_manager` (manager seat still pending).
 * Own requests leave every step pending, unless the line manager is already the ops
 * seat — then manager is skipped and ops is first.
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
      if (step.stepRole === "manager" || step.stepRole === "ops") {
        return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "approved" };
      }
      return { stepOrder: step.stepOrder, stepRole: step.stepRole, status: "pending" };
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

function teamCorrectionPunchTrail(input: {
  requestedPunchIn: string | null;
  requestedPunchOut: string | null;
  previousPunchIn: string | null;
  previousPunchOut: string | null;
}): string {
  const requestedIn = correctionClockLabel(input.requestedPunchIn, "not on this request");
  const requestedOut = correctionClockLabel(input.requestedPunchOut, "not on this request");
  const previousIn = correctionClockLabel(input.previousPunchIn, "none");
  const previousOut = correctionClockLabel(input.previousPunchOut, "none");
  return `Requested punch-in ${requestedIn}, punch-out ${requestedOut}. Previous punch-in ${previousIn}, previous punch-out ${previousOut}.`;
}

/**
 * Saved when a Venue / Site / Sr. Site supervisor files for their team and auto-completes
 * the manager seat. HoO / HR can see who approved and which punches changed.
 */
export function managerTeamCorrectionNote(input: {
  managerName: string;
  requestedPunchIn: string | null;
  requestedPunchOut: string | null;
  previousPunchIn: string | null;
  previousPunchOut: string | null;
}): string {
  const name = input.managerName.trim() || "The manager";
  return `${name} requested and approved this correction. ${teamCorrectionPunchTrail(input)}`;
}

/**
 * Saved when a regular supervisor files for their team. Does not complete the
 * Sr. Site Supervisor seat — that seat stays pending for Mary (or equivalent).
 */
export function supervisorTeamSubmittedNote(input: {
  supervisorName: string;
  requestedPunchIn: string | null;
  requestedPunchOut: string | null;
  previousPunchIn: string | null;
  previousPunchOut: string | null;
}): string {
  const name = input.supervisorName.trim() || "The supervisor";
  return `${name} submitted this correction. ${teamCorrectionPunchTrail(input)}`;
}

/** Rewrite a legacy auto-approve note into a supervisor-submitted note (heal path). */
export function rewriteAutoApproveNoteToSupervisorSubmitted(note: string | null | undefined): string | null {
  if (!note?.trim()) return null;
  if (!isMissedPunchTeamAutoApprovedNote(note)) return note;
  return note.replace(/requested and approved this correction/i, "submitted this correction");
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
  if (step === "gm") {
    return [...(directory.generalManagerUserIds ?? [])];
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

/**
 * Refine a team-submit base route (`punchCorrectionRoute` → `"ops"`):
 * - Submitter already holds the ops seat (HoO / F&B Manager) → `"hr"`
 * - Submitter title is Venue / Site / Sr. Site supervisor → `"ops"` (manager seat auto-approved)
 * - Otherwise (regular supervisor) → `"line_manager"` (wait on Sr. Site Supervisor)
 */
export function teamCorrectionRoute(
  directory: ApprovalDirectory,
  staffId: string | null,
  requesterUserId: string,
  requester?: { jobTitle?: string | null; staffRole?: string | null },
): "line_manager" | "ops" | "hr" {
  if (approverUserIdsForStep(directory, "ops", "", staffId).includes(requesterUserId)) {
    return "hr";
  }
  if (isSiteSupervisorTitle(requester?.jobTitle, requester?.staffRole)) {
    return "ops";
  }
  return "line_manager";
}

/** @deprecated Prefer {@link teamCorrectionRoute} — kept for older call sites / tests. */
export function teamCorrectionRouteAfterOpsCheck(
  directory: ApprovalDirectory,
  staffId: string | null,
  requesterUserId: string,
  requester?: { jobTitle?: string | null; staffRole?: string | null },
): "line_manager" | "ops" | "hr" {
  return teamCorrectionRoute(directory, staffId, requesterUserId, requester);
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
  // Approved history uses the same visibility rules as the waiting queue, then
  // filters to seats this user already approved (see approverHistoryCorrectionRows).
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
  if (args.row.status === "pending" && args.row.currentStepRole === "gm") {
    return (
      managerStepApprovers(args.directory, args.row).includes(args.userId) ||
      approverUserIdsForStep(args.directory, "ops", args.row.locationId, args.row.staffId).includes(args.userId) ||
      approverUserIdsForStep(args.directory, "hr", args.row.locationId, args.row.staffId).includes(args.userId)
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
    approverUserIdsForStep(directory, "hr", row.locationId, row.staffId).includes(userId) ||
    approverUserIdsForStep(directory, "gm", row.locationId, row.staffId).includes(userId)
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

export type CorrectionPunchSide = "in" | "out" | "both";

export type CorrectionReviewLine = {
  id: string;
  staffId?: string | null;
  workDate?: string | null;
  status?: string;
  currentStepRole?: MissedPunchStepRole | null;
  punchType?: CorrectionPunchSide | null;
};

/**
 * Review ids for one Approve / Reject click.
 * Combined requests (punch_type both) stay one id.
 * Open legacy same-day in+out pairs (pre-combine creates) decide together so HOO
 * is not left with a half-approved day.
 */
export function correctionIdsForReview(rows: readonly CorrectionReviewLine[], correctionId: string): string[] {
  const target = correctionId.trim();
  if (!target) return [];
  const clicked = rows.find((row) => row.id === target);
  if (!clicked) return [];
  const sibling = findOpenLegacySameDaySibling(rows, clicked);
  if (!sibling) return [clicked.id];
  return [clicked.id, sibling.id];
}

/** Complementary open in/out row for the same staff + work date + approval step. */
export function findOpenLegacySameDaySibling<T extends CorrectionReviewLine>(
  rows: readonly T[],
  row: T,
): T | null {
  if (row.status !== "pending") return null;
  if (row.punchType !== "in" && row.punchType !== "out") return null;
  if (!row.staffId || !row.workDate || !row.currentStepRole) return null;
  const want: CorrectionPunchSide = row.punchType === "in" ? "out" : "in";
  const workDate = String(row.workDate).slice(0, 10);
  return (
    rows.find(
      (other) =>
        other.id !== row.id &&
        other.status === "pending" &&
        other.punchType === want &&
        other.staffId === row.staffId &&
        String(other.workDate ?? "").slice(0, 10) === workDate &&
        other.currentStepRole === row.currentStepRole,
    ) ?? null
  );
}

export type OpenPunchCorrectionCard<T> = {
  /** Row shown on the card (earlier request when paired). */
  primary: T;
  /** Legacy complementary in/out sibling, when present. */
  paired: T | null;
  /** Ids to approve / reject together. */
  reviewIds: string[];
  punchType: CorrectionPunchSide | null;
  punchInAt: string | null;
  punchOutAt: string | null;
  requestNumbers: string[];
};

/**
 * Collapse open legacy dual same-day MPs into one approve card.
 * Combined (`both`) and unpaired one-sided rows pass through unchanged.
 */
export function groupOpenLegacyPunchPairs<
  T extends CorrectionReviewLine & {
    punchAt?: string | null;
    punchInAt?: string | null;
    punchOutAt?: string | null;
    requestNumber?: string | null;
    requestedAt?: string | null;
  },
>(rows: readonly T[]): Array<OpenPunchCorrectionCard<T>> {
  const used = new Set<string>();
  const cards: Array<OpenPunchCorrectionCard<T>> = [];
  const ordered = rows.slice().sort((a, b) => String(a.requestedAt ?? "").localeCompare(String(b.requestedAt ?? "")));
  for (const row of ordered) {
    if (used.has(row.id)) continue;
    const sibling = findOpenLegacySameDaySibling(ordered, row);
    if (sibling && !used.has(sibling.id)) {
      used.add(row.id);
      used.add(sibling.id);
      const inRow = row.punchType === "in" ? row : sibling;
      const outRow = row.punchType === "out" ? row : sibling;
      const primary = String(row.requestedAt ?? "") <= String(sibling.requestedAt ?? "") ? row : sibling;
      cards.push({
        primary,
        paired: primary.id === row.id ? sibling : row,
        reviewIds: [row.id, sibling.id],
        punchType: "both",
        punchInAt:
          inRow.punchInAt ?? (inRow.punchType === "in" || inRow.punchType === "both" ? (inRow.punchAt ?? null) : null),
        punchOutAt:
          outRow.punchOutAt ?? (outRow.punchType === "out" ? (outRow.punchAt ?? null) : null),
        requestNumbers: [row.requestNumber, sibling.requestNumber].filter((n): n is string => Boolean(n)),
      });
      continue;
    }
    used.add(row.id);
    cards.push({
      primary: row,
      paired: null,
      reviewIds: [row.id],
      punchType: row.punchType ?? null,
      punchInAt: row.punchInAt ?? (row.punchType === "in" || row.punchType === "both" ? (row.punchAt ?? null) : null),
      punchOutAt: row.punchOutAt ?? (row.punchType === "out" ? (row.punchAt ?? null) : null),
      requestNumbers: row.requestNumber ? [row.requestNumber] : [],
    });
  }
  return cards;
}

/**
 * Write attendance_logs / recalc only after ops (HoO / F&B Manager) accepts.
 * Site-supervisor (manager) approve advances the workflow only.
 * HR and GM re-apply idempotently (heals a failed ops write; GM is the final seat).
 */
export function shouldApplyCorrectionPunchOnApprove(args: {
  currentStep: MissedPunchStepRole;
  nextStep: MissedPunchStepRole | null;
}): boolean {
  void args.nextStep;
  return args.currentStep !== "manager";
}

/**
 * Approver history: requests where this login already approved a seat
 * (ops-approved queue history for HoO, and the same for manager / HR / GM).
 */
export function approverHistoryCorrectionRows<
  T extends { steps: ReadonlyArray<{ status: string; actedBy?: string | null }> },
>(rows: readonly T[], userId: string): T[] {
  if (!userId) return [];
  return rows.filter((row) =>
    row.steps.some((step) => step.status === "approved" && step.actedBy === userId),
  );
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Qatar local ISO timestamp for a work date + HH:mm. */
export function qatarPunchAt(workDate: string, hhmm: string): string {
  return `${workDate}T${hhmm}:00+03:00`;
}

function isoFromValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Punch clocks stored on one correction row.
 * Prefer punch_in_at / punch_out_at (combined request). Fall back to legacy punch_at + punch_type.
 */
export function punchesFromCorrectionValue(value: Record<string, unknown> | null | undefined): {
  punchInAt: string | null;
  punchOutAt: string | null;
  punchType: CorrectionPunchSide | null;
  punchAt: string | null;
} {
  if (!value || typeof value !== "object") {
    return { punchInAt: null, punchOutAt: null, punchType: null, punchAt: null };
  }
  let punchInAt = isoFromValue(value.punch_in_at ?? value.punchInAt);
  let punchOutAt = isoFromValue(value.punch_out_at ?? value.punchOutAt);
  const legacyAt = isoFromValue(value.punch_at ?? value.punchAt ?? value.time ?? value.punch_time);
  const rawType = value.punch_type ?? value.punchType;
  if (!punchInAt && !punchOutAt && legacyAt) {
    if (rawType === "out") punchOutAt = legacyAt;
    else if (rawType === "both") {
      // Combined row that only kept legacy punch_at — treat as punch-in primary.
      punchInAt = legacyAt;
    } else punchInAt = legacyAt;
  } else if (!punchInAt && legacyAt && (rawType === "in" || rawType === "both")) {
    punchInAt = legacyAt;
  } else if (!punchOutAt && legacyAt && rawType === "out") {
    punchOutAt = legacyAt;
  }
  const punchType: CorrectionPunchSide | null =
    punchInAt && punchOutAt
      ? "both"
      : punchInAt
        ? "in"
        : punchOutAt
          ? "out"
          : rawType === "in" || rawType === "out" || rawType === "both"
            ? rawType
            : null;
  const punchAt = punchInAt ?? punchOutAt ?? legacyAt;
  return { punchInAt, punchOutAt, punchType, punchAt };
}

export function punchTypeFromCorrectionValue(
  value: Record<string, unknown> | null | undefined,
): CorrectionPunchSide | null {
  return punchesFromCorrectionValue(value).punchType;
}

/** Clock time the employee submitted. Missing stored time stays empty — never invent one. */
export function punchAtFromCorrectionValue(value: Record<string, unknown> | null | undefined): string | null {
  return punchesFromCorrectionValue(value).punchAt;
}

/**
 * Build new_value for one missed-punch / punch-correction request that may carry in, out, or both.
 */
export function buildMissedPunchNewValue(args: {
  workDate: string;
  punchInTime: string | null;
  punchOutTime: string | null;
  extras?: Record<string, unknown>;
}): Record<string, unknown> {
  const punchInTime = args.punchInTime && HH_MM.test(args.punchInTime) ? args.punchInTime : null;
  const punchOutTime = args.punchOutTime && HH_MM.test(args.punchOutTime) ? args.punchOutTime : null;
  const punchInAt = punchInTime ? qatarPunchAt(args.workDate, punchInTime) : null;
  const punchOutAt = punchOutTime ? qatarPunchAt(args.workDate, punchOutTime) : null;
  const punchType: CorrectionPunchSide | null =
    punchInAt && punchOutAt ? "both" : punchInAt ? "in" : punchOutAt ? "out" : null;
  const punchAt = punchInAt ?? punchOutAt;
  return {
    ...(args.extras ?? {}),
    punch_at: punchAt,
    punch_type: punchType,
    punch_in_at: punchInAt,
    punch_out_at: punchOutAt,
    requested_punch_in: punchInTime,
    requested_punch_out: punchOutTime,
    missed_punch_request: true,
  };
}

/**
 * Times to print on one correction card.
 * Requested clocks win; when the request is only punch-in or only punch-out, the other
 * side falls back to the existing device / attendance punch (original_value or summary).
 */
export function correctionCardClocks(
  punchType: CorrectionPunchSide | null,
  punchAt: string | null,
  extras?: {
    punchInAt?: string | null;
    punchOutAt?: string | null;
    previousPunchIn?: string | null;
    previousPunchOut?: string | null;
  },
): { punchIn: string | null; punchOut: string | null } {
  const previousIn = extras?.previousPunchIn?.trim() || null;
  const previousOut = extras?.previousPunchOut?.trim() || null;
  if (extras && (extras.punchInAt != null || extras.punchOutAt != null || punchType === "both")) {
    return {
      punchIn:
        extras.punchInAt ??
        (punchType === "in" || punchType === "both" ? punchAt : null) ??
        previousIn,
      punchOut: extras.punchOutAt ?? (punchType === "out" ? punchAt : null) ?? previousOut,
    };
  }
  return {
    punchIn: (punchType === "in" || punchType === "both" ? punchAt : null) ?? previousIn,
    punchOut: (punchType === "out" ? punchAt : null) ?? previousOut,
  };
}

/** Existing punches captured when the correction was filed (original_value). */
export function previousPunchesFromOriginalValue(
  value: Record<string, unknown> | null | undefined,
): { previousPunchIn: string | null; previousPunchOut: string | null } {
  if (!value || typeof value !== "object") {
    return { previousPunchIn: null, previousPunchOut: null };
  }
  return {
    previousPunchIn: isoFromValue(value.actual_in ?? value.actualIn ?? value.previous_punch_in),
    previousPunchOut: isoFromValue(value.actual_out ?? value.actualOut ?? value.previous_punch_out),
  };
}

export type AcceptedCorrectionPunch = {
  id: string;
  staffId: string | null;
  workDate: string | null;
  status: string;
  currentStepRole: MissedPunchStepRole | null;
  punchType: CorrectionPunchSide | null;
  punchAt: string | null;
  punchInAt?: string | null;
  punchOutAt?: string | null;
  requestedAt?: string | null;
};

/**
 * The punch counts once ops (HoO / F&B Manager) has accepted it.
 * Waiting on the site supervisor (`manager` step → currentStepRole ops) does not.
 * After ops, the request waits on HR then GM; listing may show the clocks on those seats.
 * Rejected and change-required do not.
 */
export function correctionPunchAccepted(row: {
  status: string;
  currentStepRole: MissedPunchStepRole | null;
}): boolean {
  if (row.status === "approved") return true;
  if (row.status !== "pending") return false;
  return row.currentStepRole === "hr" || row.currentStepRole === "gm";
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
    .filter(
      (row) =>
        correctionPunchAccepted(row) &&
        row.staffId &&
        row.workDate &&
        (row.punchInAt || row.punchOutAt || row.punchAt),
    )
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
      const inAt =
        correction.punchInAt ??
        (correction.punchType === "in" || correction.punchType === "both" ? correction.punchAt : null);
      const outAt =
        correction.punchOutAt ?? (correction.punchType === "out" ? correction.punchAt : null);
      if (inAt) actualIn = inAt;
      if (outAt) actualOut = outAt;
      if (!inAt && !outAt && correction.punchAt) {
        if (!actualIn) actualIn = correction.punchAt;
        else if (!actualOut) actualOut = correction.punchAt;
      }
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
