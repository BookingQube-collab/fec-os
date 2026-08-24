import "server-only";

import type { Json } from "@/integrations/supabase/types";
import type { AuthContext } from "@/lib/server/auth";
import { decryptSecret, encryptSecret, lastFourOfKey, maskApiKey } from "@/lib/ai/crypto";
import { catalogFor } from "@/lib/ai/catalog";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { listModels, testConnection } from "@/lib/ai/gateway";
import { buildAuditAfter } from "@/lib/ai/sanitize";
import {
  getProviderRow,
  getRoutingSettings,
  listProviderRows,
  listUsage,
  saveRoutingSettings,
  toPublicConfig,
  upsertProviderRow,
} from "@/lib/ai/store";
import type { AiProviderCode, AiRoutingSettings } from "@/lib/ai/types";
import { envApiKeyFor } from "@/lib/ai/env-keys";
import { dropFromRouting, eligibleForRouting, normalizeApiKey } from "@/lib/ai/validation";

function resolveApiKey(existingEncrypted: string | null | undefined, incoming?: string): string | null {
  const fromForm = normalizeApiKey(incoming);
  if (fromForm) return fromForm;
  if (existingEncrypted) return decryptSecret(existingEncrypted);
  return null;
}

export async function hydrateProviderKeysFromEnv(): Promise<void> {
  if (!process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim()) return;
  const rows = await listProviderRows();
  for (const row of rows) {
    if (row.encrypted_api_key) continue;
    const fromEnv = envApiKeyFor(row.provider_code);
    if (!fromEnv) continue;
    await upsertProviderRow({
      provider_code: row.provider_code,
      display_name: row.display_name,
      encrypted_api_key: encryptSecret(fromEnv),
      key_last_four: lastFourOfKey(fromEnv),
      connection_status: "untested",
      last_test_result: "Key imported from server env — test connection before using as primary.",
      last_tested_at: null,
    });
  }
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
}

export async function writeAiAudit(
  context: AuthContext,
  input: {
    action: string;
    rowId?: string;
    after?: Record<string, unknown>;
    ip?: string | null;
    result: "success" | "failure";
    provider?: AiProviderCode | string;
  },
) {
  await context.supabase.rpc("log_audit", {
    _action: input.action,
    _table_name: "ai_provider_configs",
    _row_id: input.rowId,
    _after: buildAuditAfter(input.after ?? {}) as Json,
    _metadata: buildAuditAfter({
      ip: input.ip ?? null,
      result: input.result,
      provider: input.provider ?? null,
    }) as Json,
  });
}

export async function loadAiIntegrationsSnapshot() {
  try {
    await hydrateProviderKeysFromEnv();
  } catch {
    /* tables may not exist until db:push */
  }
  const [rows, routing, usage] = await Promise.all([
    listProviderRows(),
    getRoutingSettings(),
    listUsage(30),
  ]);
  const providers = rows.map((row) => {
    const publicRow = toPublicConfig(row);
    return {
      ...publicRow,
      routing_eligible: eligibleForRouting({
        enabled: row.enabled,
        connection_status: row.connection_status,
        has_key: Boolean(row.encrypted_api_key),
      }),
    };
  });
  return {
    providers,
    routing: routing.settings,
    usage,
    catalog: (["gemini", "groq", "openrouter"] as const).map((code) => {
      const item = catalogFor(code);
      return {
        code: item.code,
        displayName: item.displayName,
        description: item.description,
        docsUrl: item.docsUrl,
        keysUrl: item.keysUrl,
        pricingUrl: item.pricingUrl,
        defaultModel: item.defaultModel,
      };
    }),
    encryption_configured: Boolean(process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim()),
    cost_is_estimate: true,
  };
}

export async function saveProviderConfig(input: {
  provider_code: AiProviderCode;
  api_key?: string;
  selected_model?: string | null;
  base_url?: string | null;
  enabled?: boolean;
  userId: string;
}) {
  const existing = await getProviderRow(input.provider_code);
  const incomingKey = normalizeApiKey(input.api_key);
  const catalog = catalogFor(input.provider_code);
  const hadKey = Boolean(existing?.encrypted_api_key);

  const patch: Parameters<typeof upsertProviderRow>[0] = {
    provider_code: input.provider_code,
    display_name: existing?.display_name || catalog.displayName,
    selected_model: input.selected_model ?? existing?.selected_model ?? catalog.defaultModel,
    base_url: input.base_url ?? existing?.base_url ?? catalog.defaultBaseUrl,
    updated_by: input.userId,
    created_by: existing?.created_by ?? input.userId,
  };

  if (incomingKey) {
    patch.encrypted_api_key = encryptSecret(incomingKey);
    patch.key_last_four = lastFourOfKey(incomingKey);
    patch.connection_status = "untested";
    patch.last_test_result = "Key replaced — test connection before this provider can be used as primary.";
    patch.last_tested_at = null;
  }

  if (input.enabled != null) {
    patch.enabled = input.enabled;
    if (!input.enabled && existing?.connection_status === "connected") {
      patch.connection_status = "disabled";
    }
    if (input.enabled && existing?.encrypted_api_key && existing.connection_status === "disabled") {
      patch.connection_status = existing.last_tested_at ? "untested" : "untested";
    }
  }

  const saved = await upsertProviderRow(patch);
  return {
    provider: toPublicConfig(saved),
    key_replaced: Boolean(incomingKey) && hadKey,
    key_masked: incomingKey ? maskApiKey(incomingKey) : toPublicConfig(saved).key_masked,
  };
}

export async function testProviderConfig(input: {
  provider_code: AiProviderCode;
  api_key?: string;
  userId: string;
}) {
  const existing = await getProviderRow(input.provider_code);
  const apiKey =
    resolveApiKey(existing?.encrypted_api_key, input.api_key) ?? envApiKeyFor(input.provider_code);
  if (!apiKey) throw new Error("No API key is configured for this provider.");

  const result = await testConnection(input.provider_code, apiKey, existing?.base_url);
  const now = new Date().toISOString();
  const models = result.ok ? result.models ?? [] : ((existing?.config_json.models as never) ?? []);

  const saved = await upsertProviderRow({
    provider_code: input.provider_code,
    display_name: existing?.display_name || catalogFor(input.provider_code).displayName,
    connection_status: result.ok ? "connected" : "failed",
    last_tested_at: now,
    last_test_result: result.ok ? "Connection succeeded." : result.error,
    config_json: {
      ...(existing?.config_json ?? {}),
      models,
    },
    updated_by: input.userId,
  });

  return {
    ok: result.ok,
    error: result.error,
    models,
    provider: toPublicConfig(saved),
  };
}

export async function refreshProviderModels(input: {
  provider_code: AiProviderCode;
  userId: string;
}) {
  const existing = await getProviderRow(input.provider_code);
  const apiKey = resolveApiKey(existing?.encrypted_api_key) ?? envApiKeyFor(input.provider_code);
  if (!apiKey) throw new Error("Save an API key before refreshing models.");
  const models = await listModels(input.provider_code, apiKey, existing?.base_url);
  const saved = await upsertProviderRow({
    provider_code: input.provider_code,
    config_json: { ...(existing?.config_json ?? {}), models },
    updated_by: input.userId,
  });
  return { models, provider: toPublicConfig(saved) };
}

export async function setProviderEnabled(input: {
  provider_code: AiProviderCode;
  enabled: boolean;
  userId: string;
}) {
  const existing = await getProviderRow(input.provider_code);
  if (!existing) throw new Error("Provider is not configured.");
  let routing = (await getRoutingSettings()).settings;
  const nextStatus = !input.enabled
    ? existing.encrypted_api_key
      ? ("disabled" as const)
      : ("not_configured" as const)
    : existing.encrypted_api_key
      ? existing.connection_status === "connected"
        ? ("connected" as const)
        : ("untested" as const)
      : ("not_configured" as const);

  if (!input.enabled) {
    routing = dropFromRouting(routing, input.provider_code);
    await saveRoutingSettings(routing, input.userId);
  }

  const saved = await upsertProviderRow({
    provider_code: input.provider_code,
    enabled: input.enabled,
    connection_status: nextStatus,
    updated_by: input.userId,
  });
  return { provider: toPublicConfig(saved), routing };
}

export async function removeProviderKey(input: { provider_code: AiProviderCode; userId: string }) {
  const existing = await getProviderRow(input.provider_code);
  if (!existing) throw new Error("Provider is not configured.");
  const routing = dropFromRouting((await getRoutingSettings()).settings, input.provider_code);
  await saveRoutingSettings(routing, input.userId);
  const saved = await upsertProviderRow({
    provider_code: input.provider_code,
    encrypted_api_key: null,
    key_last_four: null,
    enabled: false,
    connection_status: "not_configured",
    last_test_result: "API key removed.",
    last_tested_at: null,
    config_json: { ...(existing.config_json ?? {}), models: [] },
    updated_by: input.userId,
  });
  return { provider: toPublicConfig(saved), routing };
}

export async function updateRouting(input: AiRoutingSettings, userId: string) {
  const rows = await listProviderRows();
  const eligible = new Set(
    rows
      .filter((row) =>
        eligibleForRouting({
          enabled: row.enabled,
          connection_status: row.connection_status,
          has_key: Boolean(row.encrypted_api_key),
        }),
      )
      .map((row) => row.provider_code),
  );
  const assign = (code: AiProviderCode | null) => (code && eligible.has(code) ? code : null);
  const next: AiRoutingSettings = {
    ...input,
    primary: assign(input.primary),
    secondary: assign(input.secondary),
    tertiary: assign(input.tertiary),
  };
  return saveRoutingSettings(next, userId);
}

export function usageWithEstimates<T extends { estimated_cost_usd: number; model: string; input_tokens: number; output_tokens: number }>(
  rows: T[],
) {
  return rows.map((row) => ({
    ...row,
    estimated_cost_usd:
      row.estimated_cost_usd ||
      estimateCostUsd({
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      }) ||
      0,
    cost_is_estimate: true,
  }));
}
