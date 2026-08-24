import "server-only";

import { generateStructuredOutput, generateText } from "@/lib/ai/gateway";
import type { AiMessage } from "@/lib/ai/types";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const AI_UNAVAILABLE_MESSAGE =
  "AI unavailable — configure a provider in Admin → AI Integrations.";

function parseJsonPayload(text: string): unknown {
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as unknown;
}

function toGatewayMessages(messages: ChatMessage[]): AiMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Prefer the admin-configured gateway (Gemini / Groq / OpenRouter).
 * Last-resort env fallback (GEMINI / GROQ / OPENROUTER, then LOVABLE / OPENAI)
 * lives inside the gateway so existing drafts keep working.
 */
export async function completeTextViaGateway(
  messages: ChatMessage[],
  options?: { temperature?: number; moduleSource?: string; jsonMode?: boolean },
): Promise<string | null> {
  try {
    const result = await generateText({
      messages: toGatewayMessages(messages),
      temperature: options?.temperature ?? 0.3,
      jsonMode: options?.jsonMode,
      moduleSource: options?.moduleSource ?? "unknown",
    });
    const text = result.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function completeJsonViaGateway(
  messages: ChatMessage[],
  options?: { temperature?: number; moduleSource?: string },
): Promise<unknown | null> {
  try {
    const result = await generateStructuredOutput({
      messages: toGatewayMessages(messages),
      temperature: options?.temperature ?? 0.3,
      jsonMode: true,
      moduleSource: options?.moduleSource ?? "unknown",
    });
    if (!result.text) return null;
    return parseJsonPayload(result.text);
  } catch {
    return null;
  }
}
