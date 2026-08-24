import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function recordAiUsage(input: {
  provider: string;
  model: string;
  moduleSource?: string;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs: number;
}): Promise<void> {
  const usageDate = new Date().toISOString().slice(0, 10);
  const moduleSource = input.moduleSource || "unknown";
  const { data: existing } = await supabaseAdmin
    .from("ai_usage_daily")
    .select("id, success_count, fail_count, input_tokens, output_tokens, estimated_cost_usd, latency_ms_total")
    .eq("usage_date", usageDate)
    .eq("provider_code", input.provider)
    .eq("model", input.model)
    .eq("module_source", moduleSource)
    .maybeSingle();

  const row = existing as
    | {
        id: string;
        success_count: number;
        fail_count: number;
        input_tokens: number;
        output_tokens: number;
        estimated_cost_usd: number;
        latency_ms_total: number;
      }
    | null;

  if (row) {
    const { error } = await supabaseAdmin
      .from("ai_usage_daily")
      .update({
        success_count: row.success_count + (input.success ? 1 : 0),
        fail_count: row.fail_count + (input.success ? 0 : 1),
        input_tokens: row.input_tokens + (input.inputTokens ?? 0),
        output_tokens: row.output_tokens + (input.outputTokens ?? 0),
        estimated_cost_usd: Number(row.estimated_cost_usd) + (input.estimatedCostUsd ?? 0),
        latency_ms_total: row.latency_ms_total + input.latencyMs,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from("ai_usage_daily").insert({
    usage_date: usageDate,
    provider_code: input.provider,
    model: input.model,
    module_source: moduleSource,
    success_count: input.success ? 1 : 0,
    fail_count: input.success ? 0 : 1,
    input_tokens: input.inputTokens ?? 0,
    output_tokens: input.outputTokens ?? 0,
    estimated_cost_usd: input.estimatedCostUsd ?? 0,
    latency_ms_total: input.latencyMs,
  } as never);
  if (error) throw error;
}
