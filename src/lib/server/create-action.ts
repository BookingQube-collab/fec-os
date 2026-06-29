import { z, type ZodTypeAny } from "zod";

import type { Capability } from "@/lib/rbac";
import { createTimer } from "@/lib/performance/timer";

import { getAuthenticatedContext, type AuthContext } from "./auth";
import {
  ForbiddenError,
  requireAnyCapability,
  requireCapability,
  requireRoleLevel,
  requireRolesAssigned,
  UnauthorizedError,
} from "./authorize";

export type { AuthContext };

export type ActionAuthOptions = {
  /** Require at least one of these capabilities */
  anyCapability?: Capability[];
  /** Require this specific capability */
  capability?: Capability;
  /** Require minimum role level (uses current_user_role_level RPC) */
  minRoleLevel?: number;
  /** Require user has at least one role assigned (default: true) */
  requireRole?: boolean;
};

export type SafeActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "forbidden" | "unauthorized" | "validation" | "error" };

function validationMessage(error: z.ZodError): string {
  return error.errors.map((e) => e.message).join("; ") || "Validation failed";
}

function toSafeActionError(e: unknown): SafeActionResult<never> {
  if (e instanceof ForbiddenError) {
    return { ok: false, error: e.message, code: "forbidden" };
  }
  if (e instanceof UnauthorizedError || (e instanceof Error && e.message === "Unauthorized")) {
    return { ok: false, error: "Unauthorized", code: "unauthorized" };
  }
  if (e instanceof z.ZodError) {
    return { ok: false, error: validationMessage(e), code: "validation" };
  }
  const msg = e instanceof Error ? e.message : "Something went wrong";
  return { ok: false, error: msg, code: "error" };
}

async function runAuthenticatedAction<TSchema extends ZodTypeAny, TResult>(
  schema: TSchema,
  handler: (data: z.infer<TSchema>, context: AuthContext) => Promise<TResult>,
  input: unknown,
  options?: { defaultInput?: unknown; auth?: ActionAuthOptions },
): Promise<TResult> {
  const data = schema.parse(input ?? options?.defaultInput ?? {});
  const context = await getAuthenticatedContext();
  await enforceActionAuth(context, options?.auth);
  return handler(data, context);
}

export async function enforceActionAuth(context: AuthContext, auth?: ActionAuthOptions) {
  const timer = createTimer("enforceActionAuth", auth?.capability ?? "rbac");
  const opts = { requireRole: true, ...auth };
  try {
    if (opts.requireRole) await requireRolesAssigned(context);
    if (opts.capability) await requireCapability(context, opts.capability);
    if (opts.anyCapability?.length) await requireAnyCapability(context, opts.anyCapability);
    if (opts.minRoleLevel != null) await requireRoleLevel(context, opts.minRoleLevel);
    timer.end({ rowCount: context.roles?.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    timer.end({ error: msg });
    throw e;
  }
}

export function createAuthenticatedAction<TSchema extends ZodTypeAny, TResult>(
  schema: TSchema,
  handler: (data: z.infer<TSchema>, context: AuthContext) => Promise<TResult>,
  options?: { defaultInput?: unknown; auth?: ActionAuthOptions },
) {
  return async (input?: unknown): Promise<TResult> => {
    const actionTimer = createTimer("server-action", handler.name || "anonymous");
    try {
      const result = await runAuthenticatedAction(schema, handler, input, options);
      actionTimer.end({ rowCount: Array.isArray(result) ? result.length : undefined });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      actionTimer.end({ error: msg });
      throw e;
    }
  };
}

/** Like createAuthenticatedAction but returns `{ ok, data | error }` instead of throwing auth/validation errors (avoids 500 POST). */
export function createSafeAuthenticatedAction<TSchema extends ZodTypeAny, TResult>(
  schema: TSchema,
  handler: (data: z.infer<TSchema>, context: AuthContext) => Promise<TResult>,
  options?: { defaultInput?: unknown; auth?: ActionAuthOptions },
) {
  return async (input?: unknown): Promise<SafeActionResult<TResult>> => {
    const actionTimer = createTimer("server-action", handler.name || "anonymous");
    try {
      const result = await runAuthenticatedAction(schema, handler, input, options);
      actionTimer.end({ rowCount: Array.isArray(result) ? result.length : undefined });
      return { ok: true, data: result };
    } catch (e) {
      const safe = toSafeActionError(e);
      actionTimer.end({ error: safe.ok ? undefined : safe.error });
      return safe;
    }
  };
}

export function createAuthenticatedActionNoInput<TResult>(
  handler: (context: AuthContext) => Promise<TResult>,
  options?: { auth?: ActionAuthOptions },
) {
  return async (): Promise<TResult> => {
    const actionTimer = createTimer("server-action", handler.name || "no-input");
    try {
      const context = await getAuthenticatedContext();
      await enforceActionAuth(context, options?.auth);
      const result = await handler(context);
      actionTimer.end({ rowCount: Array.isArray(result) ? result.length : undefined });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      actionTimer.end({ error: msg });
      throw e;
    }
  };
}
