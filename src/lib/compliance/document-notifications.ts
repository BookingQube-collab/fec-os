/**
 * Document expiry notification scheduler.
 * Call from cron / edge function / admin action. Creates in-app notifications
 * and records document_notifications rows. Email hook is extensible.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { EXPIRY_NOTIFICATION_TYPES } from "@/lib/compliance/constants";

const THRESHOLD_DAYS: { type: (typeof EXPIRY_NOTIFICATION_TYPES)[number]; days: number }[] = [
  { type: "expiry_60_days", days: 60 },
  { type: "expiry_30_days", days: 30 },
  { type: "expiry_15_days", days: 15 },
  { type: "expiry_7_days", days: 7 },
];

export interface DocumentNotificationResult {
  created: number;
  skipped: number;
  inAppSent: number;
}

/** Optional email dispatch — wire when SMTP/Resend is configured. */
export async function sendDocumentExpiryEmail(_payload: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; reason?: string }> {
  return { sent: false, reason: "email_provider_not_configured" };
}

export async function processDocumentExpiryNotifications(
  supabase: SupabaseClient,
  options?: { locationId?: string; dryRun?: boolean },
): Promise<DocumentNotificationResult> {
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let skipped = 0;
  let inAppSent = 0;

  let q = supabase
    .from("compliance_documents")
    .select("id, location_id, document_type, document_name, expiry_date, renewal_status, responsible_person")
    .not("expiry_date", "is", null)
    .not("renewal_status", "in", "(renewed,not_applicable)");

  if (options?.locationId) q = q.eq("location_id", options.locationId);

  const { data: docs, error } = await q;
  if (error) throw error;

  for (const doc of docs ?? []) {
    const daysLeft = Math.ceil(
      (new Date(doc.expiry_date).getTime() - new Date(today).getTime()) / 86_400_000,
    );

    const types: (typeof EXPIRY_NOTIFICATION_TYPES)[number][] = [];
    if (daysLeft < 0) {
      types.push("expired", "expired_daily");
    } else {
      for (const t of THRESHOLD_DAYS) {
        if (daysLeft <= t.days) types.push(t.type);
      }
    }

    for (const notificationType of types) {
      const { data: existing } = await supabase
        .from("document_notifications")
        .select("id")
        .eq("document_id", doc.id)
        .eq("notification_type", notificationType)
        .eq("notification_date", today)
        .maybeSingle();

      if (existing) {
        skipped += 1;
        continue;
      }

      if (options?.dryRun) {
        created += 1;
        continue;
      }

      const { error: insErr } = await supabase.from("document_notifications").insert({
        document_id: doc.id,
        notification_type: notificationType,
        notification_date: today,
        status: "pending",
      });
      if (insErr) {
        skipped += 1;
        continue;
      }
      created += 1;

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role, location_ids")
        .in("role", ["branch_gm", "duty_manager", "regional_ops", "ceo", "coo"]);

      const recipients = (roleRows ?? [])
        .filter(
          (r) =>
            !r.location_ids?.length ||
            r.location_ids.includes(doc.location_id) ||
            ["ceo", "coo", "regional_ops"].includes(r.role as string),
        )
        .map((r) => r.user_id);
      if (!recipients.length) {
        skipped += 1;
        continue;
      }

      const title =
        daysLeft < 0
          ? `Expired: ${doc.document_name ?? doc.document_type}`
          : `Expiring in ${daysLeft}d: ${doc.document_name ?? doc.document_type}`;

      for (const userId of recipients) {
        const { error: notifErr } = await supabase.from("notifications").insert({
          user_id: userId,
          location_id: doc.location_id,
          category: "compliance",
          title,
          body: `Certificate/document expires ${doc.expiry_date}. Renewal status: ${doc.renewal_status}.`,
          severity: daysLeft < 0 ? "high" : daysLeft <= 7 ? "high" : "medium",
          action_url: `/compliance/documents/${doc.id}`,
          source_type: "compliance_document",
          source_id: doc.id,
        });
        if (!notifErr) inAppSent += 1;
      }

      if (inAppSent > 0) {
        await supabase
          .from("document_notifications")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("document_id", doc.id)
          .eq("notification_type", notificationType)
          .eq("notification_date", today);
      }
    }
  }

  return { created, skipped, inAppSent };
}
