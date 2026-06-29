import { NextResponse } from "next/server";

import { createTimer } from "@/lib/performance/timer";

type RouteHandler = (request: Request, context?: unknown) => Promise<Response> | Response;

function routeNameFromRequest(request: Request): string {
  try {
    const { pathname } = new URL(request.url);
    return pathname;
  } catch {
    return "unknown-route";
  }
}

/** Wraps an App Router route handler with request-level timing logs. */
export function withPerfLog(handler: RouteHandler, name?: string): RouteHandler {
  return async (request: Request, context?: unknown) => {
    const routeName = name ?? routeNameFromRequest(request);
    const timer = createTimer(routeName, "route-handler");
    try {
      const response = await handler(request, context);
      const rowCountHeader = response.headers.get("x-perf-row-count");
      timer.end({
        rowCount: rowCountHeader ? Number(rowCountHeader) : undefined,
        error: response.ok ? undefined : `status=${response.status}`,
      });
      return response;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      timer.end({ error: msg });
      throw e;
    }
  };
}

/** Helper for JSON API routes that know result row count. */
export function jsonWithPerfRows<T>(data: T, rowCount?: number, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data, init);
  if (rowCount != null) res.headers.set("x-perf-row-count", String(rowCount));
  return res;
}
