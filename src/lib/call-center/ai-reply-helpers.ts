import type { AiMessage } from "@/lib/ai/types";

import {
  E3_AI_SYSTEM_PROMPT_AR,
  E3_AI_SYSTEM_PROMPT_EN,
  E3_AI_WELCOME_AR,
  E3_AI_WELCOME_EN,
  refreshStaleE3ArabicPrompt,
} from "./e3-ivr-prompt";
import type { CallCenterAiProvider, CallCenterSettingsRow } from "./types";

export type CallCenterAiLanguage = "en" | "ar" | "auto";

export type CallCenterAiHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

/** Providers that generate replies through Admin → AI Integrations (`generateText`). */
export function usesAdminAiGateway(provider: CallCenterAiProvider | string | null | undefined): boolean {
  return provider === "admin_gateway" || !provider;
}

export function parseHandoffKeywords(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,;\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the caller utterance asks for a human (keyword list from settings). */
export function utteranceRequestsHandoff(
  utterance: string,
  keywords: string | string[] | null | undefined,
): boolean {
  const text = utterance.trim().toLowerCase();
  if (!text) return false;
  const list = Array.isArray(keywords)
    ? keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
    : parseHandoffKeywords(keywords);
  if (list.length === 0) return false;
  return list.some((kw) => text.includes(kw));
}

export function resolveCallCenterAiLanguage(
  preferred: CallCenterAiLanguage | string | null | undefined,
  utterance?: string,
): "en" | "ar" {
  if (preferred === "ar" || preferred === "en") return preferred;
  const sample = `${utterance ?? ""}`;
  if (/[\u0600-\u06FF]/.test(sample)) return "ar";
  return "en";
}

export function resolveCallCenterAiWelcome(input: {
  settings: CallCenterSettingsRow | null;
  language: "en" | "ar";
  nodeWelcome?: string | null;
}): string {
  const node = input.nodeWelcome?.trim() ?? "";
  if (node) {
    return input.language === "ar" ? refreshStaleE3ArabicPrompt(node) : node;
  }
  if (input.language === "ar") {
    return refreshStaleE3ArabicPrompt(
      input.settings?.ai_welcome_ar?.trim() || E3_AI_WELCOME_AR,
    );
  }
  return input.settings?.ai_welcome_en?.trim() || E3_AI_WELCOME_EN;
}

export function resolveCallCenterAiSystemPrompt(input: {
  settings: CallCenterSettingsRow | null;
  language: "en" | "ar";
  nodePrompt?: string | null;
}): string {
  const node = input.nodePrompt?.trim() ?? "";
  if (node) return node;
  const fromLang =
    input.language === "ar"
      ? input.settings?.ai_system_prompt_ar?.trim()
      : input.settings?.ai_system_prompt_en?.trim();
  if (fromLang) return fromLang;
  return (
    input.settings?.ai_notes?.trim() ||
    (input.language === "ar" ? E3_AI_SYSTEM_PROMPT_AR : E3_AI_SYSTEM_PROMPT_EN)
  );
}

export function buildCallCenterAiMessages(input: {
  system: string;
  welcome?: string;
  history?: CallCenterAiHistoryItem[];
  utterance: string;
}): AiMessage[] {
  const messages: AiMessage[] = [{ role: "system", content: input.system }];
  const welcome = input.welcome?.trim() ?? "";
  if (welcome) messages.push({ role: "assistant", content: welcome });
  for (const item of input.history ?? []) {
    const content = item.content.trim();
    if (!content) continue;
    messages.push({ role: item.role, content });
  }
  messages.push({ role: "user", content: input.utterance.trim() });
  return messages;
}

/** Prompt spoken after welcome on Telnyx Call Control (digit gather — no STT yet). */
export function adminGatewayGatherPrompt(language: "en" | "ar"): string {
  return language === "ar"
    ? "عشان تتكلم مع موظف، اضغط صفر. أو انتظر للمساعدة الآلية."
    : "To speak with a human agent, press zero. Otherwise stay on the line for AI assistance.";
}
