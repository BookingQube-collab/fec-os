import "server-only";

import {
  resolveM365ClientId,
  resolveM365ClientSecret,
  resolveM365ClientState,
  resolveM365Mailbox,
  resolveM365TenantId,
} from "./omni";

export type M365GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
  clientState: string;
};

export function resolveM365GraphConfig(input?: {
  tenantId?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  mailbox?: string | null;
  clientState?: string | null;
}): M365GraphConfig | null {
  const tenantId = resolveM365TenantId(input?.tenantId);
  const clientId = resolveM365ClientId(input?.clientId);
  const clientSecret = resolveM365ClientSecret(input?.clientSecret);
  const mailbox = resolveM365Mailbox(input?.mailbox);
  if (!tenantId || !clientId || !clientSecret || !mailbox) return null;
  return {
    tenantId,
    clientId,
    clientSecret,
    mailbox,
    clientState: resolveM365ClientState(input?.clientState),
  };
}

type TokenCache = { token: string; expiresAt: number };
const tokenCacheByKey = new Map<string, TokenCache>();

export async function acquireM365AccessToken(config: M365GraphConfig): Promise<string> {
  const cacheKey = `${config.tenantId}:${config.clientId}`;
  const cached = tokenCacheByKey.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || `M365 token HTTP ${response.status}`,
    );
  }
  const expiresIn = Number(payload.expires_in ?? 3600);
  tokenCacheByKey.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return payload.access_token;
}

export type M365MailMessage = {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  bodyText: string;
  fromEmail: string;
  fromName: string;
  receivedAt: string;
  internetMessageId: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function mapGraphMailMessage(raw: unknown): M365MailMessage | null {
  const row = asRecord(raw);
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const from = asRecord(asRecord(row.from).emailAddress);
  const body = asRecord(row.body);
  const bodyContent = String(body.content ?? "").trim();
  const bodyType = String(body.contentType ?? "text").toLowerCase();
  const bodyText =
    bodyType === "html"
      ? bodyContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : bodyContent;
  return {
    id,
    conversationId: String(row.conversationId ?? id).trim() || id,
    subject: String(row.subject ?? "").trim(),
    bodyPreview: String(row.bodyPreview ?? "").trim(),
    bodyText: bodyText || String(row.bodyPreview ?? "").trim(),
    fromEmail: String(from.address ?? "").trim().toLowerCase(),
    fromName: String(from.name ?? "").trim(),
    receivedAt: String(row.receivedDateTime ?? new Date().toISOString()),
    internetMessageId: String(row.internetMessageId ?? "").trim(),
  };
}

async function graphFetch<T>(
  config: M365GraphConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await acquireM365AccessToken(config);
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Graph HTTP ${response.status}`);
  }
  return payload;
}

export async function fetchM365MessageById(
  config: M365GraphConfig,
  messageId: string,
): Promise<M365MailMessage | null> {
  const id = messageId.trim();
  if (!id) return null;
  const raw = await graphFetch<unknown>(
    config,
    `/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(id)}?$select=id,conversationId,subject,bodyPreview,body,from,receivedDateTime,internetMessageId`,
  );
  return mapGraphMailMessage(raw);
}

export async function listRecentM365Messages(
  config: M365GraphConfig,
  limit = 25,
): Promise<M365MailMessage[]> {
  const top = Math.max(1, Math.min(50, limit));
  const payload = await graphFetch<{ value?: unknown[] }>(
    config,
    `/users/${encodeURIComponent(config.mailbox)}/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,receivedDateTime,internetMessageId`,
  );
  return (payload.value ?? [])
    .map(mapGraphMailMessage)
    .filter((m): m is M365MailMessage => Boolean(m));
}

export async function sendM365Reply(input: {
  config: M365GraphConfig;
  messageId: string;
  body: string;
  replyAll?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const messageId = input.messageId.trim();
  const body = input.body.trim();
  if (!messageId || !body) return { ok: false, error: "M365 reply missing message id or body." };
  try {
    const path = input.replyAll
      ? `/users/${encodeURIComponent(input.config.mailbox)}/messages/${encodeURIComponent(messageId)}/replyAll`
      : `/users/${encodeURIComponent(input.config.mailbox)}/messages/${encodeURIComponent(messageId)}/reply`;
    await graphFetch(input.config, path, {
      method: "POST",
      body: JSON.stringify({ comment: body }),
    });
    return { ok: true, id: `reply:${messageId}:${Date.now()}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "M365 reply failed" };
  }
}

export async function ensureM365MailSubscription(input: {
  config: M365GraphConfig;
  notificationUrl: string;
  existingSubscriptionId?: string | null;
}): Promise<{ id: string; expirationDateTime: string }> {
  const expirationDateTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const resource = `/users/${input.config.mailbox}/mailFolders('Inbox')/messages`;
  const payload = {
    changeType: "created",
    notificationUrl: input.notificationUrl,
    resource,
    expirationDateTime,
    clientState: input.config.clientState || undefined,
  };

  if (input.existingSubscriptionId?.trim()) {
    try {
      const renewed = await graphFetch<{ id?: string; expirationDateTime?: string }>(
        input.config,
        `/subscriptions/${encodeURIComponent(input.existingSubscriptionId.trim())}`,
        {
          method: "PATCH",
          body: JSON.stringify({ expirationDateTime }),
        },
      );
      return {
        id: String(renewed.id ?? input.existingSubscriptionId),
        expirationDateTime: String(renewed.expirationDateTime ?? expirationDateTime),
      };
    } catch {
      // Fall through to create.
    }
  }

  const created = await graphFetch<{ id?: string; expirationDateTime?: string }>(
    input.config,
    "/subscriptions",
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!created.id) throw new Error("Graph subscription create returned no id.");
  return {
    id: created.id,
    expirationDateTime: String(created.expirationDateTime ?? expirationDateTime),
  };
}
