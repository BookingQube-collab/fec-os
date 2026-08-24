import { z } from "zod";

import { AI_PROVIDER_CODES, type AiProviderCode, type AiRoutingSettings } from "@/lib/ai/types";

export const providerCodeSchema = z.enum(AI_PROVIDER_CODES);

export const upsertProviderSchema = z.object({
  provider_code: providerCodeSchema,
  api_key: z.string().max(4000).optional(),
  selected_model: z.string().max(200).optional().nullable(),
  base_url: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
});

export const testProviderSchema = z.object({
  provider_code: providerCodeSchema,
  api_key: z.string().max(4000).optional(),
});

export const modelsProviderSchema = z.object({
  provider_code: providerCodeSchema,
});

export const enableProviderSchema = z.object({
  provider_code: providerCodeSchema,
  enabled: z.boolean(),
});

export const removeKeySchema = z.object({
  provider_code: providerCodeSchema,
});

export const routingSchema = z
  .object({
    primary: providerCodeSchema.nullable(),
    secondary: providerCodeSchema.nullable(),
    tertiary: providerCodeSchema.nullable(),
    timeout_ms: z.number().int().min(3_000).max(120_000),
    max_retries: z.number().int().min(0).max(3),
    auto_fallback: z.boolean(),
    monthly_limit_usd: z.number().min(0).max(1_000_000).nullable(),
    provider_monthly_limits: z
      .record(providerCodeSchema, z.number().min(0).max(1_000_000))
      .optional()
      .default({}),
  })
  .superRefine((value, ctx) => {
    const chain = [value.primary, value.secondary, value.tertiary].filter(
      (code): code is AiProviderCode => code != null,
    );
    const seen = new Set<AiProviderCode>();
    for (const code of chain) {
      if (seen.has(code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A provider cannot appear more than once in the fallback chain.",
        });
        return;
      }
      seen.add(code);
    }
  });

export function normalizeApiKey(raw: string | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("•")) return null;
  if (trimmed.length < 8) {
    throw new Error("API key is too short.");
  }
  return trimmed;
}

export function replaceKeyResetsStatus(hadKey: boolean, incomingKey: string | null): boolean {
  return Boolean(incomingKey) && hadKey;
}

export function eligibleForRouting(input: {
  enabled: boolean;
  connection_status: string;
  has_key: boolean;
}): boolean {
  return input.enabled && input.has_key && input.connection_status === "connected";
}

export function dropFromRouting(
  routing: AiRoutingSettings,
  provider: AiProviderCode,
): AiRoutingSettings {
  const next: AiRoutingSettings = { ...routing, provider_monthly_limits: { ...routing.provider_monthly_limits } };
  if (next.primary === provider) next.primary = null;
  if (next.secondary === provider) next.secondary = null;
  if (next.tertiary === provider) next.tertiary = null;
  return next;
}
