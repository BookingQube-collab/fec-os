import "server-only";

import { catalogFor } from "@/lib/ai/catalog";
import { decryptSecret } from "@/lib/ai/crypto";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { ProviderCallError, asProviderError } from "@/lib/ai/provider-error";
import { providerGenerate, providerListModels, providerTestConnection } from "@/lib/ai/providers";
import { buildFallbackChain, decideAfterFailure, isOverMonthlyLimit } from "@/lib/ai/routing";
import { getProviderRow, getRoutingSettings, isPrimaryEligible, listProviderRows } from "@/lib/ai/store";
import {
  AI_PROVIDER_CODES,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiModelOption,
  type AiProviderCode,
  type AiProviderPublicConfig,
} from "@/lib/ai/types";
import { monthSpendUsd, toPublicConfig } from "@/lib/ai/store";
import { recordAiUsage } from "@/lib/ai/usage";
import { envApiKeyFor } from "@/lib/ai/env-keys";

export { toPublicConfig };

type CallOptions = AiGenerateRequest & { jsonMode?: boolean };

async function envFallbackGenerate(request: CallOptions): Promise<AiGenerateResult | null> {
  for (const code of AI_PROVIDER_CODES) {
    const apiKey = envApiKeyFor(code);
    if (!apiKey) continue;
    try {
      const catalog = catalogFor(code);
      const result = await providerGenerate(
        code,
        { apiKey, model: request.model || catalog.defaultModel },
        request,
      );
      result.estimatedCostUsd = estimateCostUsd({
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      await recordAiUsage({
        provider: code,
        model: result.model,
        moduleSource: request.moduleSource,
        success: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        latencyMs: result.latencyMs,
      }).catch(() => undefined);
      return result;
    } catch {
      /* try next env provider */
    }
  }

  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const attempts: Array<{
    url: string;
    headers: Record<string, string>;
    model: string;
    jsonMode?: boolean;
    provider: "env_fallback";
  }> = [];
  if (lovableKey) {
    attempts.push({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      model: process.env.LOVABLE_MODEL ?? "google/gemini-2.5-flash",
      provider: "env_fallback",
    });
  }
  if (openaiKey) {
    attempts.push({
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      jsonMode: true,
      provider: "env_fallback",
    });
  }
  if (!attempts.length) return null;

  const timeoutMs = request.timeoutMs ?? 30_000;
  for (const attempt of attempts) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(attempt.url, {
        method: "POST",
        headers: attempt.headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: attempt.model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : m.content.filter((p) => p.type === "text").map((p) => p.text).join("\n"),
          })),
          temperature: request.temperature ?? 0.3,
          ...(attempt.jsonMode || request.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      }).finally(() => clearTimeout(timer));
      if (!res.ok) continue;
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content;
      if (!text) continue;
      return {
        text,
        provider: "env_fallback",
        model: attempt.model,
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
        latencyMs: Date.now() - started,
      };
    } catch {
      /* try next env provider */
    }
  }
  return null;
}

async function resolveChain(): Promise<{
  codes: AiProviderCode[];
  timeoutMs: number;
  maxRetries: number;
  autoFallback: boolean;
}> {
  const [{ settings }, rows] = await Promise.all([getRoutingSettings(), listProviderRows()]);
  const totalSpend = await monthSpendUsd();
  const candidates = await Promise.all(
    rows.map(async (row) => {
      const providerLimit = settings.provider_monthly_limits[row.provider_code];
      const providerSpend = providerLimit != null ? await monthSpendUsd(row.provider_code) : 0;
      return {
        provider: row.provider_code,
        eligible: isPrimaryEligible(row),
        overLimit:
          isOverMonthlyLimit(totalSpend, settings.monthly_limit_usd) ||
          isOverMonthlyLimit(providerSpend, providerLimit),
      };
    }),
  );
  return {
    codes: buildFallbackChain(settings, candidates),
    timeoutMs: settings.timeout_ms,
    maxRetries: settings.max_retries,
    autoFallback: settings.auto_fallback,
  };
}

async function callConfigured(
  request: CallOptions,
): Promise<AiGenerateResult | null> {
  const chain = await resolveChain();
  let lastError: ProviderCallError | null = null;

  for (let i = 0; i < chain.codes.length; i++) {
    const code = chain.codes[i];
    const row = await getProviderRow(code);
    if (!row?.encrypted_api_key) continue;
    let apiKey: string;
    try {
      apiKey = decryptSecret(row.encrypted_api_key);
    } catch {
      lastError = new ProviderCallError("invalid", "Stored credential could not be decrypted");
      continue;
    }
    const catalog = catalogFor(code);
    const model = request.model || row.selected_model || catalog.defaultModel;
    const timeoutMs = request.timeoutMs ?? chain.timeoutMs;

    for (let attempt = 0; attempt <= chain.maxRetries; attempt++) {
      const started = Date.now();
      try {
        const result = await providerGenerate(
          code,
          { apiKey, baseUrl: row.base_url, model },
          { ...request, timeoutMs, model },
        );
        result.estimatedCostUsd = estimateCostUsd({
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        await recordAiUsage({
          provider: code,
          model: result.model,
          moduleSource: request.moduleSource,
          success: true,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: result.estimatedCostUsd,
          latencyMs: result.latencyMs,
        }).catch(() => undefined);
        return result;
      } catch (error) {
        const mapped = asProviderError(error);
        lastError = mapped;
        await recordAiUsage({
          provider: code,
          model,
          moduleSource: request.moduleSource,
          success: false,
          latencyMs: Date.now() - started,
        }).catch(() => undefined);
        const decision = decideAfterFailure({
          kind: mapped.kind,
          attempt,
          maxRetries: chain.maxRetries,
          autoFallback: chain.autoFallback,
          hasNext: i < chain.codes.length - 1,
        });
        if (decision.action === "retry_same") continue;
        if (decision.action === "fallback") break;
        if (decision.action === "stop" && mapped.kind === "auth") throw mapped;
        if (decision.action === "stop") break;
      }
    }
  }

  if (lastError && chain.codes.length && lastError.kind === "auth") throw lastError;
  return null;
}

export async function generateText(request: AiGenerateRequest): Promise<AiGenerateResult> {
  const configured = await callConfigured(request);
  if (configured) return configured;
  const env = await envFallbackGenerate(request);
  if (env) return env;
  throw new ProviderCallError("invalid", "No AI provider is configured or reachable.");
}

export async function generateStructuredOutput(request: AiGenerateRequest): Promise<AiGenerateResult> {
  return generateText({ ...request, jsonMode: true });
}

export async function analyzeImage(
  request: AiGenerateRequest & { prompt?: string },
): Promise<AiGenerateResult> {
  const hasImage = request.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image"),
  );
  if (!hasImage) {
    throw new ProviderCallError("invalid", "analyzeImage requires at least one image part.");
  }
  return generateText(request);
}

export async function testConnection(
  provider: AiProviderCode,
  apiKey: string,
  baseUrl?: string | null,
): Promise<{ ok: boolean; error?: string; models?: AiModelOption[] }> {
  const catalog = catalogFor(provider);
  const result = await providerTestConnection(
    provider,
    { apiKey, baseUrl, model: catalog.defaultModel },
    20_000,
  );
  if (result.ok) return { ok: true, models: result.models };
  return { ok: false, error: result.error };
}

export async function listModels(
  provider: AiProviderCode,
  apiKey: string,
  baseUrl?: string | null,
): Promise<AiModelOption[]> {
  const catalog = catalogFor(provider);
  return providerListModels(provider, { apiKey, baseUrl, model: catalog.defaultModel });
}

export async function getProviderStatus(): Promise<AiProviderPublicConfig[]> {
  const rows = await listProviderRows();
  return rows.map(toPublicConfig);
}

export async function hasConfiguredPrimary(): Promise<boolean> {
  const { settings } = await getRoutingSettings();
  if (!settings.primary) return false;
  const row = await getProviderRow(settings.primary);
  return row ? isPrimaryEligible(row) : false;
}
