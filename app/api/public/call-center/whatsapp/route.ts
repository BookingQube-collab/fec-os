import { NextResponse } from "next/server";

import {
  loadSettingsRow,
  resolveWhatsappVerifyToken,
  upsertWhatsappInboundMessage,
} from "@/lib/call-center/db";

/**
 * Meta WhatsApp Cloud API webhook.
 * GET  /api/public/call-center/whatsapp — hub.verify_token challenge
 * POST /api/public/call-center/whatsapp — inbound message log
 *
 * Configure in Meta Developer Console → WhatsApp → Configuration:
 *   Callback URL: https://<host>/api/public/call-center/whatsapp
 *   Verify token: Call Center → WhatsApp settings (or WHATSAPP_VERIFY_TOKEN)
 *
 * Local demo without Meta: POST ?demo=1 with { from, text }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const settings = await loadSettingsRow();
  const expected = resolveWhatsappVerifyToken(settings);
  if (mode === "subscribe" && challenge && expected && token === expected) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const isDemo = url.searchParams.get("demo") === "1";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (isDemo) {
    const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const from = String(root.from ?? root.waId ?? "97455550000").replace(/\D/g, "");
    const text = String(root.text ?? root.body ?? "Demo WhatsApp message");
    const name = String(root.name ?? "Demo Customer");
    try {
      const result = await upsertWhatsappInboundMessage({
        waId: from,
        customerE164: from.startsWith("+") ? from : `+${from}`,
        customerName: name,
        body: text,
        waMessageId: `wamid.DEMO_${Date.now()}`,
        rawPayload: root,
      });
      return NextResponse.json({
        ok: true,
        conversationId: result.conversation.id,
        messageId: result.message.id,
      });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Demo ingest failed" },
        { status: 500 },
      );
    }
  }

  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const entries = Array.isArray(root.entry) ? root.entry : [];
  let saved = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? ((entry as { changes: unknown[] }).changes)
      : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const contactName =
        contacts[0] && typeof contacts[0] === "object"
          ? String(
              ((contacts[0] as { profile?: { name?: string } }).profile?.name ?? "") || "",
            )
          : "";

      for (const msg of messages) {
        if (!msg || typeof msg !== "object") continue;
        const m = msg as {
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
        };
        const from = String(m.from ?? "").replace(/\D/g, "");
        if (!from) continue;
        const text =
          m.type === "text"
            ? String(m.text?.body ?? "")
            : `[${m.type || "unsupported"} message]`;
        try {
          await upsertWhatsappInboundMessage({
            waId: from,
            customerE164: `+${from}`,
            customerName: contactName,
            body: text,
            waMessageId: String(m.id ?? ""),
            rawPayload: value,
          });
          saved += 1;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "ingest failed");
        }
      }
    }
  }

  // Meta expects 200 quickly even when nothing to process (status webhooks, etc.)
  return NextResponse.json({ ok: true, saved, errors: errors.slice(0, 5) });
}
