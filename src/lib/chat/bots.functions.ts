"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createSafeAuthenticatedAction, createSafeAuthenticatedActionNoInput } from "@/lib/server/create-action";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newWebhookToken(): { token: string; prefix: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, prefix: token.slice(0, 8), hash: hashToken(token) };
}

const nameSchema = z.string().trim().min(1).max(80);
const botIdSchema = z.string().uuid();
const conversationIdSchema = z.string().uuid();

export type ChatBotRow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  webhookTokenPrefix: string;
  createdAt: string;
  roomIds: string[];
  /** Only set on create / rotate. */
  webhookToken?: string;
  webhookPath?: string;
};

function webhookPath(botId: string, token: string): string {
  return `/api/public/chat-slack/${botId}/${token}`;
}

export const listChatBots = createSafeAuthenticatedActionNoInput(async (_ctx) => {
  const admin = supabaseAdmin;
  const { data: bots, error } = await admin
    .from("chat_bots")
    .select("id, name, description, enabled, webhook_token_prefix, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (bots ?? []).map((b) => b.id as string);
  const roomsByBot = new Map<string, string[]>();
  if (ids.length) {
    const { data: rooms, error: roomError } = await admin
      .from("chat_bot_rooms")
      .select("bot_id, conversation_id")
      .in("bot_id", ids);
    if (roomError) throw new Error(roomError.message);
    for (const row of rooms ?? []) {
      const botId = row.bot_id as string;
      const list = roomsByBot.get(botId) ?? [];
      list.push(row.conversation_id as string);
      roomsByBot.set(botId, list);
    }
  }
  return (bots ?? []).map((bot): ChatBotRow => ({
    id: bot.id as string,
    name: bot.name as string,
    description: (bot.description as string | null) ?? null,
    enabled: bot.enabled === true,
    webhookTokenPrefix: bot.webhook_token_prefix as string,
    createdAt: bot.created_at as string,
    roomIds: roomsByBot.get(bot.id as string) ?? [],
  }));
}, { auth: { capability: "ember.manage" } });

export const createChatBot = createSafeAuthenticatedAction(
  z.object({
    name: nameSchema,
    description: z.string().trim().max(500).optional(),
    conversationIds: z.array(conversationIdSchema).max(50).default([]),
  }),
  async (data, context) => {
    const { token, prefix, hash } = newWebhookToken();
    const { data: bot, error } = await supabaseAdmin
      .from("chat_bots")
      .insert({
        name: data.name,
        description: data.description || null,
        webhook_token_hash: hash,
        webhook_token_prefix: prefix,
        created_by: context.userId,
      })
      .select("id, name, description, enabled, webhook_token_prefix, created_at")
      .single();
    if (error || !bot) throw new Error(error?.message ?? "Could not create bot.");
    if (data.conversationIds.length) {
      const { error: roomError } = await supabaseAdmin.from("chat_bot_rooms").insert(
        data.conversationIds.map((conversation_id) => ({ bot_id: bot.id, conversation_id })),
      );
      if (roomError) throw new Error(roomError.message);
    }
    return {
      id: bot.id as string,
      name: bot.name as string,
      description: (bot.description as string | null) ?? null,
      enabled: bot.enabled === true,
      webhookTokenPrefix: bot.webhook_token_prefix as string,
      createdAt: bot.created_at as string,
      roomIds: data.conversationIds,
      webhookToken: token,
      webhookPath: webhookPath(bot.id as string, token),
    } satisfies ChatBotRow;
  },
  { auth: { capability: "ember.manage" } },
);

export const rotateChatBotToken = createSafeAuthenticatedAction(
  z.object({ botId: botIdSchema }),
  async (data, context) => {
    const { token, prefix, hash } = newWebhookToken();
    const { data: bot, error } = await supabaseAdmin
      .from("chat_bots")
      .update({ webhook_token_hash: hash, webhook_token_prefix: prefix, updated_at: new Date().toISOString() })
      .eq("id", data.botId)
      .eq("created_by", context.userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bot) throw new Error("Bot not found.");
    return { webhookToken: token, webhookPath: webhookPath(data.botId, token), webhookTokenPrefix: prefix };
  },
  { auth: { capability: "ember.manage" } },
);

export const setChatBotRooms = createSafeAuthenticatedAction(
  z.object({
    botId: botIdSchema,
    conversationIds: z.array(conversationIdSchema).max(50),
  }),
  async (data, context) => {
    const { data: bot, error } = await supabaseAdmin
      .from("chat_bots")
      .select("id")
      .eq("id", data.botId)
      .eq("created_by", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bot) throw new Error("Bot not found.");
    await supabaseAdmin.from("chat_bot_rooms").delete().eq("bot_id", data.botId);
    if (data.conversationIds.length) {
      const { error: insertError } = await supabaseAdmin.from("chat_bot_rooms").insert(
        data.conversationIds.map((conversation_id) => ({ bot_id: data.botId, conversation_id })),
      );
      if (insertError) throw new Error(insertError.message);
    }
    return { botId: data.botId, roomIds: data.conversationIds };
  },
  { auth: { capability: "ember.manage" } },
);

export const setChatBotEnabled = createSafeAuthenticatedAction(
  z.object({ botId: botIdSchema, enabled: z.boolean() }),
  async (data, context) => {
    const { data: bot, error } = await supabaseAdmin
      .from("chat_bots")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", data.botId)
      .eq("created_by", context.userId)
      .select("id, enabled")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bot) throw new Error("Bot not found.");
    return { botId: data.botId, enabled: bot.enabled === true };
  },
  { auth: { capability: "ember.manage" } },
);

export const deleteChatBot = createSafeAuthenticatedAction(
  z.object({ botId: botIdSchema }),
  async (data, context) => {
    const { error } = await supabaseAdmin
      .from("chat_bots")
      .delete()
      .eq("id", data.botId)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { botId: data.botId };
  },
  { auth: { capability: "ember.manage" } },
);

/** Service-role path for public Slack webhook. */
export async function postSlackWebhookMessage(input: {
  botId: string;
  token: string;
  conversationId: string;
  text: string;
  attachments?: unknown;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const hash = hashToken(input.token);
  const { data: bot, error } = await supabaseAdmin
    .from("chat_bots")
    .select("id, name, enabled, created_by, webhook_token_hash")
    .eq("id", input.botId)
    .maybeSingle();
  if (error) return { ok: false, error: "server_error", status: 500 };
  if (!bot || bot.webhook_token_hash !== hash) return { ok: false, error: "invalid_token", status: 401 };
  if (bot.enabled !== true) return { ok: false, error: "bot_disabled", status: 403 };

  const { data: room, error: roomError } = await supabaseAdmin
    .from("chat_bot_rooms")
    .select("conversation_id")
    .eq("bot_id", input.botId)
    .eq("conversation_id", input.conversationId)
    .maybeSingle();
  if (roomError) return { ok: false, error: "server_error", status: 500 };
  if (!room) return { ok: false, error: "channel_not_found", status: 404 };

  const body = input.text.trim().slice(0, 8000);
  const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
  if (!body && !hasAttachments) return { ok: false, error: "no_text", status: 400 };

  let attachmentFallback = "";
  if (!body && hasAttachments) {
    const first = input.attachments?.[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const row = first as { fallback?: unknown; title?: unknown; text?: unknown };
      if (typeof row.fallback === "string") attachmentFallback = row.fallback;
      else if (typeof row.title === "string") attachmentFallback = row.title;
      else if (typeof row.text === "string") attachmentFallback = row.text;
    }
  }

  const metadata: Record<string, unknown> = {
    bot: true,
    bot_id: bot.id,
    bot_name: bot.name,
    source: "slack_webhook",
  };
  if (hasAttachments) metadata.attachments = input.attachments;

  const { error: insertError } = await supabaseAdmin.from("chat_messages").insert({
    conversation_id: input.conversationId,
    sender_id: bot.created_by,
    type: "TEXT",
    body: (body || attachmentFallback || "Bot update").slice(0, 8000),
    metadata,
    client_message_id: crypto.randomUUID(),
  });
  if (insertError) return { ok: false, error: "server_error", status: 500 };
  return { ok: true };
}
