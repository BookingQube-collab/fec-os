import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { validateCronRequest } from "@/lib/server/cron-auth";

export async function POST(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  const sb = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await sb.rpc("run_escalation_sweep");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, created: (data ?? []).length });
}
