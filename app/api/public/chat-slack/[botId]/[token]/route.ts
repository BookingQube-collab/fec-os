import { NextResponse } from "next/server";

import { postSlackWebhookMessage } from "@/lib/chat/bots.functions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ botId: string; token: string }> };

/**
 * Slack-compatible incoming webhook (Ember parity on Vercel).
 * POST /api/public/chat-slack/:botId/:token?channel=:conversationId
 * Body: { "text": "..." } or form payload JSON.
 */
export async function POST(request: Request, context: Ctx) {
  const { botId, token } = await context.params;
  if (!botId || !token) {
    return new NextResponse("invalid_payload", { status: 400 });
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("channel") ?? url.searchParams.get("conversationId");
  if (!conversationId) {
    return new NextResponse("channel_not_found", { status: 404 });
  }

  let text = "";
  let attachments: unknown;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        text?: unknown;
        payload?: unknown;
        attachments?: unknown;
      };
      if (typeof body.text === "string") text = body.text;
      if (Array.isArray(body.attachments)) attachments = body.attachments;
      else if (typeof body.payload === "string") {
        const parsed = JSON.parse(body.payload) as { text?: unknown; attachments?: unknown };
        if (typeof parsed.text === "string") text = parsed.text;
        if (Array.isArray(parsed.attachments)) attachments = parsed.attachments;
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      const payload = form.get("payload");
      const direct = form.get("text");
      if (typeof direct === "string") text = direct;
      else if (typeof payload === "string") {
        const parsed = JSON.parse(payload) as { text?: unknown; attachments?: unknown };
        if (typeof parsed.text === "string") text = parsed.text;
        if (Array.isArray(parsed.attachments)) attachments = parsed.attachments;
      }
    } else {
      const raw = await request.text();
      if (raw.trim().startsWith("{")) {
        const parsed = JSON.parse(raw) as { text?: unknown; attachments?: unknown };
        if (typeof parsed.text === "string") text = parsed.text;
        if (Array.isArray(parsed.attachments)) attachments = parsed.attachments;
      }
    }
  } catch {
    return new NextResponse("invalid_payload", { status: 400 });
  }

  if (!text.trim() && !(Array.isArray(attachments) && attachments.length > 0)) {
    return new NextResponse("no_text", { status: 400 });
  }

  const result = await postSlackWebhookMessage({
    botId,
    token,
    conversationId,
    text,
    attachments,
  });

  if (!result.ok) {
    return new NextResponse(result.error, { status: result.status });
  }
  return new NextResponse("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
}
