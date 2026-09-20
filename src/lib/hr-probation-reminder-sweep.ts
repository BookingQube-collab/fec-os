/**
 * Probation end-date reminder sweep (Phase 5 / Phase 12 email fan-out).
 * Mirrors document-expiry sweep: in-app + optional webhook email at policy milestones.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  daysUntilProbationEnd,
  reminderDaysFromPolicy,
  shouldSendProbationReminder,
} from "@/lib/hr-probation";
import { HR_POLICY_DEFAULTS } from "@/lib/hr-policy";
import { findUsersWithCapability, notifyUsers } from "@/lib/notifications/action-notify";

type Sb = SupabaseClient;

function todayYmdQatar(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

async function loadProbationReminderDays(sb: Sb): Promise<number[]> {
  const { data } = await sb
    .from("hr_policy_settings")
    .select("section, key, value")
    .in("section", ["probation", "notification"])
    .in("key", ["reminder_days", "probation_reminder_days"])
    .is("company_id", null);
  const section: Record<string, unknown> = {
    ...HR_POLICY_DEFAULTS.probation,
    ...HR_POLICY_DEFAULTS.notification,
  };
  for (const row of data ?? []) {
    if (row.key === "reminder_days" || row.key === "probation_reminder_days") {
      section.reminder_days = row.value;
    }
  }
  return reminderDaysFromPolicy(section);
}

/**
 * Daily probation reminder sweep — secret-guarded via /api/public/hr-probation-reminder-sweep.
 */
export async function runHrProbationReminderSweep(sb: Sb): Promise<{ remindersSent: number }> {
  const today = todayYmdQatar();
  const reminderDays = await loadProbationReminderDays(sb);

  const { data: profiles } = await sb
    .from("staff_profile_ext")
    .select("staff_id, probation_start, probation_end")
    .not("probation_end", "is", null)
    .gte("probation_end", today)
    .limit(1000);

  const hrUserIds = await findUsersWithCapability("hr.probation.manage");
  let remindersSent = 0;

  for (const profile of profiles ?? []) {
    const end = String(profile.probation_end).slice(0, 10);
    const daysRemaining = daysUntilProbationEnd(end, today);
    const { data: prior } = await sb
      .from("hr_probation_reminders")
      .select("milestone_days")
      .eq("staff_id", profile.staff_id)
      .eq("probation_end", end);
    const sent = (prior ?? []).map((r) => Number(r.milestone_days));
    const milestone = shouldSendProbationReminder({
      daysRemaining,
      reminderDays,
      alreadySentMilestones: sent,
    });
    if (milestone == null) continue;

    const { data: staff } = await sb
      .from("staff")
      .select("id, full_name, user_id, status")
      .eq("id", profile.staff_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!staff || staff.status === "terminated") continue;

    const title = `Probation decision due in ${milestone} days`;
    const body = `${staff.full_name ?? "Employee"} probation ends ${end}. Review confirm / extend / further review (terminate flags Phase 6 only).`;
    const actionUrl = "/people/hr/probation";

    const recipients = [...hrUserIds];
    if (staff.user_id) recipients.push(String(staff.user_id));

    await notifyUsers({
      userIds: recipients,
      category: "hr_disciplinary",
      title,
      body,
      severity: milestone <= 7 ? "warning" : "info",
      actionUrl,
      sourceType: "hr_probation_reminder",
      sourceId: String(profile.staff_id),
    });

    const { error } = await sb.from("hr_probation_reminders").insert({
      staff_id: profile.staff_id,
      probation_end: end,
      milestone_days: milestone,
      channel: "in_app",
    });
    if (!error) remindersSent += 1;
  }

  return { remindersSent };
}
