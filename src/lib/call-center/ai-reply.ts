import "server-only";

import { generateText } from "@/lib/ai/gateway";

import {
  buildCallCenterAiMessages,
  resolveCallCenterAiLanguage,
  resolveCallCenterAiSystemPrompt,
  resolveCallCenterAiWelcome,
  utteranceRequestsHandoff,
  type CallCenterAiHistoryItem,
  type CallCenterAiLanguage,
} from "./ai-reply-helpers";
import { gatewayModelForCallCenter } from "./gateway-model";
import type { CallCenterSettingsRow } from "./types";

export {
  adminGatewayGatherPrompt,
  buildCallCenterAiMessages,
  parseHandoffKeywords,
  resolveCallCenterAiLanguage,
  resolveCallCenterAiSystemPrompt,
  resolveCallCenterAiWelcome,
  utteranceRequestsHandoff,
  usesAdminAiGateway,
  type CallCenterAiHistoryItem,
  type CallCenterAiLanguage,
} from "./ai-reply-helpers";

export type GenerateCallCenterAiReplyInput = {
  settings: CallCenterSettingsRow | null;
  utterance: string;
  language?: CallCenterAiLanguage | string | null;
  history?: CallCenterAiHistoryItem[];
  systemPromptOverride?: string | null;
  welcomeOverride?: string | null;
  moduleSource?: string;
};

export type GenerateCallCenterAiReplyResult = {
  text: string;
  model: string;
  provider: string;
  language: "en" | "ar";
  handoffRequested: boolean;
};

/**
 * Generate a call-center agent reply via Admin → AI Integrations (Gemini → OpenRouter).
 * Does not use Call Center's dedicated OpenAI key — that path is for external voice workers.
 */
export async function generateCallCenterAiReply(
  input: GenerateCallCenterAiReplyInput,
): Promise<GenerateCallCenterAiReplyResult> {
  const language = resolveCallCenterAiLanguage(input.language, input.utterance);
  const handoffRequested = utteranceRequestsHandoff(
    input.utterance,
    input.settings?.ai_handoff_keywords,
  );
  if (handoffRequested && input.settings?.ai_handoff_enabled !== false) {
    const text =
      language === "ar"
        ? "أكيد، بنوصلك بأحد الموظفين الحين."
        : "Of course — I will connect you to a team member now.";
    return {
      text,
      model: "handoff",
      provider: "rules",
      language,
      handoffRequested: true,
    };
  }

  const system = resolveCallCenterAiSystemPrompt({
    settings: input.settings,
    language,
    nodePrompt: input.systemPromptOverride,
  });
  const welcome = resolveCallCenterAiWelcome({
    settings: input.settings,
    language,
    nodeWelcome: input.welcomeOverride,
  });
  const result = await generateText({
    moduleSource: input.moduleSource ?? "call_center_ai",
    model: gatewayModelForCallCenter(input.settings?.ai_model),
    messages: buildCallCenterAiMessages({
      system,
      welcome,
      history: input.history,
      utterance: input.utterance,
    }),
    temperature: 0.4,
  });
  return {
    text: result.text.trim(),
    model: result.model,
    provider: result.provider,
    language,
    handoffRequested: false,
  };
}
