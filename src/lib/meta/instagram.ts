import {
  instagramIgUserId,
  instagramPageAccessToken,
  instagramPageId,
  metaGraphBaseUrl,
} from "./config";

export type InstagramSendResult =
  | { ok: true; messageId: string; recipientId: string }
  | { ok: false; error: string };

/**
 * Send an Instagram DM via Messenger Platform (Page ID + Page access token).
 * Recipient must be an Instagram-scoped ID (IGSID) from an inbound webhook —
 * you cannot cold-message arbitrary usernames.
 */
export async function sendInstagramText(input: {
  recipientId: string;
  body: string;
  pageId?: string;
  accessToken?: string;
}): Promise<InstagramSendResult> {
  const pageId = (input.pageId ?? instagramPageId() || "me").trim() || "me";
  const accessToken = (input.accessToken ?? instagramPageAccessToken()).trim();
  const recipientId = input.recipientId.trim();
  const body = input.body.trim();

  if (!accessToken || !recipientId || !body) {
    return {
      ok: false,
      error: "Instagram send missing page access token, recipient IGSID, or body.",
    };
  }
  if (body.length > 1000) {
    return { ok: false, error: "Instagram text body exceeds 1000 characters." };
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
    return { ok: false, error: e instanceof Error ? e.message : "Instagram send failed" };
  }
}

/**
 * Alternate send path using Instagram Login / IG user token
 * (`graph.facebook.com/{IG_USER_ID}/messages`). Prefer Page messaging when possible.
 */
export async function sendInstagramTextViaIgUser(input: {
  recipientId: string;
  body: string;
  igUserId?: string;
  accessToken?: string;
}): Promise<InstagramSendResult> {
  const igUserId = (input.igUserId ?? instagramIgUserId()).trim();
  if (!igUserId) {
    return { ok: false, error: "INSTAGRAM_IG_USER_ID is not set." };
  }
  return sendInstagramText({
    recipientId: input.recipientId,
    body: input.body,
    pageId: igUserId,
    accessToken: input.accessToken ?? instagramPageAccessToken(),
  });
}
