import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  activeMilestone,
  alertPeriodsForDocType,
  documentExpiryPolicyFromSection,
  daysUntilExpiry,
  isExpiredDoc,
  shouldSendExpiryReminder,
} from "@/lib/hr-document-expiry";
import { findUsersWithCapability, notifyUsers } from "@/lib/notifications/action-notify";
import { HR_POLICY_DEFAULTS } from "@/lib/hr-policy";

type Sb = SupabaseClient;

function todayYmdQatar(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

async function loadDocumentPolicy(sb: Sb): Promise<Record<string, unknown>> {
  const { data, error } = await sb
    .from("hr_policy_settings")
    .select("key, value")
    .eq("section", "document")
    .is("company_id", null);
  if (error || !data?.length) return { ...HR_POLICY_DEFAULTS.document };
  const out: Record<string, unknown> = { ...HR_POLICY_DEFAULTS.document };
  for (const row of data) out[row.key] = row.value;
  return out;
}

async function staffUserId(sb: Sb, staffId: string): Promise<string | null> {
  const { data } = await sb.from("staff").select("user_id").eq("id", staffId).maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

/**
 * Daily document expiry sweep — marks expired rows and sends QID/passport reminders.
 * Secret-guarded via /api/public/hr-document-expiry-sweep (same pattern as escalation-sweep).
 * Email fans out via notifyUsers when NOTIFICATION_EMAIL_WEBHOOK is set (hr_documents).
 */
export async function runHrDocumentExpirySweep(sb: Sb): Promise<{
  expiredMarked: number;
  remindersSent: number;
}> {
  const today = todayYmdQatar();
  const policy = documentExpiryPolicyFromSection(await loadDocumentPolicy(sb));

  let expiredMarked = 0;
  const { data: expiredRows } = await sb
    .from("hr_employee_documents")
    .select("id")
    .is("deleted_at", null)
    .not("expiry_date", "is", null)
    .lt("expiry_date", today)
    .neq("status", "expired")
    .limit(500);
  for (const row of expiredRows ?? []) {
    const { error } = await sb
      .from("hr_employee_documents")
      .update({ status: "expired", status_at: new Date().toISOString() })
      .eq("id", row.id);
    if (!error) expiredMarked += 1;
  }

  const { data: docs } = await sb
    .from("hr_employee_documents")
    .select("id, staff_id, doc_type, expiry_date, title, file_name")
    .is("deleted_at", null)
    .not("expiry_date", "is", null)
    .in("doc_type", ["qid", "passport"])
    .limit(1000);

  const hrUserIds = await findUsersWithCapability("hr.docs.manage");
  let remindersSent = 0;

  for (const doc of docs ?? []) {
    const expiry = String(doc.expiry_date).slice(0, 10);
    if (isExpiredDoc(today, expiry)) continue;
    const periods = alertPeriodsForDocType(String(doc.doc_type), policy);
    if (periods.length === 0) continue;

    const { data: reminderRows } = await sb
      .from("hr_document_expiry_reminders")
      .select("sent_at, acknowledged_at")
      .eq("document_id", doc.id)
      .order("sent_at", { ascending: false })
      .limit(50);

    const acknowledged = (reminderRows ?? []).some((r) => r.acknowledged_at);
    const lastSent = reminderRows?.[0]?.sent_at
      ? String(reminderRows[0].sent_at).slice(0, 10)
      : null;
    const daysUntil = daysUntilExpiry(today, expiry);
    const send = shouldSendExpiryReminder({
      daysUntil,
      alertPeriods: periods,
      frequencyDays: policy.reminderFrequencyDays,
      todayYmd: today,
      lastSentAtYmd: lastSent,
      acknowledged,
    });
    if (!send) continue;

    const milestone = activeMilestone(daysUntil, periods) ?? periods[periods.length - 1]!;
    const label = doc.doc_type === "qid" ? "QID" : "Passport";
    const title = `${label} expiring in ${daysUntil} day(s)`;
    const body = `${doc.title ?? doc.file_name ?? label} expires on ${expiry}. Please renew or acknowledge.`;
    const actionUrl = "/people/hr/documents";

    const employeeUserId = await staffUserId(sb, String(doc.staff_id));
    const recipients = [...new Set([...(employeeUserId ? [employeeUserId] : []), ...hrUserIds])];

    await notifyUsers({
      userIds: recipients,
      category: "hr_documents",
      title,
      body,
      severity: daysUntil <= 30 ? "warning" : "info",
      actionUrl,
      sourceType: "hr_employee_documents",
      sourceId: String(doc.id),
    });

    const { error: remErr } = await sb.from("hr_document_expiry_reminders").insert({
      document_id: doc.id,
      milestone_days: milestone,
      channel: "in_app",
      sent_at: new Date().toISOString(),
    });
    if (!remErr) remindersSent += 1;
  }

  return { expiredMarked, remindersSent };
}
