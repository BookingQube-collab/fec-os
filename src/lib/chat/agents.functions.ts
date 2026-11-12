"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createSafeAuthenticatedAction, createSafeAuthenticatedActionNoInput } from "@/lib/server/create-action";

const mentionSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,31}$/, "Use a lowercase mention like support_bot.");

export type ChatAgentRow = {
  id: string;
  mentionKey: string;
  displayName: string;
  instructions: string;
  modelKey: string | null;
  enabled: boolean;
  createdAt: string;
};

export const listChatAgents = createSafeAuthenticatedActionNoInput(async () => {
  const { data, error } = await supabaseAdmin
    .from("chat_agents")
    .select("id, mention_key, display_name, instructions, model_key, enabled, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (row): ChatAgentRow => ({
      id: row.id as string,
      mentionKey: row.mention_key as string,
      displayName: row.display_name as string,
      instructions: (row.instructions as string) ?? "",
      modelKey: (row.model_key as string | null) ?? null,
      enabled: row.enabled === true,
      createdAt: row.created_at as string,
    }),
  );
}, { auth: { capability: "ember.manage" } });

export const createChatAgent = createSafeAuthenticatedAction(
  z.object({
    mentionKey: mentionSchema,
    displayName: z.string().trim().min(1).max(80),
    instructions: z.string().trim().max(8000).default(""),
    modelKey: z.string().trim().max(120).optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await supabaseAdmin
      .from("chat_agents")
      .insert({
        mention_key: data.mentionKey,
        display_name: data.displayName,
        instructions: data.instructions,
        model_key: data.modelKey || null,
        created_by: context.userId,
      })
      .select("id, mention_key, display_name, instructions, model_key, enabled, created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not create agent.");
    return {
      id: row.id as string,
      mentionKey: row.mention_key as string,
      displayName: row.display_name as string,
      instructions: (row.instructions as string) ?? "",
      modelKey: (row.model_key as string | null) ?? null,
      enabled: row.enabled === true,
      createdAt: row.created_at as string,
    } satisfies ChatAgentRow;
  },
  { auth: { capability: "ember.manage" } },
);

export const updateChatAgent = createSafeAuthenticatedAction(
  z.object({
    agentId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(80).optional(),
    instructions: z.string().trim().max(8000).optional(),
    modelKey: z.string().trim().max(120).nullable().optional(),
    enabled: z.boolean().optional(),
  }),
  async (data, context) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.instructions !== undefined) patch.instructions = data.instructions;
    if (data.modelKey !== undefined) patch.model_key = data.modelKey;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { data: row, error } = await supabaseAdmin
      .from("chat_agents")
      .update(patch)
      .eq("id", data.agentId)
      .eq("created_by", context.userId)
      .select("id, mention_key, display_name, instructions, model_key, enabled, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Agent not found.");
    return {
      id: row.id as string,
      mentionKey: row.mention_key as string,
      displayName: row.display_name as string,
      instructions: (row.instructions as string) ?? "",
      modelKey: (row.model_key as string | null) ?? null,
      enabled: row.enabled === true,
      createdAt: row.created_at as string,
    } satisfies ChatAgentRow;
  },
  { auth: { capability: "ember.manage" } },
);

export const deleteChatAgent = createSafeAuthenticatedAction(
  z.object({ agentId: z.string().uuid() }),
  async (data, context) => {
    const { error } = await supabaseAdmin
      .from("chat_agents")
      .delete()
      .eq("id", data.agentId)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { agentId: data.agentId };
  },
  { auth: { capability: "ember.manage" } },
);

const MENTION_RE = /(?:^|\s)@([a-z][a-z0-9_]{1,31})\b/gi;

/** After a user message, optionally post a stub/AI agent reply when @mention matches. */
export async function maybeReplyAsChatAgent(input: {
  conversationId: string;
  body: string;
  senderUserId: string;
}): Promise<void> {
  const keys = new Set<string>();
  for (const match of input.body.matchAll(MENTION_RE)) {
    if (match[1]) keys.add(match[1].toLowerCase());
  }
  if (keys.size === 0) return;

  const { data: agents, error } = await supabaseAdmin
    .from("chat_agents")
    .select("id, mention_key, display_name, instructions, enabled, created_by")
    .eq("enabled", true)
    .in("mention_key", [...keys]);
  if (error || !agents?.length) return;

  for (const agent of agents) {
    const reply =
      `[@${agent.mention_key}] ${agent.display_name}: ` +
      (agent.instructions?.trim()
        ? `Noted. (Agent instructions loaded — wire model reply via Admin AI. Preview: ${String(agent.instructions).slice(0, 240)})`
        : "I'm online. Add instructions on the Agents tab to shape replies.");
    await supabaseAdmin.from("chat_messages").insert({
      conversation_id: input.conversationId,
      sender_id: agent.created_by,
      type: "TEXT",
      body: reply.slice(0, 8000),
      metadata: {
        agent: true,
        agent_id: agent.id,
        agent_mention: agent.mention_key,
        reply_to_user_id: input.senderUserId,
      },
      client_message_id: crypto.randomUUID(),
    });
  }
}
