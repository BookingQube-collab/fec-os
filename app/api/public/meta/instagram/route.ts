import { NextResponse } from "next/server";

import { ingestOmniInboundHandoff } from "@/lib/call-center/omni-bridge";
import {
  loadSettingsRow,
  resolveInstagramPageAccessToken,
  resolveInstagramPageId,
  resolveInstagramVerifyToken,
} from "@/lib/call-center/db";
import {
  getMetaConfigStatus,
  maybeAutoReplyInstagram,
  parseInstagramInboundMessages,
  verifyMetaHubSignature,
  verifyMetaWebhookChallenge,
} from "@/lib/meta";

export const runtime = "nodejs";

/**
 * Meta Instagram Messaging webhook (official Graph / Messenger Platform).
 *
 * GET  /api/public/meta/instagram — hub.verify_token challenge
 * POST /api/public/meta/instagram — inbound DMs (+ optional auto-reply)
 *
 * Credentials: Call Center → Settings → Instagram (DB) preferred, else INSTAGRAM_* / META_* env.
 * Callback URL: https://<host>/api/public/meta/instagram
 *
 * Local demo without Meta: POST ?demo=1 with { senderId, text }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("status") === "1") {
    const settings = await loadSettingsRow().catch(() => null);
    return NextResponse.json({
      ok: true,
      channel: "instagram",
      config: getMetaConfigStatus(),
      settings: {
        enabled: Boolean(settings?.instagram_enabled),
        pageIdSet: Boolean(resolveInstagramPageId(settings)),
        accessTokenSet: Boolean(resolveInstagramPageAccessToken(settings)),
        verifyTokenSet: Boolean(resolveInstagramVerifyToken(settings)),
      },
    });
  }

  const settings = await loadSettingsRow().catch(() => null);
  const challenge = verifyMetaWebhookChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    expectedToken: resolveInstagramVerifyToken(settings),
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
  const accessToken = resolveInstagramPageAccessToken(settings);
  const pageId = resolveInstagramPageId(settings) || "me";

  const messages = isDemo
    ? (() => {
        const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        return [
          {
            senderId: String(root.senderId ?? root.from ?? "demo_igsid").trim(),
            recipientId: pageId,
            mid: String(root.mid ?? `ig.DEMO_${Date.now()}`),
            text: String(root.text ?? root.body ?? "Demo Instagram message").trim(),
            isEcho: false,
            timestamp: Date.now(),
          },
        ];
      })()
    : parseInstagramInboundMessages(body);

  let received = 0;
  let tickets = 0;
  let autoReplies = 0;
  const errors: string[] = [];

  for (const msg of messages) {
    received += 1;
    if (msg.isEcho) continue;

    try {
      await ingestOmniInboundHandoff({
        source: "instagram",
        channel: "instagram",
        eventTitle: "inbound_message",
        externalThreadId: msg.senderId,
        externalMessageId: msg.mid || `ig:${msg.senderId}:${msg.timestamp}`,
        customerExternalId: msg.senderId,
        lastMessage: msg.text,
        summary: "Instagram inbound",
        metadata: { pageId, demo: isDemo },
      });
      tickets += 1;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "ticket_failed");
    }

    const auto = await maybeAutoReplyInstagram({
      recipientId: msg.senderId,
      mid: msg.mid,
      isEcho: msg.isEcho,
      accessToken: accessToken || undefined,
      pageId,
    });
    if (auto.sent) autoReplies += 1;
    if (auto.attempted && !auto.sent && auto.error) errors.push(auto.error);
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
