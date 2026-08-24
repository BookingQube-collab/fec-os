import type { AiProviderCatalog, AiProviderCode } from "@/lib/ai/types";

export const AI_PROVIDER_CATALOG: Record<AiProviderCode, AiProviderCatalog> = {
  gemini: {
    code: "gemini",
    displayName: "Google Gemini",
    description:
      "Powerful multimodal AI for text, reasoning, coding, documents, images.",
    docsUrl: "https://ai.google.dev/gemini-api/docs/api-key",
    keysUrl: "https://aistudio.google.com/apikey",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    defaultModel: "gemini-flash-latest",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    extraModels: [
      { id: "gemini-flash-latest", displayName: "Gemini Flash (latest)" },
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash-Lite" },
      { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
    ],
  },
  groq: {
    code: "groq",
    displayName: "Groq",
    description: "High-speed inference for chat, text, classification, automation.",
    docsUrl: "https://console.groq.com/docs/openai",
    keysUrl: "https://console.groq.com/keys",
    pricingUrl: "https://groq.com/pricing",
    defaultModel: "llama-3.3-70b-versatile",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    extraModels: [
      { id: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B Versatile" },
      { id: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B Instant" },
    ],
  },
  openrouter: {
    code: "openrouter",
    displayName: "OpenRouter",
    description: "Unified API to many models including free variants.",
    docsUrl: "https://openrouter.ai/docs/api-reference/overview",
    keysUrl: "https://openrouter.ai/keys",
    pricingUrl: "https://openrouter.ai/models",
    defaultModel: "openrouter/free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    extraModels: [
      { id: "openrouter/free", displayName: "OpenRouter Free" },
      { id: "openrouter/auto", displayName: "OpenRouter Auto" },
    ],
  },
};

export function catalogFor(code: AiProviderCode): AiProviderCatalog {
  return AI_PROVIDER_CATALOG[code];
}

export function openRouterHeaders(): Record<string, string> {
  const referer =
    process.env.AI_HTTP_REFERER?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://fec-os.local";
  return {
    "HTTP-Referer": referer,
    "X-Title": "FEC-OS",
  };
}
