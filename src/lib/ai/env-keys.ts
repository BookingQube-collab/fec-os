import type { AiProviderCode } from "@/lib/ai/types";

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
