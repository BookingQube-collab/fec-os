import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { validateCronRequest } from "@/lib/server/cron-auth";

/**
 * Middleware-ready attendance sync endpoint (ZKTeco / biometric devices).
 * POST /api/public/attendance-sync
 *
 * Body: { location_id, device_code, records: [{ biometric_user_id, punch_at, punch_type }] }
 */
export async function POST(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const sb = createClient<Database>(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: {
    location_id?: string;
    device_code?: string;
    records?: Array<{ biometric_user_id: string; punch_at: string; punch_type?: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.location_id || !Array.isArray(body.records)) {
    return NextResponse.json({ ok: false, error: "location_id and records required" }, { status: 400 });
  }

  let deviceId: string | null = null;
  if (body.device_code) {
    const { data: device } = await sb
      .from("attendance_devices")
      .select("id")
      .eq("location_id", body.location_id)
      .eq("device_code", body.device_code)
      .maybeSingle();
    deviceId = device?.id ?? null;
  }

  const { data: job } = await sb
    .from("attendance_sync_jobs")
    .insert({
      device_id: deviceId,
      location_id: body.location_id,
      status: "processing",
      records_received: body.records.length,
    })
    .select("id")
    .single();

  let processed = 0;
  const errors: string[] = [];

  for (const rec of body.records) {
    if (!rec.biometric_user_id || !rec.punch_at) {
      errors.push("missing biometric_user_id or punch_at");
      continue;
    }

    const { data: staff } = await sb
      .from("staff")
      .select("id, user_id")
      .eq("location_id", body.location_id)
      .eq("employee_code", rec.biometric_user_id)
      .maybeSingle();

    const { error } = await sb.from("attendance_logs").insert({
      location_id: body.location_id,
      device_id: deviceId,
      staff_id: staff?.id ?? null,
      user_id: staff?.user_id ?? null,
      biometric_user_id: rec.biometric_user_id,
      punch_at: new Date(rec.punch_at).toISOString(),
      punch_type: (rec.punch_type ?? "in").toLowerCase(),
      source: "device_sync",
      raw_payload: rec,
    });

    if (error) errors.push(error.message);
    else processed += 1;
  }

  if (deviceId) {
    await sb.from("attendance_devices").update({ last_sync_at: new Date().toISOString() }).eq("id", deviceId);
  }

  if (job?.id) {
    await sb
      .from("attendance_sync_jobs")
      .update({
        status: errors.length ? "partial" : "completed",
        records_processed: processed,
        error_message: errors.length ? errors.slice(0, 5).join("; ") : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  return NextResponse.json({ ok: true, processed, received: body.records.length, errors: errors.length });
}
