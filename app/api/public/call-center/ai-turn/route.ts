import { NextResponse } from "next/server";

import { processCallCenterAiTurn } from "@/lib/call-center/ai-session";
import { loadSettingsRow } from "@/lib/call-center/db";
import { createTelnyxClient, resolveTelnyxApiKey } from "@/lib/call-center/telnyx";
import { assertCallCenterWebhook } from "@/lib/call-center/webhook-auth";

/**
 * Live AI turn for Call Center first-answer / AI node.
 * POST /api/public/call-center/ai-turn
 *
 * Body: { callId, text | utterance, language? }
 * Auth: shared Call Center webhook secret (or ?demo=1 locally).
 *
 * Generates the agent reply via Admin → AI Integrations (Gemini → OpenRouter).
 * LiveKit Agents / tools should send STT text here instead of calling OpenAI.
 * On Telnyx Call Control legs, the reply is spoken with carrier TTS.
 */
export async function POST(request: Request) {
  const authError = await assertCallCenterWebhook(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const callId = typeof root.callId === "string" ? root.callId : "";
  const utterance =
    (typeof root.utterance === "string" && root.utterance) ||
    (typeof root.text === "string" && root.text) ||
    "";
  const language = typeof root.language === "string" ? root.language : undefined;

  if (!callId || !utterance.trim()) {
    return NextResponse.json(
      { ok: false, error: "Expected { callId, text } (or utterance)" },
      { status: 400 },
    );
  }

  try {
    const result = await processCallCenterAiTurn({
      callId,
      utterance,
      language,
    });

    let spoken = false;
    if (
      !result.handoff &&
      result.call.provider === "telnyx" &&
      result.call.providerCallId &&
      result.reply
    ) {
      try {
        const settings = await loadSettingsRow();
        const client = createTelnyxClient(resolveTelnyxApiKey(settings));
        await client.speak(
          result.call.providerCallId,
          result.reply.slice(0, 1500),
          { step: "ai_reply", callId },
          settings?.tts_voice ?? "",
        );
        spoken = true;
      } catch (e) {
        console.error(
          "[call-center/ai-turn] speak failed:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      callId: result.call.id,
      reply: result.reply,
      provider: result.provider,
      model: result.model,
      language: result.language,
      handoff: result.handoff,
      spoken,
      status: result.call.status,
      roomName: result.call.livekitRoom,
      offeredUserIds: result.routeResult?.offeredUserIds ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "AI turn failed" },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "fec-call-center-ai-turn",
    hint: "POST { callId, text } with Call Center webhook secret. Replies use Admin AI gateway (Gemini → OpenRouter).",
  });
}
