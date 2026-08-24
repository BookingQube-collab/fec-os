import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./types";

/**
 * Page-gate only: read/refresh the cookie session locally.
 * `getSession()` is cookie + JWT expiry (and refresh when expired).
 * Do not call `getUser()` here — that hits the Auth API on every navigation
 * (~300–2000ms). API routes still validate with `getUser()` via withAuth.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authenticated = Boolean(session?.access_token);

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/auth") || pathname.startsWith("/reset-password");
  const isPublicApi = pathname.startsWith("/api/public") || pathname.startsWith("/iclock");
  const isProtected = !isAuthRoute && !isPublicApi && pathname !== "/favicon.ico";

  if (isProtected && !authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
