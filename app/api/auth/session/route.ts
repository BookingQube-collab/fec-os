import { NextResponse } from "next/server";

import { createTimer } from "@/lib/performance/timer";
import { withPerfLog } from "@/lib/performance/with-perf-log";
import { fetchAuthSession } from "@/lib/queries/auth-session.core";
import { getAuthenticatedContext } from "@/lib/server/auth";

async function getSessionHandler() {
  const routeTimer = createTimer("/api/auth/session", "route-handler");
  try {
    const authTimer = createTimer("/api/auth/session", "getAuthenticatedContext");
    const context = await getAuthenticatedContext();
    authTimer.end({ rowCount: 1 });

    const queryTimer = createTimer("/api/auth/session", "fetchAuthSession");
    const session = await fetchAuthSession(context);
    queryTimer.end({ rowCount: session.roles.length });
    routeTimer.end({ rowCount: session.roles.length });
    return NextResponse.json(session);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized") {
      routeTimer.end({ error: "Unauthorized" });
      return NextResponse.json({ user: null, profile: null, roles: [] }, { status: 401 });
    }
    console.error("[auth/session]", msg, e);
    routeTimer.end({ error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withPerfLog(getSessionHandler, "/api/auth/session");
