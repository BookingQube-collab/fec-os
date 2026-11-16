import { NextResponse } from "next/server";

import { loadSettingsRow } from "@/lib/call-center/db";
import { processSendPulseWebhookBody } from "@/lib/call-center/sendpulse-bridge";
import {
  assertSendPulseWebhookAuth,
  resolveSendPulseWebhookSecret,
} from "@/lib/call-center/sendpulse";

/**
 * SendPulse chatbot → FEC bridge (contacts + handoff tickets).
 *
 * POST /api/public/call-center/sendpulse
 *
 * Auth (SendPulse usually cannot set custom headers — prefer query secret):
 *   Authorization: Bearer <SENDPULSE_WEBHOOK_SECRET>
 *   X-SendPulse-Secret: <secret>
 *   ?secret=<secret>
 *
 * Configure in SendPulse → Bot Settings → Webhooks (or Action → Send webhook):
 *   https://<host>/api/public/call-center/sendpulse?secret=<SENDPULSE_WEBHOOK_SECRET>
 *
 * Track at least: Opened live chat (`open_chat`), Incoming messages (optional),
 * and any custom Action webhooks used for handoff.
 *
 * Chatbot automation stays in SendPulse. FEC stores phonebook contacts + tickets.
 * Default: separate WhatsApp numbers — no mirror into `/call-center/whatsapp`.
 * Opt-in same-number mirror: SENDPULSE_MIRROR_WHATSAPP_INBOX=true
 *
 * Local demo: POST ?demo=1 with a SendPulse-shaped array or flat
 * `{ "event":"open_chat","phone":"+97455550000","name":"Guest","summary":"..." }`.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    integration: "sendpulse",
    purpose: "chatbot_handoff_bridge",
    note: "Chatbot UI/flows stay in SendPulse. Use a separate WhatsApp number from FEC call-center WhatsApp. POST creates contacts/tickets; inbox mirror is off by default.",
    docs: "https://sendpulse.com/integrations/api/chatbot/webhooks",
  });
}

export async function POST(request: Request) {
  const settings = await loadSettingsRow();
  const expected = resolveSendPulseWebhookSecret(settings?.webhook_shared_secret);
  const denied = assertSendPulseWebhookAuth(request, { expectedSecret: expected });
  if (denied) return denied;

  const rawBody = await request.text();
  let body: unknown = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const { results, processed, whatsappPolicy } = await processSendPulseWebhookBody(body);
    return NextResponse.json({
      ok: true,
      source: "sendpulse",
      processed,
      results,
      whatsapp: {
        mode: whatsappPolicy.mode,
        mirrorInbox: whatsappPolicy.shouldMirrorInbox,
        sendpulseNumber: whatsappPolicy.sendpulseNumber || null,
        callCenterNumber: whatsappPolicy.callCenterNumber || null,
        numbersCollide: whatsappPolicy.numbersCollide,
        warnings: whatsappPolicy.warnings,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SendPulse bridge failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
