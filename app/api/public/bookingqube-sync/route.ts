import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncBookingQubeRevenueToDb } from "@/lib/bookingqube-sync";
import { validateCronRequest } from "@/lib/server/cron-auth";

/** Cron-ready: POST /api/public/bookingqube-sync */
export async function POST(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let from: string | undefined;
  let to: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      if (typeof (body as { from?: unknown }).from === "string") from = (body as { from: string }).from;
      if (typeof (body as { to?: unknown }).to === "string") to = (body as { to: string }).to;
    }
  } catch {
    // empty body — default range
  }

  try {
    const result = await syncBookingQubeRevenueToDb(supabaseAdmin, { from, to });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
