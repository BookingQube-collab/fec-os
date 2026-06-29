import { NextResponse } from "next/server";

import {
  buildProxiedAuthHeaders,
  buildProxyTargetUrl,
  isHttpMethod,
  validateProxyTryRequest,
} from "@/lib/server/api-explorer-proxy";
import { getAuthenticatedContext } from "@/lib/server/auth";
import { enforceActionAuth } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";

type TryBody = {
  endpointId?: string;
  method?: string;
  path?: string;
  query?: string;
  headers?: Record<string, string>;
  body?: string;
};

export async function POST(request: Request) {
  try {
    const context = await getAuthenticatedContext();
    await enforceActionAuth(context, { capability: "admin.view" });

    let payload: TryBody;
    try {
      payload = (await request.json()) as TryBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { endpointId, method, path, query, headers = {}, body } = payload;

    if (!endpointId || !method || !path) {
      return NextResponse.json(
        { error: "endpointId, method, and path are required" },
        { status: 400 },
      );
    }

    if (!isHttpMethod(method)) {
      return NextResponse.json({ error: "Invalid HTTP method" }, { status: 400 });
    }

    const validated = validateProxyTryRequest({ endpointId, method, path });
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: validated.status });
    }

    const authHeaders = buildProxiedAuthHeaders(validated.endpoint, headers);
    if (!authHeaders.ok) {
      return NextResponse.json({ error: authHeaders.error }, { status: authHeaders.status });
    }

    const targetUrl = buildProxyTargetUrl(request, path, query);
    const init: RequestInit = {
      method,
      headers: authHeaders.headers,
    };

    if (method !== "GET" && method !== "DELETE" && body?.trim()) {
      init.body = body;
    }

    const started = Date.now();
    const upstream = await fetch(targetUrl, init);
    const rawBody = await upstream.text();
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return NextResponse.json({
      ok: true,
      response: {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
        body: rawBody,
        durationMs: Date.now() - started,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized" || (e instanceof Error && e.name === "UnauthorizedError")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
