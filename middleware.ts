import { type NextRequest } from "next/server";

import { createTimer } from "@/lib/performance/timer";
import { updateSession } from "@/integrations/supabase/middleware";

export async function middleware(request: NextRequest) {
  const timer = createTimer("middleware", request.nextUrl.pathname);
  const response = await updateSession(request);
  timer.end();
  return response;
}

export const config = {
  matcher: [
    /*
     * Page navigations only — API routes authenticate via withAuthRouteRequest;
     * static assets and fonts skip middleware getUser (~200ms saved per API call).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|ico|woff|woff2|ttf|eot)$).*)",
  ],
};
