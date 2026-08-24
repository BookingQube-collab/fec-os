import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { catalogFor } from "@/lib/ai/catalog";
import {
  DEFAULT_AI_ROUTING,
  type AiConnectionStatus,
  type AiModelOption,
  type AiProviderCode,
  type AiProviderPublicConfig,
  type AiProviderRow,
  type AiRoutingSettings,
  type AiUsageRow,
} from "@/lib/ai/types";
import { maskFromLastFour } from "@/lib/ai/crypto";
import { eligibleForRouting } from "@/lib/ai/validation";

const CONFIG_TABLE = "ai_provider_configs";
const ROUTING_TABLE = "ai_routing_settings";
const USAGE_TABLE = "ai_usage_daily";

function asRow(raw: Record<string, unknown>): AiProviderRow {
  const config = (raw.config_json as Record<string, unknown> | null) ?? {};
  return {
    id: String(raw.id),
    provider_code: raw.provider_code as AiProviderCode,
    display_name: String(raw.display_name ?? ""),
    encrypted_api_key: (raw.encrypted_api_key as string | null) ?? null,
    key_last_four: (raw.key_last_four as string | null) ?? null,
    selected_model: (raw.selected_model as string | null) ?? null,
    base_url: (raw.base_url as string | null) ?? null,
    enabled: Boolean(raw.enabled),
    connection_status: (raw.connection_status as AiConnectionStatus) ?? "not_configured",
    last_tested_at: (raw.last_tested_at as string | null) ?? null,
    last_test_result: (raw.last_test_result as string | null) ?? null,
    config_json: config,
    created_by: (raw.created_by as string | null) ?? null,
    updated_by: (raw.updated_by as string | null) ?? null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export function toPublicConfig(row: AiProviderRow): AiProviderPublicConfig {
  const catalog = catalogFor(row.provider_code);
  const cached = Array.isArray(row.config_json.models)
    ? (row.config_json.models as AiModelOption[])
    : [];
  const models = cached.length ? cached : catalog.extraModels;
  return {
    id: row.id,
    provider_code: row.provider_code,
    display_name: row.display_name || catalog.displayName,
    key_last_four: row.key_last_four,
    key_masked: maskFromLastFour(row.key_last_four),
    selected_model: row.selected_model || catalog.defaultModel,
    base_url: row.base_url || catalog.defaultBaseUrl,
    enabled: row.enabled,
    connection_status: row.connection_status,
    last_tested_at: row.last_tested_at,
    last_test_result: row.last_test_result,
    models,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listProviderRows(): Promise<AiProviderRow[]> {
  const { data, error } = await supabaseAdmin
    .from(CONFIG_TABLE)
    .select("*")
    .order("provider_code");
  if (error) throw error;
  return (data ?? []).map((row) => asRow(row as Record<string, unknown>));
}

export async function getProviderRow(code: AiProviderCode): Promise<AiProviderRow | null> {
  const { data, error } = await supabaseAdmin
    .from(CONFIG_TABLE)
    .select("*")
    .eq("provider_code", code)
    .maybeSingle();
  if (error) throw error;
  return data ? asRow(data as Record<string, unknown>) : null;
}

export async function upsertProviderRow(
  patch: Partial<AiProviderRow> & { provider_code: AiProviderCode },
): Promise<AiProviderRow> {
  const { data, error } = await supabaseAdmin
    .from(CONFIG_TABLE)
    .upsert(
      {
        ...patch,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "provider_code" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return asRow(data as Record<string, unknown>);
}

export async function getRoutingSettings(): Promise<{ id: string; settings: AiRoutingSettings }> {
  const { data, error } = await supabaseAdmin.from(ROUTING_TABLE).select("*").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: created, error: insertErr } = await supabaseAdmin
      .from(ROUTING_TABLE)
      .insert({
        primary_provider: null,
        secondary_provider: null,
        tertiary_provider: null,
        timeout_ms: DEFAULT_AI_ROUTING.timeout_ms,
        max_retries: DEFAULT_AI_ROUTING.max_retries,
        auto_fallback: DEFAULT_AI_ROUTING.auto_fallback,
        monthly_limit_usd: null,
        provider_monthly_limits: {},
      } as never)
      .select("*")
      .single();
    if (insertErr) throw insertErr;
    return { id: String((created as { id: string }).id), settings: DEFAULT_AI_ROUTING };
  }
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    settings: {
      primary: (row.primary_provider as AiProviderCode | null) ?? null,
      secondary: (row.secondary_provider as AiProviderCode | null) ?? null,
      tertiary: (row.tertiary_provider as AiProviderCode | null) ?? null,
      timeout_ms: Number(row.timeout_ms ?? DEFAULT_AI_ROUTING.timeout_ms),
      max_retries: Number(row.max_retries ?? DEFAULT_AI_ROUTING.max_retries),
      auto_fallback: row.auto_fallback !== false,
      monthly_limit_usd: (row.monthly_limit_usd as number | null) ?? null,
      provider_monthly_limits:
        (row.provider_monthly_limits as AiRoutingSettings["provider_monthly_limits"]) ?? {},
    },
  };
}

export async function saveRoutingSettings(
  settings: AiRoutingSettings,
  updatedBy: string,
): Promise<AiRoutingSettings> {
  const existing = await getRoutingSettings();
  const { error } = await supabaseAdmin
    .from(ROUTING_TABLE)
    .update({
      primary_provider: settings.primary,
      secondary_provider: settings.secondary,
      tertiary_provider: settings.tertiary,
      timeout_ms: settings.timeout_ms,
      max_retries: settings.max_retries,
      auto_fallback: settings.auto_fallback,
      monthly_limit_usd: settings.monthly_limit_usd,
      provider_monthly_limits: settings.provider_monthly_limits,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", existing.id);
  if (error) throw error;
  return settings;
}

export async function listUsage(days = 30): Promise<AiUsageRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const { data, error } = await supabaseAdmin
    .from(USAGE_TABLE)
    .select("*")
    .gte("usage_date", since.toISOString().slice(0, 10))
    .order("usage_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const success = Number(row.success_count ?? 0);
    const fail = Number(row.fail_count ?? 0);
    const latencyTotal = Number(row.latency_ms_total ?? 0);
    const calls = success + fail;
    return {
      usage_date: String(row.usage_date ?? ""),
      provider_code: String(row.provider_code ?? ""),
      model: String(row.model ?? ""),
      module_source: String(row.module_source ?? ""),
      success_count: success,
      fail_count: fail,
      input_tokens: Number(row.input_tokens ?? 0),
      output_tokens: Number(row.output_tokens ?? 0),
      estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
      latency_ms_total: latencyTotal,
      avg_latency_ms: calls > 0 ? Math.round(latencyTotal / calls) : 0,
    };
  });
}

export async function monthSpendUsd(provider?: AiProviderCode): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  let query = supabaseAdmin
    .from(USAGE_TABLE)
    .select("estimated_cost_usd, provider_code")
    .gte("usage_date", start.toISOString().slice(0, 10));
  if (provider) query = query.eq("provider_code", provider);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number((row as { estimated_cost_usd?: number }).estimated_cost_usd ?? 0), 0);
}

export function publicStatusOf(row: AiProviderRow): AiConnectionStatus {
  if (!row.encrypted_api_key) return "not_configured";
  if (!row.enabled) return "disabled";
  return row.connection_status;
}

export function isPrimaryEligible(row: AiProviderRow): boolean {
  return eligibleForRouting({
    enabled: row.enabled,
    connection_status: row.connection_status,
    has_key: Boolean(row.encrypted_api_key),
  });
}
