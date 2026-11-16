import { NextResponse } from "next/server";

import {
  getMetaConfigStatus,
  metaSendSecret,
  sendInstagramText,
  sendWhatsappText,
} from "@/lib/meta";
import { secretsEqual } from "@/lib/server/secret-equal";

export const runtime = "nodejs";

/**
 * Protected outbound helper for Meta channels (WhatsApp Cloud + Instagram Messaging).
 * POST /api/public/meta/send
 * Auth: Authorization: Bearer <META_SEND_SECRET|CRON_SECRET>
 *   or header X-Meta-Send-Secret / query ?secret=
 *
 * Body:
 *   { "channel": "whatsapp", "to": "+974…", "text": "…" }
 *   { "channel": "instagram", "to": "<IGSID>", "text": "…" }
 */
function authorize(request: Request): boolean {
  const expected = metaSendSecret();
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const custom = request.headers.get("x-meta-send-secret")?.trim() ?? "";
  const url = new URL(request.url);
  const query = url.searchParams.get("secret")?.trim() ?? "";

  return (
    (bearer.length > 0 && secretsEqual(bearer, expected)) ||
    (custom.length > 0 && secretsEqual(custom, expected)) ||
    (query.length > 0 && secretsEqual(query, expected))
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: {
      method: "POST",
      auth: "Bearer META_SEND_SECRET (or CRON_SECRET)",
      body: {
        whatsapp: { channel: "whatsapp", to: "+97455551234", text: "Hello" },
        instagram: { channel: "instagram", to: "<IGSID from inbound webhook>", text: "Hello" },
      },
    },
    config: getMetaConfigStatus(),
  });
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Set META_SEND_SECRET or CRON_SECRET and pass Bearer token." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const channel = String(root.channel ?? "").trim().toLowerCase();
  const to = String(root.to ?? root.recipientId ?? root.waId ?? "").trim();
  const text = String(root.text ?? root.body ?? "").trim();

  if (!channel || !to || !text) {
    return NextResponse.json(
      { ok: false, error: "Required: channel (whatsapp|instagram), to, text" },
      { status: 400 },
    );
  }

  if (channel === "whatsapp") {
    const result = await sendWhatsappText({ to, body: text });
    return NextResponse.json(
      result.ok
        ? { ok: true, channel, waMessageId: result.waMessageId }
        : { ok: false, channel, error: result.error },
      { status: result.ok ? 200 : 502 },
    );
  }

  if (channel === "instagram") {
    const result = await sendInstagramText({ recipientId: to, body: text });
    return NextResponse.json(
      result.ok
        ? { ok: true, channel, messageId: result.messageId, recipientId: result.recipientId }
        : { ok: false, channel, error: result.error },
      { status: result.ok ? 200 : 502 },
    );
  }

  return NextResponse.json(
    { ok: false, error: "channel must be whatsapp or instagram" },
    { status: 400 },
  );
}
