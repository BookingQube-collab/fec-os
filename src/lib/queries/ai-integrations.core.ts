import "server-only";

import { ApiValidationError, parseWithSchema } from "@/core/api/validation";
import {
  clientIp,
  loadAiIntegrationsSnapshot,
  refreshProviderModels,
  removeProviderKey,
  saveProviderConfig,
  setProviderEnabled,
  testProviderConfig,
  updateRouting,
  writeAiAudit,
} from "@/lib/ai/admin";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import {
  enableProviderSchema,
  modelsProviderSchema,
  removeKeySchema,
  routingSchema,
  testProviderSchema,
  upsertProviderSchema,
} from "@/lib/ai/validation";
import type { AuthContext } from "@/lib/server/auth";

function enforceRateLimit(userId: string, action: string) {
  const result = checkRateLimit({
    key: `ai:${action}:${userId}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!result.ok) {
    throw new ApiValidationError("Too many AI integration requests. Wait a minute and try again.");
  }
}

export async function fetchAiIntegrations(_context: AuthContext) {
  return loadAiIntegrationsSnapshot();
}

export async function upsertAiProvider(context: AuthContext, request: Request) {
  enforceRateLimit(context.userId, "save");
  const body = parseWithSchema(upsertProviderSchema, await request.json().catch(() => null));
  const result = await saveProviderConfig({ ...body, userId: context.userId });
  await writeAiAudit(context, {
    action: body.api_key ? "ai.provider_key_saved" : "ai.provider_updated",
    rowId: result.provider.id,
    provider: body.provider_code,
    result: "success",
    ip: clientIp(request),
    after: {
      provider_code: body.provider_code,
      selected_model: result.provider.selected_model,
      enabled: result.provider.enabled,
      connection_status: result.provider.connection_status,
      key_last_four: result.provider.key_last_four,
      key_replaced: result.key_replaced,
    },
  });
  return result;
}

export async function testAiProvider(context: AuthContext, request: Request) {
  enforceRateLimit(context.userId, "test");
  const body = parseWithSchema(testProviderSchema, await request.json().catch(() => null));
  const result = await testProviderConfig({ ...body, userId: context.userId });
  await writeAiAudit(context, {
    action: "ai.provider_tested",
    rowId: result.provider.id,
    provider: body.provider_code,
    result: result.ok ? "success" : "failure",
    ip: clientIp(request),
    after: {
      provider_code: body.provider_code,
      ok: result.ok,
      connection_status: result.provider.connection_status,
    },
  });
  return result;
}

export async function refreshAiModels(context: AuthContext, request: Request) {
  enforceRateLimit(context.userId, "models");
  const body = parseWithSchema(modelsProviderSchema, await request.json().catch(() => null));
  const result = await refreshProviderModels({ ...body, userId: context.userId });
  await writeAiAudit(context, {
    action: "ai.provider_models_refreshed",
    rowId: result.provider.id,
    provider: body.provider_code,
    result: "success",
    ip: clientIp(request),
    after: { provider_code: body.provider_code, model_count: result.models.length },
  });
  return result;
}

export async function enableAiProvider(context: AuthContext, request: Request) {
  const body = parseWithSchema(enableProviderSchema, await request.json().catch(() => null));
  const result = await setProviderEnabled({ ...body, userId: context.userId });
  await writeAiAudit(context, {
    action: body.enabled ? "ai.provider_enabled" : "ai.provider_disabled",
    rowId: result.provider.id,
    provider: body.provider_code,
    result: "success",
    ip: clientIp(request),
    after: { provider_code: body.provider_code, enabled: body.enabled },
  });
  return result;
}

export async function removeAiProviderKey(context: AuthContext, request: Request) {
  const body = parseWithSchema(removeKeySchema, await request.json().catch(() => null));
  const result = await removeProviderKey({ ...body, userId: context.userId });
  await writeAiAudit(context, {
    action: "ai.provider_key_removed",
    rowId: result.provider.id,
    provider: body.provider_code,
    result: "success",
    ip: clientIp(request),
    after: { provider_code: body.provider_code },
  });
  return result;
}

export async function updateAiRouting(context: AuthContext, request: Request) {
  const body = parseWithSchema(routingSchema, await request.json().catch(() => null));
  const routing = await updateRouting(body, context.userId);
  await writeAiAudit(context, {
    action: "ai.routing_updated",
    provider: routing.primary ?? undefined,
    result: "success",
    ip: clientIp(request),
    after: {
      primary: routing.primary,
      secondary: routing.secondary,
      tertiary: routing.tertiary,
      timeout_ms: routing.timeout_ms,
      max_retries: routing.max_retries,
      auto_fallback: routing.auto_fallback,
    },
  });
  return { routing };
}
