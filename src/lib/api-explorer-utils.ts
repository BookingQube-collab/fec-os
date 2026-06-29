import type { ApiAuthType } from "@/lib/api-catalog";

const PROXY_AUTH_TYPES = new Set<ApiAuthType>(["api_key", "cron_secret"]);

/** Endpoints whose secrets are injected server-side via /api/admin/api-explorer/try */
export function usesApiExplorerProxy(authType: ApiAuthType): boolean {
  return PROXY_AUTH_TYPES.has(authType);
}
