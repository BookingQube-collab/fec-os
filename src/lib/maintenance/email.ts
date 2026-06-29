import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type MaintenanceEmailTemplate =
  | "work_order_acknowledgment"
  | "sla_escalation"
  | "work_order_completed"
  | "maintenance_request_submitted";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  templateKey: MaintenanceEmailTemplate;
  sourceType: string;
  sourceId?: string;
}

function buildAcknowledgmentHtml(opts: {
  jobOrderNumber: string;
  title: string;
  priority: string;
  locationCode: string;
  slaDueAt: string | null;
}): string {
  return `
    <h2>Maintenance Job Order Created</h2>
    <p><strong>Job Order:</strong> ${opts.jobOrderNumber}</p>
    <p><strong>Title:</strong> ${opts.title}</p>
    <p><strong>Priority:</strong> ${opts.priority}</p>
    <p><strong>Location:</strong> ${opts.locationCode}</p>
    ${opts.slaDueAt ? `<p><strong>SLA Due:</strong> ${new Date(opts.slaDueAt).toLocaleString()}</p>` : ""}
    <p>Your request has been logged and assigned to the maintenance team.</p>
  `;
}

function buildEscalationHtml(opts: {
  jobOrderNumber: string | null;
  title: string;
  priority: string;
  slaDueAt: string;
}): string {
  return `
    <h2>SLA Escalation Reminder</h2>
    <p>Work order <strong>${opts.jobOrderNumber ?? "—"}</strong> is approaching SLA breach.</p>
    <p><strong>Title:</strong> ${opts.title}</p>
    <p><strong>Priority:</strong> ${opts.priority}</p>
    <p><strong>SLA Due:</strong> ${new Date(opts.slaDueAt).toLocaleString()}</p>
    <p>Please take immediate action.</p>
  `;
}

function buildCompletedHtml(opts: {
  jobOrderNumber: string | null;
  title: string;
  completedAt: string;
}): string {
  return `
    <h2>Maintenance Job Completed</h2>
    <p>Job order <strong>${opts.jobOrderNumber ?? "—"}</strong> has been completed.</p>
    <p><strong>Title:</strong> ${opts.title}</p>
    <p><strong>Completed:</strong> ${new Date(opts.completedAt).toLocaleString()}</p>
  `;
}

function buildRequestSubmittedHtml(opts: {
  requestNumber: string;
  description: string;
  priority: string;
  reporterName: string | null;
  locationCode: string;
}): string {
  return `
    <h2>New Maintenance Request</h2>
    <p><strong>Request:</strong> ${opts.requestNumber}</p>
    <p><strong>Location:</strong> ${opts.locationCode}</p>
    <p><strong>Priority:</strong> ${opts.priority}</p>
    <p><strong>Reporter:</strong> ${opts.reporterName ?? "—"}</p>
    <p><strong>Description:</strong> ${opts.description}</p>
  `;
}

async function logEmail(
  sb: SupabaseClient,
  payload: EmailPayload,
  status: string,
  errorMessage?: string,
): Promise<void> {
  await sb.from("maintenance_email_log").insert({
    source_type: payload.sourceType,
    source_id: payload.sourceId ?? null,
    recipient_email: payload.to,
    template_key: payload.templateKey,
    subject: payload.subject,
    status,
    error_message: errorMessage ?? null,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  });
}

async function dispatchEmail(payload: EmailPayload): Promise<{ sent: boolean; reason?: string }> {
  const webhook = process.env.NOTIFICATION_EMAIL_WEBHOOK;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.MAINTENANCE_EMAIL_FROM ?? process.env.EMAIL_FROM ?? "maintenance@fec.qa";

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { sent: false, reason: text };
    }
    return { sent: true };
  }

  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        template: payload.templateKey,
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: await res.text() };
    }
    return { sent: true };
  }

  return { sent: false, reason: "email_provider_not_configured" };
}

export async function sendMaintenanceEmail(
  sb: SupabaseClient,
  payload: EmailPayload,
): Promise<{ sent: boolean; reason?: string }> {
  const result = await dispatchEmail(payload);
  await logEmail(sb, payload, result.sent ? "sent" : "skipped", result.reason);
  return result;
}

export async function notifyMaintenanceTeamInApp(
  sb: SupabaseClient,
  opts: {
    locationId: string;
    title: string;
    body: string;
    actionUrl?: string;
    sourceType: string;
    sourceId: string;
  },
): Promise<number> {
  const { data: roles } = await sb
    .from("user_roles")
    .select("user_id, role, location_ids")
    .in("role", ["tech_supervisor", "technician", "duty_manager", "branch_gm"]);

  const userIds = new Set<string>();
  for (const r of roles ?? []) {
    const locs = (r.location_ids as string[]) ?? [];
    if (locs.length === 0 || locs.includes(opts.locationId)) {
      userIds.add(r.user_id);
    }
  }

  if (userIds.size === 0) return 0;

  const rows = [...userIds].map((user_id) => ({
    user_id,
    location_id: opts.locationId,
    category: "general",
    title: opts.title,
    body: opts.body,
    severity: "warning",
    source_type: opts.sourceType,
    source_id: opts.sourceId,
    action_url: opts.actionUrl ?? "/maintenance",
  }));

  const { error } = await sb.from("notifications").insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function sendWorkOrderAcknowledgment(
  sb: SupabaseClient,
  opts: {
    toEmail: string | null;
    workOrderId: string;
    jobOrderNumber: string;
    title: string;
    priority: string;
    locationCode: string;
    slaDueAt: string | null;
  },
): Promise<void> {
  if (!opts.toEmail) return;
  await sendMaintenanceEmail(sb, {
    to: opts.toEmail,
    subject: `Job Order ${opts.jobOrderNumber} — Acknowledgment`,
    html: buildAcknowledgmentHtml(opts),
    templateKey: "work_order_acknowledgment",
    sourceType: "work_orders",
    sourceId: opts.workOrderId,
  });
}

export async function sendSlaEscalationEmail(
  sb: SupabaseClient,
  opts: {
    toEmails: string[];
    workOrderId: string;
    jobOrderNumber: string | null;
    title: string;
    priority: string;
    slaDueAt: string;
  },
): Promise<void> {
  for (const to of opts.toEmails) {
    await sendMaintenanceEmail(sb, {
      to,
      subject: `SLA Alert: ${opts.jobOrderNumber ?? opts.title}`,
      html: buildEscalationHtml(opts),
      templateKey: "sla_escalation",
      sourceType: "work_orders",
      sourceId: opts.workOrderId,
    });
  }
}

export async function sendWorkOrderCompletedEmail(
  sb: SupabaseClient,
  opts: {
    toEmail: string | null;
    workOrderId: string;
    jobOrderNumber: string | null;
    title: string;
    completedAt: string;
  },
): Promise<void> {
  if (!opts.toEmail) return;
  await sendMaintenanceEmail(sb, {
    to: opts.toEmail,
    subject: `Job Order ${opts.jobOrderNumber ?? "completed"} — Completed`,
    html: buildCompletedHtml(opts),
    templateKey: "work_order_completed",
    sourceType: "work_orders",
    sourceId: opts.workOrderId,
  });
}

export async function sendMaintenanceRequestSubmittedEmail(
  sb: SupabaseClient,
  opts: {
    toEmails: string[];
    requestId: string;
    requestNumber: string;
    description: string;
    priority: string;
    reporterName: string | null;
    locationCode: string;
  },
): Promise<void> {
  for (const to of opts.toEmails) {
    await sendMaintenanceEmail(sb, {
      to,
      subject: `New Maintenance Request ${opts.requestNumber}`,
      html: buildRequestSubmittedHtml(opts),
      templateKey: "maintenance_request_submitted",
      sourceType: "maintenance_requests",
      sourceId: opts.requestId,
    });
  }
}

export async function resolveUserEmails(
  sb: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const { data } = await sb.from("staff").select("user_id, email").in("user_id", userIds);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.user_id && row.email) map.set(row.user_id, row.email);
  }
  return map;
}

export async function getMaintenanceTeamEmails(
  sb: SupabaseClient,
  locationId: string,
): Promise<string[]> {
  const { data: roles } = await sb
    .from("user_roles")
    .select("user_id, location_ids")
    .in("role", ["tech_supervisor", "technician"]);

  const userIds: string[] = [];
  for (const r of roles ?? []) {
    const locs = (r.location_ids as string[]) ?? [];
    if (locs.length === 0 || locs.includes(locationId)) {
      userIds.push(r.user_id);
    }
  }

  const emailMap = await resolveUserEmails(sb, userIds);
  return [...new Set([...emailMap.values()])];
}
