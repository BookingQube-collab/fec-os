import { type NextRequest } from "next/server";

import { updateSession } from "@/integrations/supabase/middleware";

const PAGE_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "SAMEORIGIN"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Content-Security-Policy", "frame-ancestors 'self'"],
];

function withPageSecurityHeaders<T extends { headers: Headers }>(response: T): T {
  for (const [name, value] of PAGE_SECURITY_HEADERS) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  return withPageSecurityHeaders(await updateSession(request));
}

export const config = {
  matcher: [
    /*
     * Page navigations only. Skip Edge work for:
     * - Next internals (_next/*)
     * - API (withAuthRouteRequest) and ADMS iclock
     * - PWA worker / favicon / common static extensions
     */
    "/((?!_next/|favicon.ico|api/|iclock/|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|ico|woff|woff2|ttf|eot|css|js|map|txt|xml|json)$).*)",
  ],
};
