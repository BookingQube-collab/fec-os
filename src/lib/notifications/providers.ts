import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./categories";

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp";

export interface DispatchPayload {
  notificationId: string;
  userId: string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
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

/** HR in-app categories that may also fan out to email when webhook is set. */
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
 * Email via NOTIFICATION_EMAIL_WEBHOOK (same JSON POST pattern as maintenance).
 * Skips cleanly when unset — no third-party SDK.
 */
export const emailProvider: NotificationProvider = {
  channel: "email",
  providerName: "webhook",
  async dispatch(payload) {
    const webhook = process.env.NOTIFICATION_EMAIL_WEBHOOK?.trim();
    if (!webhook) {
      return { channel: "email", provider: "webhook", status: "skipped" };
    }
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: payload.userId,
          notificationId: payload.notificationId,
          subject: payload.title,
          title: payload.title,
          body: payload.body ?? null,
          actionUrl: payload.actionUrl ?? null,
          channel: "email",
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          channel: "email",
          provider: "webhook",
          status: "failed",
          errorMessage: text || `HTTP ${res.status}`,
        };
      }
      return {
        channel: "email",
        provider: "webhook",
        status: "sent",
        providerRef: "webhook",
      };
    } catch (err) {
      return {
        channel: "email",
        provider: "webhook",
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "email_dispatch_failed",
      };
    }
  },
};

/** Fire-and-forget email for HR categories when webhook is configured. */
export async function dispatchHrEmailIfConfigured(
  payload: DispatchPayload,
): Promise<DispatchResult> {
  if (!process.env.NOTIFICATION_EMAIL_WEBHOOK?.trim()) {
    return { channel: "email", provider: "webhook", status: "skipped" };
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
