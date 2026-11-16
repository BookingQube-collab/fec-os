import { metaGraphBaseUrl } from "./config";
import {
  parseInstagramInboundMessages,
  type ParsedInstagramInbound,
} from "./webhook";

export type ParsedMessengerInbound = ParsedInstagramInbound;

/** Facebook Messenger uses the same Page messaging webhook shape as Instagram. */
export function parseMessengerInboundMessages(body: unknown): ParsedMessengerInbound[] {
  return parseInstagramInboundMessages(body);
}

export type MessengerSendResult =
  | { ok: true; messageId: string; recipientId: string }
  | { ok: false; error: string };

/**
 * Send a Facebook Messenger text via Graph Page messages API.
 * Recipient must be a Page-scoped ID (PSID) from an inbound webhook.
 */
export async function sendMessengerText(input: {
  recipientId: string;
  body: string;
  pageId?: string;
  accessToken?: string;
}): Promise<MessengerSendResult> {
  const pageId = ((input.pageId ?? "") || "me").trim() || "me";
  const accessToken = (input.accessToken ?? "").trim();
  const recipientId = input.recipientId.trim();
  const body = input.body.trim();

  if (!accessToken || !recipientId || !body) {
    return {
      ok: false,
      error: "Messenger send missing page access token, recipient PSID, or body.",
    };
  }
  if (body.length > 2000) {
    return { ok: false, error: "Messenger text body exceeds 2000 characters." };
  }

  try {
    const response = await fetch(`${metaGraphBaseUrl()}/${encodeURIComponent(pageId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: body },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message_id?: string;
      recipient_id?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, error: payload.error?.message || `Meta Graph HTTP ${response.status}` };
    }
    return {
      ok: true,
      messageId: String(payload.message_id ?? ""),
      recipientId: String(payload.recipient_id ?? recipientId),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Messenger send failed" };
  }
}
