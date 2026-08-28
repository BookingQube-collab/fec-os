import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge page-gate only — no @supabase/ssr / supabase-js.
 *
 * Full SSR client (~90 kB) + Auth refresh on every navigation caused
 * MIDDLEWARE_INVOCATION_TIMEOUT on Vercel (Hobby ~1s). API routes still
 * validate with getUser()/getClaims via withAuth; the browser client
 * refreshes tokens after navigation.
 *
 * Authenticated = cookie session with a non-expired access_token, or a
 * refresh_token (client/API will refresh). No network I/O here.
 */

const AUTH_COOKIE_RE = /auth-token$/;
const AUTH_CHUNK_RE = /auth-token\.\d+$/;
const BASE64_PREFIX = "base64-";
/** Allow slight clock skew before treating access JWT as expired. */
const EXP_SKEW_SEC = 30;

type CookiePair = { name: string; value: string };

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  try {
    // Edge / modern runtimes
    if (typeof atob === "function") {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
  } catch {
    /* fall through */
  }
  return "";
}

function decodeCookiePayload(raw: string): string {
  if (raw.startsWith(BASE64_PREFIX)) {
    return decodeBase64Url(raw.slice(BASE64_PREFIX.length));
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function combineAuthCookies(cookies: CookiePair[]): string | null {
  const singles = cookies.filter((c) => AUTH_COOKIE_RE.test(c.name) && !AUTH_CHUNK_RE.test(c.name));
  if (singles.length > 0) {
    // Prefer the longest value (chunked sessions sometimes leave a stale short cookie).
    const best = singles.reduce((a, b) => (a.value.length >= b.value.length ? a : b));
    return decodeCookiePayload(best.value);
  }

  const chunks = cookies
    .filter((c) => AUTH_CHUNK_RE.test(c.name))
    .map((c) => {
      const idx = Number(c.name.slice(c.name.lastIndexOf(".") + 1));
      return { idx, value: c.value, base: c.name.replace(/\.\d+$/, "") };
    })
    .filter((c) => Number.isFinite(c.idx));

  if (chunks.length === 0) return null;

  // Group by base name in case multiple projects' cookies exist.
  const byBase = new Map<string, { idx: number; value: string }[]>();
  for (const c of chunks) {
    const list = byBase.get(c.base) ?? [];
    list.push({ idx: c.idx, value: c.value });
    byBase.set(c.base, list);
  }

  let bestJoined = "";
  for (const list of byBase.values()) {
    list.sort((a, b) => a.idx - b.idx);
    const joined = list.map((c) => c.value).join("");
    if (joined.length > bestJoined.length) bestJoined = joined;
  }

  return bestJoined ? decodeCookiePayload(bestJoined) : null;
}

function readJwtExp(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const json = decodeBase64Url(parts[1] ?? "");
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function hasUsableSession(request: NextRequest): boolean {
  const all = request.cookies.getAll();
  // Fast path: no auth-looking cookie at all.
  if (!all.some((c) => c.name.includes("auth-token") && c.value.length > 10)) {
    return false;
  }

  const raw = combineAuthCookies(all);
  if (!raw) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Non-JSON cookie still indicates a session was written; let client reconcile.
    return raw.length > 20;
  }

  if (!parsed || typeof parsed !== "object") return false;
  const session = parsed as {
    access_token?: unknown;
    refresh_token?: unknown;
  };

  const refresh =
    typeof session.refresh_token === "string" && session.refresh_token.length > 0;
  const access =
    typeof session.access_token === "string" && session.access_token.length > 0;

  if (!access && !refresh) return false;
  if (!access) return refresh;

  const exp = readJwtExp(session.access_token as string);
  if (exp == null) {
    // Opaque access token — trust presence; client/API will validate.
    return true;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (exp > nowSec - EXP_SKEW_SEC) return true;
  // Access expired: still authenticated if refresh can recover the session.
  return refresh;
}

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/auth") || pathname.startsWith("/reset-password");
  const isPublicApi = pathname.startsWith("/api/public") || pathname.startsWith("/iclock");
  const isProtected = !isAuthRoute && !isPublicApi && pathname !== "/favicon.ico";

  const authenticated = hasUsableSession(request);

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
