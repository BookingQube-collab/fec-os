/**
 * Shared warning escalation checks (callable from leave submit).
 * Not a server-action module — imported by both warnings and leave functions.
 */

import type { AuthContext } from "@/lib/server/create-action";
import { isOnProbation } from "@/lib/hr-probation";
import { readPolicySection } from "@/lib/hr-policy-read";
import {
  countActiveWarnings,
  evaluateWarningEscalation,
  isCasualLeaveBlocked,
  warningPolicyFromSection,
} from "@/lib/hr-warnings";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

/** Shared check for leave submit — blocks casual leave when escalated. Never terminates. */
export async function assertCasualLeaveAllowedForStaff(
  context: AuthContext,
  staffId: string,
  leaveType: string,
): Promise<void> {
  const today = qatarToday();
  const { data, error } = await context.supabase
    .from("hr_warnings")
    .select("status, valid_until")
    .eq("staff_id", staffId);
  if (error) {
    if (tableMissing(error.message)) return;
    throw error;
  }
  const warnings = (data ?? []).map((r) => ({
    status: String(r.status),
    validUntil: r.valid_until ? String(r.valid_until) : null,
  }));
  const policy = warningPolicyFromSection(await readPolicySection(context, "warning"));
  const activeCount = countActiveWarnings(warnings, today);

  const { data: ext } = await context.supabase
    .from("staff_profile_ext")
    .select("probation_start, probation_end")
    .eq("staff_id", staffId)
    .maybeSingle();
  const onProbation = isOnProbation({
    probationStart: ext?.probation_start ?? null,
    probationEnd: ext?.probation_end ?? null,
    today,
  });
  const escalation = evaluateWarningEscalation({ activeCount, onProbation, policy });
  if (isCasualLeaveBlocked(leaveType, escalation)) {
    throw new Error(
      `Casual leave blocked: ${activeCount} active warning(s) require formal HR/management review. Staff is not terminated.`,
    );
  }
}
