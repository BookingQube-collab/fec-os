import "server-only";

import { catalogFor, openRouterHeaders } from "@/lib/ai/catalog";
import { decryptSecret } from "@/lib/ai/crypto";
import { envApiKeyFor } from "@/lib/ai/env-keys";
import { getProviderRow } from "@/lib/ai/store";
import type { AiProviderCode } from "@/lib/ai/types";
import { recordAiUsage } from "@/lib/ai/usage";

const EMBED_MODEL = "openai/text-embedding-3-small";
const GEMINI_EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 1536;
const BATCH = 32;

async function resolveStoredKey(code: AiProviderCode): Promise<string | null> {
  try {
    const row = await getProviderRow(code);
    if (!row?.encrypted_api_key) return envApiKeyFor(code);
    try {
      return decryptSecret(row.encrypted_api_key);
    } catch {
      return envApiKeyFor(code);
    }
  } catch {
    return envApiKeyFor(code);
  }
}

async function embedOpenAiCompatible(
  url: string,
  headers: Record<string, string>,
  texts: string[],
): Promise<number[][] | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vectors = json.data?.map((d) => d.embedding).filter((v): v is number[] => Array.isArray(v));
    if (!vectors || vectors.length !== texts.length) return null;
    return vectors;
  } catch {
    return null;
  }
}

async function embedGemini(apiKey: string, texts: string[]): Promise<number[][] | null> {
  const base = catalogFor("gemini").defaultBaseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${GEMINI_EMBED_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBED_DIMS,
        })),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { embeddings?: Array<{ values?: number[] }> };
    const vectors = json.embeddings?.map((e) => e.values).filter((v): v is number[] => Array.isArray(v));
    if (!vectors || vectors.length !== texts.length) return null;
    return vectors;
  } catch {
    return null;
  }
}

async function embedBatch(texts: string[], moduleSource: string): Promise<number[][]> {
  const openrouterKey = await resolveStoredKey("openrouter");
  if (openrouterKey) {
    const vectors = await embedOpenAiCompatible(
      `${catalogFor("openrouter").defaultBaseUrl.replace(/\/$/, "")}/embeddings`,
      { Authorization: `Bearer ${openrouterKey}`, ...openRouterHeaders() },
      texts,
    );
    if (vectors) {
      await recordAiUsage({
        provider: "openrouter",
        model: EMBED_MODEL,
        moduleSource,
        success: true,
        inputTokens: texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0),
        latencyMs: 0,
      }).catch(() => undefined);
      return vectors;
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const vectors = await embedOpenAiCompatible(
      "https://api.openai.com/v1/embeddings",
      { Authorization: `Bearer ${openaiKey}` },
      texts,
    );
    if (vectors) return vectors;
  }

  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  if (lovableKey) {
    const vectors = await embedOpenAiCompatible(
      "https://ai.gateway.lovable.dev/v1/embeddings",
      { "Lovable-API-Key": lovableKey },
      texts,
    );
    if (vectors) return vectors;
  }

  const geminiKey = await resolveStoredKey("gemini");
  if (geminiKey) {
    const vectors = await embedGemini(geminiKey, texts);
    if (vectors) {
      await recordAiUsage({
        provider: "gemini",
        model: GEMINI_EMBED_MODEL,
        moduleSource,
        success: true,
        inputTokens: texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0),
        latencyMs: 0,
      }).catch(() => undefined);
      return vectors;
    }
  }

  throw new Error("AI embeddings unavailable — configure OpenRouter or Gemini in Admin → AI Integrations.");
}

export async function embedTexts(
  texts: string[],
  moduleSource = "kb.embed",
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH), moduleSource)));
  }
  return out;
}
