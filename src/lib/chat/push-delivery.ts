import "server-only";

import { WebPushError, sendNotification } from "web-push";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadPushSettingsRow, readPushEnv, resolvePushCredentials } from "@/lib/chat/push-settings";
import { shouldSendChatEmail, shouldSendChatPush } from "@/lib/chat/notification-rules";
import { emailProvider } from "@/lib/notifications/providers";

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
};

type PrefRow = {
  user_id: string;
  channel_email: boolean;
};

type ListResult = {
  data: Array<Record<string, string | boolean | null>> | null;
  error: { message: string } | null;
};

type SubTable = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => Promise<ListResult> & {
      eq: (column: string, value: string) => Promise<ListResult>;
    };
  };
  delete: () => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
};

function subscriptionTable(): SubTable {
  const db = supabaseAdmin as unknown as { from: (table: string) => SubTable };
  return db.from("chat_push_subscriptions");
}

function warnPush(status: number) {
  console.warn(`[chat-push] send failed status ${status}`);
}

function warnChannel(channel: "push" | "email") {
  console.warn(`[chat-${channel}] skipped`);
}

async function subscriptionsFor(userIds: readonly string[]): Promise<SubscriptionRow[]> {
  const rows: SubscriptionRow[] = [];
  for (let index = 0; index < userIds.length; index += 100) {
    const slice = userIds.slice(index, index + 100);
    const result = await subscriptionTable().select("user_id, endpoint, p256dh, auth").in("user_id", [...slice]);
    if (result.error) {
      warnChannel("push");
      return rows;
    }
    for (const row of result.data ?? []) {
      const endpoint = typeof row.endpoint === "string" ? row.endpoint : "";
      const p256dh = typeof row.p256dh === "string" ? row.p256dh : "";
      const auth = typeof row.auth === "string" ? row.auth : "";
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      if (!endpoint || !p256dh || !auth || !userId) continue;
      rows.push({ endpoint, p256dh, auth, user_id: userId });
    }
  }
  return rows;
}

async function dropSubscription(endpoint: string) {
  await subscriptionTable().delete().eq("endpoint", endpoint);
}

async function emailOptIn(userIds: readonly string[]): Promise<Set<string>> {
  const allowed = new Set<string>();
  for (let index = 0; index < userIds.length; index += 100) {
    const slice = userIds.slice(index, index + 100);
    const result = await supabaseAdmin
      .from("notification_preferences")
      .select("user_id, channel_email")
      .eq("category", "chat")
      .in("user_id", [...slice]);
    if (result.error) {
      warnChannel("email");
      return allowed;
    }
    for (const row of (result.data ?? []) as PrefRow[]) {
      if (row.channel_email === true && row.user_id) allowed.add(row.user_id);
    }
  }
  return allowed;
}

/**
 * In-app rows are already inserted. This does not throw.
 * Push runs only when an admin has enabled saved keys (or the settings row is missing and env is complete).
 * Email runs only when NOTIFICATION_EMAIL_WEBHOOK is set and that user turned on chat email.
 */
export async function deliverChatChannels(input: {
  userIds: readonly string[];
  title: string;
  body: string;
  actionUrl: string;
}): Promise<void> {
  const userIds = [...new Set(input.userIds.filter((id) => id.length > 0))];
  if (userIds.length === 0) return;

  try {
    const row = await loadPushSettingsRow();
    const credentials = resolvePushCredentials(row, readPushEnv());
    if (credentials && shouldSendChatPush(true)) {
      const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        url: input.actionUrl,
      });
      const subscriptions = await subscriptionsFor(userIds);
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              payload,
              {
                TTL: 60,
                vapidDetails: {
                  subject: credentials.subject,
                  publicKey: credentials.publicKey,
                  privateKey: credentials.privateKey,
                },
              },
            );
          } catch (error) {
            const status = error instanceof WebPushError ? error.statusCode : 0;
            warnPush(status);
            if (status === 404 || status === 410) {
              try {
                await dropSubscription(subscription.endpoint);
              } catch {
                warnChannel("push");
              }
            }
          }
        }),
      );
    }
  } catch {
    warnChannel("push");
  }

  const webhookConfigured = Boolean(process.env.NOTIFICATION_EMAIL_WEBHOOK?.trim());
  if (!webhookConfigured) return;

  try {
    const allowed = await emailOptIn(userIds);
    await Promise.all(
      userIds.map(async (userId) => {
        if (!shouldSendChatEmail({ webhookConfigured: true, channelEmail: allowed.has(userId) })) return;
        const result = await emailProvider.dispatch({
          notificationId: `chat-${userId}`,
          userId,
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl,
        });
        if (result.status === "failed") warnChannel("email");
      }),
    );
  } catch {
    warnChannel("email");
  }
}
