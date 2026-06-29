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

/** In-app delivery is satisfied by inserting into notifications table. */
export const inAppProvider: NotificationProvider = {
  channel: "in_app",
  providerName: "internal",
  async dispatch() {
    return { channel: "in_app", provider: "internal", status: "sent" };
  },
};

/** Placeholder — wire Resend/SendGrid when SMTP env vars are configured. */
export const emailProvider: NotificationProvider = {
  channel: "email",
  providerName: "placeholder",
  async dispatch() {
    if (!process.env.NOTIFICATION_EMAIL_WEBHOOK) {
      return { channel: "email", provider: "placeholder", status: "skipped" };
    }
    return { channel: "email", provider: "placeholder", status: "sent", providerRef: "queued" };
  },
};

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
