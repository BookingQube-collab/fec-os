import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./categories";

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp";

export interface DispatchPayload {
  notificationId: string;
  userId: string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  /** Explicit delivery address (usually staff.email). Preferred over looking up by userId. */
  to?: string | null;
}

export interface DispatchResult {
  channel: NotificationChannel;
  provider: string;
  status: "sent" | "skipped" | "failed";
  providerRef?: string;
  errorMessage?: string;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly providerName: string;
  dispatch(payload: DispatchPayload): Promise<DispatchResult>;
}

/** HR in-app categories that may also fan out to email when outbound email is configured. */
export const HR_NOTIFICATION_CATEGORIES = NOTIFICATION_CATEGORIES.filter((c) =>
  c.startsWith("hr_"),
) as NotificationCategory[];

export function isHrNotificationCategory(category: string): boolean {
  return (HR_NOTIFICATION_CATEGORIES as readonly string[]).includes(category);
}

/** In-app delivery is satisfied by inserting into notifications table. */
export const inAppProvider: NotificationProvider = {
  channel: "in_app",
  providerName: "internal",
  async dispatch() {
    return { channel: "in_app", provider: "internal", status: "sent" };
  },
};

/**
 * Email via Admin UI driver (SMTP / Resend) with webhook fallback.
 * Prefers app_email_settings when managed; otherwise env.
 * Skips cleanly when unset — no third-party SDK required for webhook path.
 */
async function resolveRecipientEmail(userId: string, explicit?: string | null): Promise<string | null> {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveStaffPayslipEmail } = await import("@/lib/staff-login-email-sync");
    const { data } = await supabaseAdmin
      .from("staff")
      .select("email")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    return resolveStaffPayslipEmail(data?.email ?? null);
  } catch {
    return null;
  }
}

export const emailProvider: NotificationProvider = {
  channel: "email",
  providerName: "outbound",
  async dispatch(payload) {
    const { getOutboundEmailConfig } = await import("@/lib/email/settings-store");
    const { outboundEmailReady, sendOutboundEmail } = await import("@/lib/email/send");
    const config = await getOutboundEmailConfig();
    if (!outboundEmailReady(config)) {
      return { channel: "email", provider: "outbound", status: "skipped" };
    }

    const to = await resolveRecipientEmail(payload.userId, payload.to);
    if (!to && !config?.webhookUrl) {
      // SMTP/Resend need an address; webhook can resolve by userId.
      return {
        channel: "email",
        provider: config?.provider ?? "outbound",
        status: "skipped",
        errorMessage: "missing_recipient_email",
      };
    }

    try {
      const html = [
        `<h2>${escapeHtml(payload.title)}</h2>`,
        payload.body ? `<p>${escapeHtml(payload.body)}</p>` : "",
        payload.actionUrl
          ? `<p><a href="${escapeAttr(payload.actionUrl)}">${escapeHtml(payload.actionUrl)}</a></p>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      const result = await sendOutboundEmail(
        {
          to: to || payload.userId,
          subject: payload.title,
          html,
          text: [payload.title, payload.body, payload.actionUrl].filter(Boolean).join("\n"),
          template: "notification_email",
          channel: "email",
          extra: {
            toUserId: payload.userId,
            to: to || undefined,
            notificationId: payload.notificationId,
            title: payload.title,
            body: payload.body ?? null,
            actionUrl: payload.actionUrl ?? null,
          },
        },
        config,
      );

      if (!result.sent) {
        return {
          channel: "email",
          provider: result.provider ?? "outbound",
          status: "failed",
          errorMessage: result.reason ?? "email_dispatch_failed",
        };
      }
      return {
        channel: "email",
        provider: result.provider ?? "outbound",
        status: "sent",
        providerRef: result.provider,
      };
    } catch (err) {
      return {
        channel: "email",
        provider: "outbound",
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "email_dispatch_failed",
      };
    }
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

/** Fire-and-forget email for HR categories when any outbound driver is configured. */
export async function dispatchHrEmailIfConfigured(
  payload: DispatchPayload,
): Promise<DispatchResult> {
  const { getOutboundEmailConfig } = await import("@/lib/email/settings-store");
  const { outboundEmailReady } = await import("@/lib/email/send");
  const config = await getOutboundEmailConfig();
  if (!outboundEmailReady(config)) {
    return { channel: "email", provider: "outbound", status: "skipped" };
  }
  return emailProvider.dispatch(payload);
}

export const smsProvider: NotificationProvider = {
  channel: "sms",
  providerName: "placeholder",
  async dispatch() {
    return { channel: "sms", provider: "placeholder", status: "skipped" };
  },
};

export const whatsappProvider: NotificationProvider = {
  channel: "whatsapp",
  providerName: "placeholder",
  async dispatch() {
    return { channel: "whatsapp", provider: "placeholder", status: "skipped" };
  },
};

export const NOTIFICATION_PROVIDERS: NotificationProvider[] = [
  inAppProvider,
  emailProvider,
  smsProvider,
  whatsappProvider,
];

export function providerForChannel(channel: NotificationChannel): NotificationProvider | undefined {
  return NOTIFICATION_PROVIDERS.find((p) => p.channel === channel);
}
