import { NextResponse } from "next/server";

import { validateCronRequest } from "@/lib/server/cron-auth";

/**
 * Advance sequential queue offers past offer_ring_seconds (~15s) and enforce
 * max_wait. Needed when no agent softphone is open to poll.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> or x-cron-secret.
 * Ops: hit every 5s from an external cron (Vercel cron is minute-granularity).
 */
export async function POST(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  try {
    const { enforceQueueWaitTimeouts } = await import("@/lib/call-center/routing");
    const result = await enforceQueueWaitTimeouts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "queue timeout sweep failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
