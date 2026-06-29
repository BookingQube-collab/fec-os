"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";
import {
  NOTIFICATION_PROVIDERS,
  providerForChannel,
  type NotificationChannel,
} from "@/lib/notifications/providers";

export interface EscalationRow {
  id: string;
  location_id: string;
  source: string;
  title: string;
  detail: string | null;
  severity: string;
  status: string;
  due_at: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  category: string;
  title: string;
  body: string | null;
  severity: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
  location_id: string | null;
}

const CATEGORIES = [
  "general",
  "escalation",
  "kpi",
  "sop",
  "compliance",
  "snag",
  "inventory",
] as const;

/** Legacy escalation bell — unchanged API for top bar. */
export const listEscalations = createAuthenticatedActionNoInput(
  async (context): Promise<EscalationRow[]> => {
    const { data, error } = await context.supabase
      .from("escalations")
      .select("id, location_id, source, title, detail, severity, status, due_at, created_at")
      .neq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    return data ?? [];
  },
  { auth: { capability: "issues.view" } },
);

export const ackEscalation = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("escalations")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "issues.assign" } },
);

export const listNotifications = createAuthenticatedAction(
  z
    .object({
      unreadOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(30),
    })
    .default({}),
  async (data, context) => {
    let q = context.supabase
      .from("notifications")
      .select("id, category, title, body, severity, action_url, read_at, created_at, location_id")
      .eq("user_id", context.userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.unreadOnly) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as NotificationRow[];
  },
  { defaultInput: {}, auth: { capability: "notifications.view" } },
);

export const markNotificationRead = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "notifications.view" } },
);

export const markAllNotificationsRead = createAuthenticatedActionNoInput(
  async (context) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "notifications.view" } },
);

export const getNotificationPreferences = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .order("category");
    if (error) throw error;
    return data ?? [];
  },
  { auth: { capability: "notifications.manage_preferences" } },
);

export const upsertNotificationPreference = createAuthenticatedAction(
  z.object({
    category: z.enum(CATEGORIES),
    channelInApp: z.boolean().default(true),
    channelEmail: z.boolean().default(false),
    channelSms: z.boolean().default(false),
    channelWhatsapp: z.boolean().default(false),
  }),
  async (data, context) => {
    const { error } = await context.supabase.from("notification_preferences").upsert(
      {
        user_id: context.userId,
        category: data.category,
        channel_in_app: data.channelInApp,
        channel_email: data.channelEmail,
        channel_sms: data.channelSms,
        channel_whatsapp: data.channelWhatsapp,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,category" },
    );
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "notifications.manage_preferences" } },
);

export const createUserNotification = createAuthenticatedAction(
  z.object({
    userId: z.string().uuid(),
    locationId: z.string().uuid().nullable().optional(),
    category: z.enum(CATEGORIES).default("general"),
    title: z.string().min(1).max(200),
    body: z.string().max(2000).optional(),
    severity: z.enum(["info", "warning", "critical"]).default("info"),
    actionUrl: z.string().max(500).optional(),
    sourceType: z.string().max(50).optional(),
    sourceId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("notifications")
      .insert({
        user_id: data.userId,
        location_id: data.locationId ?? null,
        category: data.category,
        title: data.title,
        body: data.body ?? null,
        severity: data.severity,
        action_url: data.actionUrl ?? null,
        source_type: data.sourceType ?? null,
        source_id: data.sourceId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;

    await dispatchNotificationChannels(context, row.id, data.userId, {
      category: data.category,
      title: data.title,
      body: data.body,
      actionUrl: data.actionUrl,
    });

    return { id: row.id };
  },
  { auth: { minRoleLevel: 70 } },
);

async function dispatchNotificationChannels(
  context: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>,
  notificationId: string,
  userId: string,
  payload: {
    category: string;
    title: string;
    body?: string;
    actionUrl?: string;
  },
) {
  const { data: prefs } = await context.supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("category", payload.category)
    .maybeSingle();

  const channels: Array<{ channel: NotificationChannel; enabled: boolean }> = [
    { channel: "in_app", enabled: prefs?.channel_in_app ?? true },
    { channel: "email", enabled: prefs?.channel_email ?? false },
    { channel: "sms", enabled: prefs?.channel_sms ?? false },
    { channel: "whatsapp", enabled: prefs?.channel_whatsapp ?? false },
  ];

  for (const { channel, enabled } of channels) {
    if (!enabled && channel !== "in_app") continue;
    const provider = providerForChannel(channel) ?? NOTIFICATION_PROVIDERS[0];
    const result = await provider.dispatch({
      notificationId,
      userId,
      title: payload.title,
      body: payload.body ?? null,
      actionUrl: payload.actionUrl ?? null,
    });

    await context.supabase.from("notification_delivery_logs").insert({
      notification_id: notificationId,
      channel,
      provider: result.provider,
      status: result.status,
      provider_ref: result.providerRef ?? null,
      error_message: result.errorMessage ?? null,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    });
  }
}

export const getNotificationUnreadCount = createAuthenticatedActionNoInput(
  async (context) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null)
      .is("dismissed_at", null);
    if (error) throw error;
    return { count: count ?? 0 };
  },
  { auth: { capability: "notifications.view" } },
);
