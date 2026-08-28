import { type NextRequest } from "next/server";

import { updateSession } from "@/integrations/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
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
