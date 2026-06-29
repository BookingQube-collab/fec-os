import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { processDocumentExpiryNotifications } from "@/lib/compliance/document-notifications";
import { validateCronRequest } from "@/lib/server/cron-auth";

/** Cron-safe endpoint: processes document expiry notifications. */
export async function POST(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  const sb = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  try {
    const result = await processDocumentExpiryNotifications(sb);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
