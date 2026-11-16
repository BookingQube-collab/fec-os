import { NextResponse } from "next/server";

import { ingestOmniInboundHandoff } from "@/lib/call-center/omni-bridge";
import {
  loadSettingsRow,
  resolveMessengerSettingsAccessToken,
  resolveMessengerSettingsPageId,
  resolveMessengerSettingsVerifyToken,
} from "@/lib/call-center/db";
import { parseMessengerInboundMessages, sendMessengerText } from "@/lib/meta/messenger";
import {
  getMetaConfigStatus,
  isMetaAutoReplyEnabled,
  getMetaAutoReplyText,
  verifyMetaHubSignature,
  verifyMetaWebhookChallenge,
} from "@/lib/meta";

export const runtime = "nodejs";

/**
 * Facebook Messenger webhook (Meta Page Messaging).
 *
 * GET  /api/public/meta/messenger — hub.verify_token challenge (+ ?status=1)
 * POST /api/public/meta/messenger — inbound messages → omni tickets/contacts
 *
 * Callback URL: https://<host>/api/public/meta/messenger
 * Demo: POST ?demo=1 with { senderId, text }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("status") === "1") {
    const settings = await loadSettingsRow().catch(() => null);
    return NextResponse.json({
      ok: true,
      channel: "facebook_messenger",
      config: getMetaConfigStatus(),
      settings: {
        enabled: Boolean(settings?.messenger_enabled),
        pageIdSet: Boolean(resolveMessengerSettingsPageId(settings)),
        accessTokenSet: Boolean(resolveMessengerSettingsAccessToken(settings)),
        verifyTokenSet: Boolean(resolveMessengerSettingsVerifyToken(settings)),
      },
    });
  }

  const settings = await loadSettingsRow().catch(() => null);
  const challenge = verifyMetaWebhookChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    expectedToken: resolveMessengerSettingsVerifyToken(settings),
  });
  if (challenge !== null) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const isDemo = url.searchParams.get("demo") === "1";
  const rawBody = await request.text();

  if (!isDemo) {
    const signatureOk = verifyMetaHubSignature({
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
      requireSignature: Boolean(process.env.META_REQUIRE_WEBHOOK_SIGNATURE?.trim()),
    });
    if (!signatureOk) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const settings = await loadSettingsRow().catch(() => null);
  const accessToken = resolveMessengerSettingsAccessToken(settings);
  const pageId = resolveMessengerSettingsPageId(settings) || "me";

  const messages = isDemo
    ? (() => {
        const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        return [
          {
            senderId: String(root.senderId ?? root.from ?? "demo_psid").trim(),
            recipientId: pageId,
            mid: String(root.mid ?? `fb.DEMO_${Date.now()}`),
            text: String(root.text ?? root.body ?? "Demo Messenger message").trim(),
            isEcho: false,
            timestamp: Date.now(),
          },
        ];
      })()
    : parseMessengerInboundMessages(body);

  let received = 0;
  let tickets = 0;
  let autoReplies = 0;
  const errors: string[] = [];

  for (const msg of messages) {
    received += 1;
    if (msg.isEcho) continue;

    try {
      await ingestOmniInboundHandoff({
        source: "facebook_messenger",
        channel: "messenger",
        eventTitle: "inbound_message",
        externalThreadId: msg.senderId,
        externalMessageId: msg.mid || `fb:${msg.senderId}:${msg.timestamp}`,
        customerExternalId: msg.senderId,
        customerName: "",
        lastMessage: msg.text,
        summary: "Facebook Messenger inbound",
        metadata: { pageId, demo: isDemo },
      });
      tickets += 1;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "ticket_failed");
    }

    if (isMetaAutoReplyEnabled() && accessToken && msg.text) {
      const sent = await sendMessengerText({
        recipientId: msg.senderId,
        body: getMetaAutoReplyText(),
        pageId,
        accessToken,
      });
      if (sent.ok) autoReplies += 1;
      else if (sent.error) errors.push(sent.error);
    }
  }

  return NextResponse.json({
    ok: true,
    demo: isDemo || undefined,
    received,
    tickets,
    autoReplies,
    errors: errors.slice(0, 5),
  });
}
