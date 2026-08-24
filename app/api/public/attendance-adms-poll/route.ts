import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { queueAdmsAttlogQueryForAll } from "@/lib/attendance-hr/adms-ingest";
import { validateCronRequest } from "@/lib/server/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  const hoursRaw = Number(new URL(request.url).searchParams.get("hours") ?? 24);
  const hours = Number.isFinite(hoursRaw) ? Math.min(168, Math.max(1, hoursRaw)) : 24;

  try {
    const result = await queueAdmsAttlogQueryForAll(supabaseAdmin, hours);
    return NextResponse.json({ ok: true, hours, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/** Vercel Cron (GET) and manual/external schedulers (POST). */
export function GET(request: Request) {
  return run(request);
}

export function POST(request: Request) {
  return run(request);
}
