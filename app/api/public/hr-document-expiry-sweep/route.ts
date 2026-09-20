import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { runHrDocumentExpirySweep } from "@/lib/hr-document-expiry-sweep";
import { validateCronRequest } from "@/lib/server/cron-auth";

/** Secret-guarded daily HR document expiry reminder sweep (escalation-sweep pattern). */
export async function POST(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  const sb = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  try {
    const result = await runHrDocumentExpirySweep(sb);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sweep failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
