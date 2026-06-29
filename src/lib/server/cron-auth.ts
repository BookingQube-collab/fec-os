import { NextResponse } from "next/server";

/**
 * Validates cron/webhook requests using a shared secret.
 * Accepts Authorization: Bearer <secret> or x-cron-secret header.
 * Falls back to legacy apikey header only when CRON_SECRET is not configured.
 */
export function validateCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const cronHeader = request.headers.get("x-cron-secret");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = bearer ?? cronHeader;

    if (!token || token !== cronSecret) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return null;
  }

  // Legacy fallback — log warning in production
  const apikey = request.headers.get("apikey");
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!apikey || apikey !== publishableKey) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return null;
}
