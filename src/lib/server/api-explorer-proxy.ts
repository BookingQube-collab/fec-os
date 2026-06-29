import "server-only";

import {
  API_ENDPOINTS,
  type ApiEndpoint,
  type HttpMethod,
} from "@/lib/api-catalog";
import { usesApiExplorerProxy } from "@/lib/api-explorer-utils";

const PLACEHOLDER_RE = /<[A-Z0-9_]+>/i;

export function findApiExplorerEndpoint(endpointId: string): ApiEndpoint | undefined {
  return API_ENDPOINTS.find((e) => e.id === endpointId);
}

function stripAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "x-api-key" || lower === "x-cron-secret") {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function hasPlaceholderAuth(headers: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      (lower === "authorization" || lower === "x-api-key" || lower === "x-cron-secret") &&
      PLACEHOLDER_RE.test(value)
    ) {
      return true;
    }
  }
  return false;
}

export type ProxyAuthResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; status: number; error: string };

export function buildProxiedAuthHeaders(
  endpoint: ApiEndpoint,
  clientHeaders: Record<string, string>,
): ProxyAuthResult {
  if (!usesApiExplorerProxy(endpoint.authType)) {
    return { ok: false, status: 400, error: "Endpoint does not use server-side proxy auth" };
  }

  let headers = stripAuthHeaders(clientHeaders);

  if (endpoint.authType === "api_key") {
    const apiKey = process.env.ATTENDANCE_INGEST_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        status: 503,
        error: "ATTENDANCE_INGEST_API_KEY not configured on server",
      };
    }
    headers = { ...headers, "X-API-Key": apiKey };
  } else if (endpoint.authType === "cron_secret") {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return { ok: false, status: 503, error: "CRON_SECRET not configured on server" };
    }
    headers = { ...headers, Authorization: `Bearer ${cronSecret}` };
  }

  if (hasPlaceholderAuth(headers)) {
    return { ok: false, status: 400, error: "Auth headers still contain unresolved placeholders" };
  }

  return { ok: true, headers };
}

export function buildProxyTargetUrl(request: Request, path: string, query?: string): string {
  const origin = new URL(request.url).origin;
  const url = new URL(path, origin);
  if (query?.trim()) {
    const params = new URLSearchParams(query);
    params.forEach((value, key) => url.searchParams.set(key, value));
  }
  return url.toString();
}

export function validateProxyTryRequest(input: {
  endpointId: string;
  method: string;
  path: string;
}): { endpoint: ApiEndpoint } | { error: string; status: number } {
  const endpoint = findApiExplorerEndpoint(input.endpointId);
  if (!endpoint) {
    return { error: "Unknown endpoint", status: 400 };
  }

  if (!usesApiExplorerProxy(endpoint.authType)) {
    return { error: "Endpoint is not eligible for proxy auth", status: 400 };
  }

  if (endpoint.method !== input.method) {
    return { error: "Method does not match catalog endpoint", status: 400 };
  }

  if (endpoint.path !== input.path) {
    return { error: "Path does not match catalog endpoint", status: 400 };
  }

  if (!input.path.startsWith("/api/")) {
    return { error: "Invalid target path", status: 400 };
  }

  return { endpoint };
}

export function isHttpMethod(value: string): value is HttpMethod {
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value);
}
