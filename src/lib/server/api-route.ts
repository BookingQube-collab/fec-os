import { NextResponse } from "next/server";

import { ApiValidationError } from "@/core/api/validation";
import { logger } from "@/core/logger";
import { createTimer } from "@/lib/performance/timer";
import { ForbiddenError } from "@/lib/server/authorize";
import { getAuthenticatedContext } from "@/lib/server/auth";
import { enforceActionAuth, type ActionAuthOptions } from "@/lib/server/create-action";
import { toRouteResponse } from "@/lib/server/route-response";

function routeLabel(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "api";
  }
}

function rowCountFromResult(result: unknown): number | undefined {
  if (result == null) return undefined;
  if (Array.isArray(result)) return result.length;
  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items.length;
    if (typeof obj.total === "number") return obj.total;
  }
  return undefined;
}

/** Postgrest often throws plain `{ message, details, code }` objects — not `Error`. */
function routeErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const msg = (e as { message: string }).message.trim();
    const details =
      "details" in e && typeof (e as { details: unknown }).details === "string"
        ? (e as { details: string }).details.trim()
        : "";
    const code = "code" in e && typeof (e as { code: unknown }).code === "string" ? (e as { code: string }).code : "";
    if (!msg) return "Something went wrong";
    // Avoid leaking connection strings / keys if a driver ever puts them in details.
    const safeDetails = details && !/(password|secret|apikey|token|bearer)/i.test(details) ? details : "";
    if (safeDetails && !msg.includes(safeDetails)) {
      return code ? `${msg} (${code}): ${safeDetails}` : `${msg}: ${safeDetails}`;
    }
    return msg;
  }
  if (e instanceof Error && e.message.trim()) return e.message;
  return "Something went wrong";
}

async function runAuthRoute<T>(
  handler: (context: Awaited<ReturnType<typeof getAuthenticatedContext>>, request: Request) => Promise<T>,
  request: Request,
  auth?: ActionAuthOptions,
): Promise<NextResponse> {
  const route = routeLabel(request);
  const routeTimer = createTimer(route, "api-route");
  try {
    const authTimer = createTimer(route, "getAuthenticatedContext");
    const context = await getAuthenticatedContext();
    authTimer.end({ rowCount: 1 });

    const rbacTimer = createTimer(route, "enforceActionAuth");
    await enforceActionAuth(context, auth);
    rbacTimer.end({ rowCount: context.roles?.length });

    const handlerTimer = createTimer(route, "handler");
    const result = await handler(context, request);
    const rows = rowCountFromResult(result);
    handlerTimer.end({ rowCount: rows });
    routeTimer.end({ rowCount: rows });
    return toRouteResponse(result);
  } catch (e) {
    const msg = routeErrorMessage(e);
    routeTimer.end({ error: msg });
    if (msg === "Unauthorized" || (e instanceof Error && e.name === "UnauthorizedError")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof ApiValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logger.error("api", msg, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function withAuthRoute<T>(
  handler: (context: Awaited<ReturnType<typeof getAuthenticatedContext>>, request: Request) => Promise<T>,
  auth?: ActionAuthOptions,
): Promise<NextResponse> {
  return runAuthRoute(handler, new Request("http://local"), auth);
}

export async function withAuthRouteRequest<T>(
  handler: (context: Awaited<ReturnType<typeof getAuthenticatedContext>>, request: Request) => Promise<T>,
  request: Request,
  auth?: ActionAuthOptions,
): Promise<NextResponse> {
  return runAuthRoute(handler, request, auth);
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

/** Primary API route wrapper: auth → authorization → handler(request). */
export const createApiRoute = withAuthRouteRequest;

/** API route wrapper for handlers that do not need the Request object. */
export const createApiRouteStatic = withAuthRoute;
