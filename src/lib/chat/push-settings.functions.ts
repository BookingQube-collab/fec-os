"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import {
  isVapidKey,
  keepPushPrivateKey,
  loadPushSettingsRow,
  PUSH_SETTINGS_AUTH,
  readPushEnv,
  resolvePushCredentials,
  savePushSettingsRow,
  toClientPushConfig,
  toPublicPushSettings,
  type PushClientConfig,
  type PushSettingsPublic,
} from "@/lib/chat/push-settings";

const saveSchema = z.object({
  enabled: z.boolean(),
  publicKey: z.string().max(200),
  privateKey: z.string().max(200),
});

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(200),
});

export const loadChatPushSettings = createSafeAuthenticatedAction(
  z.object({}),
  async (): Promise<PushSettingsPublic> => {
    const row = await loadPushSettingsRow();
    return toPublicPushSettings(row);
  },
  { auth: PUSH_SETTINGS_AUTH },
);

export const saveChatPushSettings = createSafeAuthenticatedAction(
  saveSchema,
  async (data, context): Promise<PushSettingsPublic> => {
    const existing = await loadPushSettingsRow();
    const publicKey = data.publicKey.trim();
    const privateKey = keepPushPrivateKey(existing?.vapid_private_key ?? "", data.privateKey);
    if (publicKey.length > 0 && !isVapidKey(publicKey)) {
      throw new Error("The VAPID public key is not a URL-safe base64 key.");
    }
    if (data.privateKey.trim().length > 0 && !isVapidKey(privateKey)) {
      throw new Error("The VAPID private key is not a URL-safe base64 key.");
    }
    if (data.enabled && (!isVapidKey(publicKey) || !isVapidKey(privateKey))) {
      throw new Error("Enable browser push only after the public key and private key are saved.");
    }
    const saved = await savePushSettingsRow(
      {
        enabled: data.enabled,
        vapid_public_key: publicKey,
        vapid_private_key: privateKey.trim(),
      },
      context.userId,
    );
    return toPublicPushSettings(saved);
  },
  { auth: PUSH_SETTINGS_AUTH },
);

/** Signed-in chat users. Returns no public key unless push can actually send. Never returns the private key. */
export const loadChatPushClientConfig = createSafeAuthenticatedAction(
  z.object({}),
  async (): Promise<PushClientConfig> => {
    try {
      const row = await loadPushSettingsRow();
      return toClientPushConfig(resolvePushCredentials(row, readPushEnv()));
    } catch {
      return { enabled: false, publicKey: null };
    }
  },
  { defaultInput: {}, auth: { capability: "chat.view" } },
);

export const saveOwnPushSubscription = createSafeAuthenticatedAction(
  subscriptionSchema,
  async (data, context) => {
    const row = await loadPushSettingsRow();
    if (!resolvePushCredentials(row, readPushEnv())) {
      throw new Error("Browser notifications are not configured.");
    }
    const endpoint = data.endpoint.trim();
    if (!endpoint.startsWith("https://")) throw new Error("Push endpoint must use https.");
    const table = context.supabase as unknown as {
      from: (name: string) => {
        upsert: (
          values: Record<string, unknown>,
          options: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const saved = await table.from("chat_push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint,
        p256dh: data.p256dh.trim(),
        auth: data.auth.trim(),
      },
      { onConflict: "endpoint" },
    );
    if (saved.error) throw new Error("This device could not be registered.");
    return { ok: true as const };
  },
  { auth: { capability: "chat.view" } },
);

export const deleteOwnPushSubscription = createSafeAuthenticatedAction(
  z.object({ endpoint: z.string().url().max(2000) }),
  async (data, context) => {
    const table = context.supabase as unknown as {
      from: (name: string) => {
        delete: () => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
    const removed = await table
      .from("chat_push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint.trim())
      .eq("user_id", context.userId);
    if (removed.error) throw new Error("This device could not be removed.");
    return { ok: true as const };
  },
  { auth: { capability: "chat.view" } },
);
