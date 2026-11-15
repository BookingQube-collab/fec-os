import "server-only";

import { loadSettingsRow } from "./db";
import type { CallCenterCall } from "./types";

/**
 * Fire optional account outbound webhook (Settings → webhookOutboundUrl).
 * Best-effort; never throws to callers.
 */
export async function emitCallCenterOutboundWebhook(input: {
  event: string;
  call: CallCenterCall;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    const settings = await loadSettingsRow();
    const url = settings?.webhook_outbound_url?.trim() ?? "";
    if (!url || !/^https?:\/\//i.test(url)) return;

    const body = {
      event: input.event,
      at: new Date().toISOString(),
      call: {
        id: input.call.id,
        direction: input.call.direction,
        status: input.call.status,
        fromE164: input.call.fromE164,
        toE164: input.call.toE164,
        queueId: input.call.queueId,
        agentUserId: input.call.agentUserId,
        provider: input.call.provider,
        livekitRoom: input.call.livekitRoom,
        startedAt: input.call.startedAt,
        answeredAt: input.call.answeredAt,
        endedAt: input.call.endedAt,
        talkSeconds: input.call.talkSeconds,
        hangupReason: input.call.hangupReason,
        tags: input.call.tags,
        dispositionCode: input.call.dispositionCode,
      },
      ...input.extra,
    };

    const secret = settings?.webhook_shared_secret?.trim() ?? "";
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}`, "X-Call-Center-Secret": secret } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}
