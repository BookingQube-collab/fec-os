import { createHmac } from "node:crypto";

import { secretsEqual } from "@/lib/server/secret-equal";

import { metaAppSecret } from "./config";

/**
 * Meta webhook subscription challenge (hub.mode / hub.verify_token / hub.challenge).
 * Returns the challenge string on success, otherwise null.
 */
export function verifyMetaWebhookChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedToken: string;
}): string | null {
  const expected = input.expectedToken.trim();
  if (!expected) return null;
  if (input.mode !== "subscribe") return null;
  if (!input.challenge) return null;
  if (!input.token || !secretsEqual(input.token, expected)) return null;
  return input.challenge;
}

/**
 * Validate `X-Hub-Signature-256: sha256=<hex>` when META_APP_SECRET is set.
 * If the app secret is unset, returns true (dev-friendly) unless `requireSignature` is true.
 */
export function verifyMetaHubSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret?: string;
  requireSignature?: boolean;
}): boolean {
  const secret = (input.appSecret ?? metaAppSecret()).trim();
  const header = input.signatureHeader?.trim() || "";

  if (!secret) {
    return input.requireSignature ? false : true;
  }
  if (!header.startsWith("sha256=")) return false;

  const expectedHex = createHmac("sha256", secret).update(input.rawBody, "utf8").digest("hex");
  const providedHex = header.slice("sha256=".length).trim().toLowerCase();
  return secretsEqual(providedHex, expectedHex.toLowerCase());
}

export type ParsedInstagramInbound = {
  senderId: string;
  recipientId: string;
  mid: string;
  text: string;
  isEcho: boolean;
  timestamp: number;
};

/**
 * Parse Instagram Messaging webhook payloads.
 * Supports Messenger-style `entry[].messaging[]` and field-style `entry[].changes[].value`.
 */
export function parseInstagramInboundMessages(body: unknown): ParsedInstagramInbound[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const out: ParsedInstagramInbound[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const messaging = Array.isArray(e.messaging) ? e.messaging : [];
    for (const event of messaging) {
      const parsed = parseMessagingEvent(event);
      if (parsed) out.push(parsed);
    }

    const changes = Array.isArray(e.changes) ? e.changes : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;

      // Field webhook may nest a messaging-like object or a messages list.
      if (Array.isArray(v.messaging)) {
        for (const event of v.messaging) {
          const parsed = parseMessagingEvent(event);
          if (parsed) out.push(parsed);
        }
        continue;
      }

      const senderId = String((v.sender as { id?: string } | undefined)?.id ?? "").trim();
      const recipientId = String((v.recipient as { id?: string } | undefined)?.id ?? "").trim();
      const message = v.message as
        | { mid?: string; text?: string; is_echo?: boolean }
        | undefined;
      if (!senderId || !message) continue;
      out.push({
        senderId,
        recipientId,
        mid: String(message.mid ?? ""),
        text: String(message.text ?? "").trim() || "[non-text message]",
        isEcho: Boolean(message.is_echo),
        timestamp: Number(v.timestamp ?? Date.now()),
      });
    }
  }

  return out;
}

function parseMessagingEvent(event: unknown): ParsedInstagramInbound | null {
  if (!event || typeof event !== "object") return null;
  const m = event as {
    sender?: { id?: string };
    recipient?: { id?: string };
    timestamp?: number;
    message?: { mid?: string; text?: string; is_echo?: boolean };
  };
  const senderId = String(m.sender?.id ?? "").trim();
  if (!senderId || !m.message) return null;
  return {
    senderId,
    recipientId: String(m.recipient?.id ?? "").trim(),
    mid: String(m.message.mid ?? ""),
    text: String(m.message.text ?? "").trim() || "[non-text message]",
    isEcho: Boolean(m.message.is_echo),
    timestamp: Number(m.timestamp ?? Date.now()),
  };
}
