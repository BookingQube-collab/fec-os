import { catalogFor, openRouterHeaders } from "@/lib/ai/catalog";
import {
  geminiGenerationConfig,
  geminiImageReadModel,
  geminiVisibleText,
  imageThinkingOffAttempts,
  shouldRetryImageThinking,
  type ImageThinkingOff,
} from "@/lib/ai/gemini-vision";
import { ProviderCallError, asProviderError } from "@/lib/ai/provider-error";
import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiMessage,
  AiModelOption,
  AiProviderCode,
} from "@/lib/ai/types";

export type ProviderCallContext = {
  apiKey: string;
  baseUrl?: string | null;
  model: string;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw asProviderError(error);
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.slice(0, 800);
}

function normalizeMessages(messages: AiMessage[]): AiMessage[] {
  return messages.map((message) => {
    if (typeof message.content === "string") return message;
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === "text" ? part : { type: "image" as const, mimeType: part.mimeType, data: part.data },
      ),
    };
  });
}

function geminiContents(messages: AiMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : m.content.filter((p) => p.type === "text").map((p) => p.text).join("\n")))
    .filter(Boolean)
    .join("\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const role = m.role === "assistant" ? "model" : "user";
      const parts: Array<Record<string, unknown>> = [];
      if (typeof m.content === "string") {
        parts.push({ text: m.content });
      } else {
        for (const part of m.content) {
          if (part.type === "text") parts.push({ text: part.text });
          else {
            parts.push({
              inline_data: { mime_type: part.mimeType, data: part.data },
            });
          }
        }
      }
      return { role, parts };
    });

  return { system, contents };
}

function requestHasImage(request: AiGenerateRequest): boolean {
  return request.messages.some(
    (message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image"),
  );
}

async function geminiGenerateOnce(
  ctx: ProviderCallContext,
  request: AiGenerateRequest,
  thinkingOff: ImageThinkingOff,
): Promise<AiGenerateResult> {
  const started = Date.now();
  const catalog = catalogFor("gemini");
  const base = (ctx.baseUrl || catalog.defaultBaseUrl).replace(/\/$/, "");
  const model = ctx.model.replace(/^models\//, "");
  const { system, contents } = geminiContents(normalizeMessages(request.messages));
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": ctx.apiKey,
      },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: geminiGenerationConfig({
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          jsonMode: request.jsonMode,
          thinkingOff,
        }),
      }),
    },
    request.timeoutMs ?? 30_000,
  );
  if (!res.ok) throw ProviderCallError.fromHttp(res.status, await readErrorBody(res));
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = geminiVisibleText(json.candidates?.[0]?.content?.parts);
  if (!text) throw new ProviderCallError("invalid", "Empty model response");
  return {
    text,
    provider: "gemini",
    model,
    inputTokens: json.usageMetadata?.promptTokenCount,
    outputTokens: json.usageMetadata?.candidatesTokenCount,
    latencyMs: Date.now() - started,
  };
}

async function geminiGenerate(
  ctx: ProviderCallContext,
  request: AiGenerateRequest,
): Promise<AiGenerateResult> {
  if (!requestHasImage(request)) return geminiGenerateOnce(ctx, request, "on");

  const preferred = geminiImageReadModel(ctx.model);
  const models = [...new Set([preferred, "gemini-flash-latest"])];
  let lastError: unknown;
  for (const model of models) {
    const attempts = imageThinkingOffAttempts(model);
    let tryNextModel = false;
    for (let i = 0; i < attempts.length; i += 1) {
      try {
        return await geminiGenerateOnce({ ...ctx, model }, request, attempts[i]!);
      } catch (error) {
        lastError = error;
        const retryThinking =
          i < attempts.length - 1 &&
          error instanceof ProviderCallError &&
          shouldRetryImageThinking({ status: error.status, message: error.message });
        if (retryThinking) continue;
        tryNextModel = error instanceof ProviderCallError && error.kind === "unavailable_model";
        if (tryNextModel) break;
        throw error;
      }
    }
    if (!tryNextModel) break;
  }
  throw lastError;
}

async function geminiListModels(ctx: ProviderCallContext, timeoutMs: number): Promise<AiModelOption[]> {
  const catalog = catalogFor("gemini");
  const base = (ctx.baseUrl || catalog.defaultBaseUrl).replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/models`,
    { headers: { "X-goog-api-key": ctx.apiKey } },
    timeoutMs,
  );
  if (!res.ok) throw ProviderCallError.fromHttp(res.status, await readErrorBody(res));
  const json = (await res.json()) as { models?: { name?: string; displayName?: string }[] };
  return (json.models ?? [])
    .map((m) => {
      const id = (m.name ?? "").replace(/^models\//, "");
      return { id, displayName: m.displayName || id };
    })
    .filter((m) => m.id);
}

function toOpenAiMessages(messages: AiMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const content = m.content.map((part) =>
      part.type === "text"
        ? { type: "text" as const, text: part.text }
        : {
            type: "image_url" as const,
            image_url: { url: `data:${part.mimeType};base64,${part.data}` },
          },
    );
    return { role: m.role, content };
  });
}

async function openaiCompatibleGenerate(
  provider: "groq" | "openrouter",
  ctx: ProviderCallContext,
  request: AiGenerateRequest,
): Promise<AiGenerateResult> {
  const started = Date.now();
  const catalog = catalogFor(provider);
  const base = (ctx.baseUrl || catalog.defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ctx.apiKey}`,
  };
  if (provider === "openrouter") Object.assign(headers, openRouterHeaders());
  const res = await fetchWithTimeout(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: ctx.model,
        messages: toOpenAiMessages(normalizeMessages(request.messages)),
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    },
    request.timeoutMs ?? 30_000,
  );
  if (!res.ok) throw ProviderCallError.fromHttp(res.status, await readErrorBody(res));
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text) throw new ProviderCallError("invalid", "Empty model response");
  return {
    text,
    provider,
    model: json.model || ctx.model,
    inputTokens: json.usage?.prompt_tokens,
    outputTokens: json.usage?.completion_tokens,
    latencyMs: Date.now() - started,
  };
}

async function openaiCompatibleListModels(
  provider: "groq" | "openrouter",
  ctx: ProviderCallContext,
  timeoutMs: number,
): Promise<AiModelOption[]> {
  const catalog = catalogFor(provider);
  const base = (ctx.baseUrl || catalog.defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${ctx.apiKey}` };
  if (provider === "openrouter") Object.assign(headers, openRouterHeaders());
  const res = await fetchWithTimeout(`${base}/models`, { headers }, timeoutMs);
  if (!res.ok) throw ProviderCallError.fromHttp(res.status, await readErrorBody(res));
  const json = (await res.json()) as { data?: { id?: string; name?: string; owned_by?: string }[] };
  return (json.data ?? [])
    .map((m) => ({ id: m.id ?? "", displayName: m.name || m.id || "", ownedBy: m.owned_by }))
    .filter((m) => m.id);
}

export async function providerGenerate(
  provider: AiProviderCode,
  ctx: ProviderCallContext,
  request: AiGenerateRequest,
): Promise<AiGenerateResult> {
  if (provider === "gemini") return geminiGenerate(ctx, request);
  return openaiCompatibleGenerate(provider, ctx, request);
}

export async function providerListModels(
  provider: AiProviderCode,
  ctx: ProviderCallContext,
  timeoutMs = 20_000,
): Promise<AiModelOption[]> {
  const catalog = catalogFor(provider);
  const listed =
    provider === "gemini"
      ? await geminiListModels(ctx, timeoutMs)
      : await openaiCompatibleListModels(provider, ctx, timeoutMs);
  const merged = new Map<string, AiModelOption>();
  for (const extra of catalog.extraModels) merged.set(extra.id, extra);
  for (const model of listed) merged.set(model.id, model);
  return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function providerTestConnection(
  provider: AiProviderCode,
  ctx: ProviderCallContext,
  timeoutMs = 20_000,
): Promise<{ ok: true; models: AiModelOption[] } | { ok: false; error: string }> {
  try {
    const models = await providerListModels(provider, ctx, timeoutMs);
    return { ok: true, models };
  } catch (error) {
    const listed = asProviderError(error);
    if (listed.kind === "auth") return { ok: false, error: listed.sanitized };
    try {
      await providerGenerate(provider, ctx, {
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        maxTokens: 8,
        temperature: 0,
        timeoutMs,
      });
      return { ok: true, models: catalogFor(provider).extraModels };
    } catch (genError) {
      return { ok: false, error: asProviderError(genError).sanitized };
    }
  }
}
