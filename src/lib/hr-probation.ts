/**
 * Probation review rules (Phase 5). Pure — no Supabase.
 * Dates come from staff_profile_ext. Terminate decision flags Phase 6 only.
 */

export const HR_PROBATION_DECISIONS = [
  "confirm",
  "extend",
  "terminate",
  "further_review",
] as const;
export type HrProbationDecision = (typeof HR_PROBATION_DECISIONS)[number];

export const HR_PROBATION_STATUSES = [
  "open",
  "pending_approval",
  "decided",
  "cancelled",
] as const;
export type HrProbationStatus = (typeof HR_PROBATION_STATUSES)[number];

export function daysUntilProbationEnd(probationEnd: string, today: string): number {
  const end = Date.parse(`${probationEnd.slice(0, 10)}T00:00:00.000Z`);
  const now = Date.parse(`${today.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(end) || Number.isNaN(now)) return 0;
  return Math.round((end - now) / 86_400_000);
}

export function isOnProbation(input: {
  probationStart?: string | null;
  probationEnd?: string | null;
  today: string;
}): boolean {
  const start = input.probationStart?.slice(0, 10);
  const end = input.probationEnd?.slice(0, 10);
  if (!start || !end) return false;
  const t = input.today.slice(0, 10);
  return t >= start && t <= end;
}

export function reminderDaysFromPolicy(section: Record<string, unknown>): number[] {
  const raw = section.reminder_days ?? section.probation_reminder_days;
  if (!Array.isArray(raw)) return [30, 15, 7];
  return raw
    .map((n) => (typeof n === "number" ? n : Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}

/** Active milestone when days remaining equals a configured reminder day. */
export function activeProbationMilestone(
  daysRemaining: number,
  reminderDays: number[],
): number | null {
  for (const d of reminderDays) {
    if (daysRemaining === d) return d;
  }
  return null;
}

export function shouldSendProbationReminder(input: {
  daysRemaining: number;
  reminderDays: number[];
  alreadySentMilestones: number[];
}): number | null {
  const milestone = activeProbationMilestone(input.daysRemaining, input.reminderDays);
  if (milestone == null) return null;
  if (input.alreadySentMilestones.includes(milestone)) return null;
  return milestone;
}

/**
 * Terminate is a decision record for Phase 6 — never mutates staff.status.
 */
export function applyProbationDecision(decision: HrProbationDecision): {
  decision: HrProbationDecision;
  flagsPhase6Termination: boolean;
  autoTerminatesStaff: false;
  staffStatusTerminated: false;
} {
  return {
    decision,
    flagsPhase6Termination: decision === "terminate",
    autoTerminatesStaff: false,
    staffStatusTerminated: false,
  };
}

export function assertProbationDecisionRequiresApproval(
  decision: HrProbationDecision,
  approved: boolean,
): void {
  if (!approved) {
    throw new Error(`Probation decision "${decision}" requires approval before it is final.`);
  }
}

export function defaultProbationEnd(start: string, months = 6): string {
  const d = new Date(`${start.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + Math.max(1, months));
  return d.toISOString().slice(0, 10);
}
