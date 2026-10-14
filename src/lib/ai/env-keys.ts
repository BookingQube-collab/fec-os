import { AI_PROVIDER_CODES, type AiProviderCode } from "@/lib/ai/types";

const ENV_NAME: Record<AiProviderCode, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function envApiKeyName(code: AiProviderCode): string {
  return ENV_NAME[code];
}

export function envApiKeyFor(code: AiProviderCode): string | null {
  const value = process.env[ENV_NAME[code]]?.trim();
  return value || null;
}

/**
 * Photo reads stay on Gemini. Groq's default chat model and OpenRouter's
 * free router are not document OCR — a free content-safety model can return
 * text, get recorded as success, and the upload still looks unread.
 */
export function envProviderCodes(hasImage: boolean): readonly AiProviderCode[] {
  if (hasImage) return ["gemini"];
  return AI_PROVIDER_CODES;
}
